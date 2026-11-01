"""Evidence-based source health; no model-generated scores or guessed history."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from mcp_common import envelope, public_url, read_connection, rows

STAGES = {'acquisition', 'processing', 'storage', 'publication'}
STATUSES = {'running','received','success','partial','failed','not_configured'}
PRIORITY = {'failing': 0, 'overdue': 1, 'degraded': 2, 'unknown': 3, 'healthy': 4, 'disabled': 5}


def classify(source, now):
    """Precedence is explicit. Missing logical-run evidence never becomes healthy."""
    if source.get('enabled') is False:
        return 'disabled', ['source_disabled']
    interval = source.get('interval_seconds')
    last = source.get('received_at')
    if source.get('latest_run_started_at') and (last is None or source['latest_run_started_at'] > last):
        last = source['latest_run_started_at']
    reasons = []
    status = source.get('latest_run_status') or source.get('status')
    if status == 'failed':
        return 'failing', ['latest_attempt_failed']
    if interval and (last is None or now-last > timedelta(seconds=interval+max(interval,60))):
        return 'overdue', ['expected_activity_missing']
    if source.get('expired_publications', 0):
        return 'degraded', ['publication_expired']
    if status == 'partial' or source.get('failed_runs', 0) or source.get('partial_runs', 0):
        return 'degraded', ['processing_not_consistently_complete']
    if source.get('expected_slots', 0) > source.get('covered_slots', 0):
        return 'degraded', ['scheduled_slots_missing']
    if source.get('unfinished_runs', 0):
        return 'degraded', ['unfinished_logical_runs']
    if not source.get('coverage_since'):
        reasons.append('logical_runs_not_instrumented')
    if not interval:
        reasons.append('cadence_unknown')
    if not source.get('expected_slots'):
        reasons.append('no_complete_observation_slots')
    if source.get('completed_runs', 0) == 0:
        reasons.append('no_completed_logical_runs')
    if reasons:
        return 'unknown', reasons
    return 'healthy', ['observed_expectations_met']


def public_attempt(row):
    return {k: v for k,v in row.items() if k in {
        'received_at','fetched_at','processed_at','http_status','item_count','item_count_unit'} } | {
        'status': row.get('status') if row.get('status') in STATUSES else 'unknown',
        'error_stage': row.get('error_stage') if row.get('error_stage') in STAGES else None,
        'error_code': ('http_' + str(row['http_status']) if row.get('http_status') and row['http_status'] >= 400
                       else 'processing_failed' if row.get('status') == 'failed' else None)}


async def report(pool, *, source_id=None, days=7, offset=0, limit=50, now=None):
    now = now or datetime.now(UTC)
    start = now - timedelta(days=days)
    async with read_connection(pool) as conn:
        sources = await rows(conn, '''WITH ids AS (
            SELECT id FROM collection_sources UNION SELECT source_id FROM collection_observed_sources
            UNION SELECT source_id FROM measurement_definitions UNION SELECT source_id FROM collected_datasets)
            SELECT ids.id AS source_id,s.enabled,s.interval_seconds,s.source_url,
                a.received_at,a.fetched_at,a.processed_at,a.status,a.http_status,a.error_stage,
                a.item_count,a.item_count_unit,c.since AS coverage_since,
                run.status AS latest_run_status,run.started_at AS latest_run_started_at,
                run.finished_at AS latest_run_finished_at,
                (SELECT count(*) FROM collected_datasets d WHERE d.source_id=ids.id AND expires_at <= %s) AS expired_publications,
                (SELECT array_agg(d.dataset ORDER BY d.dataset) FROM collected_datasets d WHERE d.source_id=ids.id) AS datasets
            FROM ids LEFT JOIN collection_sources s ON s.id=ids.id
            LEFT JOIN collection_run_coverage c ON c.source_id=ids.id
            LEFT JOIN LATERAL (SELECT status,started_at,finished_at FROM collection_runs r WHERE r.source_id=ids.id
                ORDER BY started_at DESC LIMIT 1) run ON TRUE
            LEFT JOIN LATERAL (SELECT * FROM collection_attempts a WHERE a.source_id=ids.id
                ORDER BY received_at DESC,id DESC LIMIT 1) a ON TRUE
            WHERE (%s::text IS NULL OR ids.id=%s) ORDER BY ids.id LIMIT %s OFFSET %s''',
            (now, source_id, source_id, limit+1, offset))
        if source_id and not sources:
            raise HTTPException(404, 'Source not found')
        ids = [s['source_id'] for s in sources]
        summaries = await rows(conn, '''SELECT source_id,count(*) FILTER (WHERE finished_at IS NOT NULL) AS completed_runs,
            count(*) FILTER (WHERE status='success' AND finished_at IS NOT NULL) AS successful_runs,
            count(*) FILTER (WHERE status='failed') AS failed_runs,
            count(*) FILTER (WHERE status='partial') AS partial_runs,
            count(*) FILTER (WHERE finished_at IS NULL) AS unfinished_runs,
            max(started_at) AS last_run_started_at,max(finished_at) FILTER (WHERE status='success') AS last_successful_run_at
            FROM collection_runs WHERE source_id=ANY(%s) AND started_at >= %s AND started_at < %s GROUP BY source_id''',
            (ids,start,now))
        # Versioned policy segments; count occupied complete cadence slots, not
        # HTTP retries. The latest tolerance window is deliberately not due yet.
        coverage = await rows(conn, '''WITH policies AS (
            SELECT p.*,lead(effective_at,1,%s) OVER (PARTITION BY source_id ORDER BY effective_at,revision) AS until
            FROM collection_source_policies p WHERE source_id=ANY(%s) AND effective_at < %s),
          bounds AS (SELECT p.*,greatest(p.effective_at,c.since,%s) AS lo,
            least(p.until,%s-make_interval(secs=>p.tolerance_seconds)) AS hi
            FROM policies p JOIN collection_run_coverage c USING(source_id) WHERE enabled),
          slots AS (SELECT *,greatest(0,floor(extract(epoch FROM (hi-lo))/interval_seconds))::bigint AS expected
            FROM bounds WHERE hi>lo)
          SELECT s.source_id,sum(s.expected)::bigint AS expected_slots,
            sum((SELECT count(DISTINCT floor(extract(epoch FROM(r.started_at-s.lo))/s.interval_seconds))
              FROM collection_runs r WHERE r.source_id=s.source_id AND r.started_at >= s.lo
              AND r.started_at < s.lo + make_interval(secs=>(s.expected*s.interval_seconds)::double precision)))::bigint AS covered_slots,
            array_agg(DISTINCT s.revision) AS policy_revisions FROM slots s GROUP BY s.source_id''',
            (now,ids,now,start,now))
        attempts = await rows(conn, '''SELECT source_id,count(*) AS attempts,
            count(*) FILTER (WHERE status='success') AS successful_attempts,
            max(fetched_at) AS last_fetch_success_at,
            max(processed_at) FILTER (WHERE status='success') AS last_processed_at
            FROM collection_attempts WHERE source_id=ANY(%s) AND received_at >= %s AND received_at < %s GROUP BY source_id''',
            (ids,start,now))
    by_id = {}
    for row in summaries + coverage + attempts:
        by_id.setdefault(row['source_id'], {}).update(row)
    for source in sources:
        source.update(by_id.get(source['source_id'], {}))
        source['status'] = source['status'] if source['status'] in STATUSES else 'unknown'
        # An independently newer receipt must not be hidden by an old run.
        if (source['latest_run_finished_at'] is not None and source['received_at'] is not None
                and source['received_at'] > source['latest_run_finished_at']):
            source['latest_run_status'] = None
        source['error_stage'] = source['error_stage'] if source['error_stage'] in STAGES else None
        source['source_url'] = public_url(source['source_url'])
        source['datasets'] = source['datasets'] or []
        source['health'], source['reason_codes'] = classify(source, now)
        complete = source.get('completed_runs',0)
        source['run_success_ratio'] = round(source.get('successful_runs',0)/complete,4) if complete else None
        expected = source.get('expected_slots',0)
        source['schedule_coverage_ratio'] = round(source.get('covered_slots',0)/expected,4) if expected else None
        source['full_window_instrumented'] = bool(source['coverage_since'] and source['coverage_since'] <= start)
    # Keep pagination by source_id stable; priority is an explicit sortable field.
    for source in sources:
        source['priority'] = PRIORITY[source['health']]
    return envelope(sources, limit=limit, offset=offset, start_inclusive=start, end_exclusive=now,
        rule_version='mcp-health-v1',
        interpretation='Cadence-slot coverage is distinct from processing success. Empty and unchanged successful results are allowed. '
        'Attempt-only sources lack logical-run coverage. Dataset mappings list stored publications; absence is not proof of no impact.')


async def history(pool, source_id, *, days=7, offset=0, limit=50):
    start = datetime.now(UTC)-timedelta(days=days)
    async with read_connection(pool) as conn:
        result = await rows(conn, '''SELECT received_at,fetched_at,processed_at,status,http_status,
            item_count,item_count_unit,error_stage FROM collection_attempts
            WHERE source_id=%s AND received_at >= %s ORDER BY received_at DESC,id DESC LIMIT %s OFFSET %s''',
            (source_id,start,limit+1,offset))
    return envelope([public_attempt(row) for row in result], limit=limit, offset=offset,
        source_id=source_id, start_inclusive=start,
        interpretation='Acquisition attempts, possibly including retries; not logical-run success rates.')
