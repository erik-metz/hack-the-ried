"""Bounded, provenance-preserving reads of the environment-v1 contract."""

from datetime import UTC, datetime, timedelta

from dependencies import get_db_pool
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from snapshot_reads import snapshot_predicate

router = APIRouter(prefix="/environment/measurements", tags=["Environment measurements"])


@router.get("")
async def environment_measurements(
    entity_id: str = Query(min_length=1, max_length=256),
    start: datetime | None = None,
    end: datetime | None = None,
    kind: str | None = Query(default=None, pattern="^(observation|model|forecast|derived)$"),
    metric: str | None = Query(default=None, min_length=1, max_length=128),
    limit: int = Query(default=1000, ge=1, le=10000),
    pool=Depends(get_db_pool),
):
    end = end or datetime.now(UTC) + timedelta(days=7)
    start = start or end - timedelta(days=14)
    if start.tzinfo is None or end.tzinfo is None or not start < end:
        raise HTTPException(422, "Use an increasing time range with explicit timezones")
    if end - start > timedelta(days=31):
        raise HTTPException(422, "Time range must not exceed 31 days")
    async with pool.connection() as conn:
        ready = await (await conn.execute(
            "SELECT to_regprocedure('write_environment_measurement(text,text,text,text,text,jsonb,"
            "timestamp with time zone,numeric,bigint,jsonb,text,timestamp with time zone,"
            "timestamp with time zone,text,timestamp with time zone)') IS NOT NULL AS ready"
        )).fetchone()
        if not ready or not ready['ready']:
            raise HTTPException(503, "Environment contract migration is not installed")
        cursor = await conn.execute("""SELECT d.id AS measurement_id,d.entity_id,d.metric,d.unit,
            d.source_id,d.basis,d.dimensions,d.semantics,r.observed_at AS valid_at,
            r.period_start,r.period_end,r.value,r.quality,r.collected_at,r.provenance,r.revision
            FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id
            JOIN readings r ON r.measurement_id=d.id
            WHERE NOT e.is_hidden AND e.entity_type <> 'inaturalist_observation'
                AND d.entity_id=%s AND d.dimensions->>'contract'='environment-v1'
                AND (%s::text IS NULL OR d.dimensions->>'data_kind'=%s)
                AND (%s::text IS NULL OR d.metric=%s)
                AND r.observed_at>=%s AND r.observed_at<%s
            ORDER BY r.observed_at,d.id LIMIT %s""",
            (entity_id, kind, kind, metric, metric, start, end, limit + 1))
        rows = await cursor.fetchall()
    return jsonable_encoder({"items": rows[:limit], "truncated": len(rows) > limit,
                             "start": start, "end": end})


@router.get('/soil')
async def soil_forecasts(pool=Depends(get_db_pool)):
    """Latest stored initialization cycle per municipality; never mix model runs."""
    async with pool.connection() as conn:
        ready = await (await conn.execute("SELECT to_regclass('measurement_definitions') IS NOT NULL AS ready")).fetchone()
        if not ready or not ready['ready']:
            raise HTTPException(503, 'Canonical measurement storage is not installed')
        cursor = await conn.execute("""WITH runs AS (
            SELECT d.entity_id,MAX(d.dimensions->>'issued_at') AS issued_at
            FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id
            JOIN readings r ON r.measurement_id=d.id
            WHERE NOT e.is_hidden AND d.source_id='environment-soil-icon'
                AND d.dimensions->>'contract'='environment-v1'
                AND d.dimensions->>'data_kind'='forecast'
            GROUP BY d.entity_id
        ) SELECT d.entity_id,e.name,e.metadata,d.metric,d.unit,d.dimensions,d.semantics,
            r.observed_at AS valid_at,r.value,r.quality,r.period_start,r.period_end,
            r.collected_at,r.provenance
            FROM runs JOIN measurement_definitions d ON d.entity_id=runs.entity_id
                AND d.dimensions->>'issued_at'=runs.issued_at
            JOIN entities e ON e.id=d.entity_id JOIN readings r ON r.measurement_id=d.id
            WHERE d.source_id='environment-soil-icon' AND d.dimensions->>'contract'='environment-v1'
                AND d.dimensions->>'data_kind'='forecast'
                AND r.observed_at>=date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                AND r.observed_at<(date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+INTERVAL '7 days'
            ORDER BY d.entity_id,r.observed_at,d.metric,d.id LIMIT 10001""")
        rows = await cursor.fetchall()
        checked = await (await conn.execute("SELECT MAX(received_at) AS checked_at FROM collection_attempts WHERE source_id='environment-soil-icon' AND status='success'")).fetchone()
    return jsonable_encoder({'last_checked_at': checked['checked_at'], 'items': rows[:10000], 'truncated': len(rows)>10000, 'as_of': datetime.now(UTC)})


@router.get('/pollen')
async def pollen_forecasts(pool=Depends(get_db_pool)):
    """One complete archived response snapshot; no invented provider issue time."""
    async with pool.connection() as conn:
        ready = await (await conn.execute("SELECT to_regclass('measurement_definitions') IS NOT NULL AS ready")).fetchone()
        if not ready or not ready['ready']:
            raise HTTPException(503, 'Canonical measurement storage is not installed')
        membership = await snapshot_predicate(conn)
        snapshot = await (await conn.execute("""SELECT payload_sha256,received_at FROM collection_attempts
            WHERE source_id='environment-pollen-cams' AND status='success'
            ORDER BY received_at DESC,id DESC LIMIT 1""")).fetchone()
        rows = []
        if snapshot:
            cursor = await conn.execute(f"""SELECT d.entity_id,e.metadata,d.metric,d.unit,d.dimensions,
                r.observed_at AS valid_at,r.value,r.quality,r.collected_at,r.provenance
                FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id
                JOIN readings r ON r.measurement_id=d.id
                WHERE NOT e.is_hidden AND d.source_id='environment-pollen-cams'
                    AND d.dimensions->>'contract'='environment-v1'
                    AND {membership}
                    AND r.observed_at>=(date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
                    AND r.observed_at<(date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+INTERVAL '7 days'
                ORDER BY d.entity_id,r.observed_at,d.id LIMIT 10001""", (snapshot['payload_sha256'],))
            rows = await cursor.fetchall()
    return jsonable_encoder({'items': rows[:10000], 'truncated': len(rows)>10000,
        'as_of': datetime.now(UTC), 'last_checked_at': snapshot['received_at'] if snapshot else None,
        'provider_issue_time': None, 'forecast_identity': 'response_snapshot'})


@router.get('/biodiversity')
async def biodiversity_occurrences(
    limit: int = Query(default=100, ge=1, le=300),
    offset: int = Query(default=0, ge=0, le=3000),
    pool=Depends(get_db_pool),
):
    """Paged records from one bounded GBIF snapshot; counts describe stored data."""
    async with pool.connection() as conn:
        ready = await (await conn.execute("SELECT to_regclass('measurement_definitions') IS NOT NULL AS ready")).fetchone()
        if not ready or not ready['ready']:
            raise HTTPException(503, 'Canonical measurement storage is not installed')
        membership = await snapshot_predicate(conn)
        snapshot = await (await conn.execute("SELECT metadata FROM entities WHERE id='environment:gbif:ried' AND NOT is_hidden")).fetchone()
        if not snapshot:
            return {'items': [], 'snapshot': None, 'stored_records': 0, 'stored_species': 0, 'has_more': False}
        sha = snapshot['metadata']['snapshot_sha256']
        filters = f"""FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id
            JOIN readings r ON r.measurement_id=d.id
            WHERE NOT e.is_hidden AND d.source_id='environment-gbif'
                AND d.metric='occurrence_presence' AND d.dimensions->>'contract'='environment-v1'
                AND {membership}"""
        counts = await (await conn.execute("SELECT COUNT(*) AS records,COUNT(DISTINCT r.provenance->>'speciesKey') AS species " + filters, (sha,))).fetchone()
        rows = await (await conn.execute("SELECT d.entity_id,r.observed_at AS event_day,r.value,r.provenance " + filters + " ORDER BY r.observed_at DESC,d.entity_id LIMIT %s OFFSET %s", (sha,limit+1,offset))).fetchall()
    return jsonable_encoder({'items': rows[:limit], 'snapshot': snapshot['metadata'],
        'stored_records': counts['records'], 'stored_species': counts['species'],
        'has_more': len(rows)>limit, 'offset': offset, 'as_of': datetime.now(UTC)})


@router.get('/discharge')
async def discharge_forecasts(pool=Depends(get_db_pool)):
    """One complete archived response snapshot; no invented provider issue time."""
    async with pool.connection() as conn:
        ready = await (await conn.execute("SELECT to_regclass('measurement_definitions') IS NOT NULL AS ready")).fetchone()
        if not ready or not ready['ready']:
            raise HTTPException(503, 'Canonical measurement storage is not installed')
        membership = await snapshot_predicate(conn)
        snapshot = await (await conn.execute("""SELECT payload_sha256,received_at FROM collection_attempts
            WHERE source_id='environment-discharge-glofas' AND status='success'
            ORDER BY received_at DESC,id DESC LIMIT 1""")).fetchone()
        rows = []
        if snapshot:
            cursor = await conn.execute(f"""SELECT d.entity_id,e.metadata,d.metric,d.unit,d.dimensions,
                r.observed_at AS valid_at,r.value,r.quality,r.period_start,r.period_end,r.collected_at,r.provenance
                FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id
                JOIN readings r ON r.measurement_id=d.id
                WHERE NOT e.is_hidden AND d.source_id='environment-discharge-glofas'
                    AND d.dimensions->>'contract'='environment-v1'
                    AND {membership}
                    AND r.observed_at>=(date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
                    AND r.observed_at<(date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+INTERVAL '14 days'
                ORDER BY d.entity_id,r.observed_at,d.id LIMIT 10001""", (snapshot['payload_sha256'],))
            rows = await cursor.fetchall()
    return jsonable_encoder({'items': rows[:10000], 'truncated': len(rows)>10000,
        'as_of': datetime.now(UTC), 'last_checked_at': snapshot['received_at'] if snapshot else None,
        'provider_issue_time': None, 'forecast_identity': 'response_snapshot'})


@router.get('/energy')
async def energy_market_intervals(
    product: str = Query(default='price', pattern='^(price|load|generation)$'),
    limit: int = Query(default=100, ge=1, le=300),
    offset: int = Query(default=0, ge=0, le=20000),
    pool=Depends(get_db_pool),
):
    """One product snapshot, with exact source intervals and explicit area scope."""
    sid = 'environment-entsoe-' + product
    async with pool.connection() as conn:
        ready = await (await conn.execute("SELECT to_regclass('measurement_definitions') IS NOT NULL AS ready")).fetchone()
        if not ready or not ready['ready']:
            raise HTTPException(503, 'Canonical measurement storage is not installed')
        membership = await snapshot_predicate(conn)
        snapshot = await (await conn.execute("SELECT payload_sha256,received_at FROM collection_attempts WHERE source_id=%s AND status='success' ORDER BY received_at DESC,id DESC LIMIT 1",(sid,))).fetchone()
        rows = []
        count = 0
        if snapshot:
            filters = f"""FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id
                JOIN readings r ON r.measurement_id=d.id
                WHERE NOT e.is_hidden AND d.source_id=%s AND d.dimensions->>'contract'='environment-v1'
                    AND {membership}"""
            args = (sid,snapshot['payload_sha256'])
            count = (await (await conn.execute('SELECT COUNT(*) AS count '+filters,args)).fetchone())['count']
            rows = await (await conn.execute("SELECT d.entity_id,e.metadata,d.metric,d.unit,d.dimensions,r.value,r.quality,r.period_start,r.period_end,r.provenance " + filters + " ORDER BY r.observed_at DESC,d.id LIMIT %s OFFSET %s",(*args,limit+1,offset))).fetchall()
    return jsonable_encoder({'product':product,'items':rows[:limit],'stored_intervals':count,'has_more':len(rows)>limit,
        'offset':offset,'snapshot_sha256':snapshot['payload_sha256'] if snapshot else None,
        'last_checked_at':snapshot['received_at'] if snapshot else None,'as_of':datetime.now(UTC)})


@router.get('/inaturalist')
async def inaturalist_observations(pool=Depends(get_db_pool), limit: int = Query(100, ge=1, le=200),
                                  offset: int = Query(0, ge=0, le=2000), include_duplicates: bool = False):
    from inaturalist_publication import inaturalist_data, inaturalist_response
    return inaturalist_response(await inaturalist_data(pool, limit, offset, include_duplicates))


@router.get('/inaturalist/download')
async def download_inaturalist(pool=Depends(get_db_pool), include_duplicates: bool = False):
    from inaturalist_publication import inaturalist_data, inaturalist_response
    return inaturalist_response(await inaturalist_data(pool, 2000, 0, include_duplicates), download=True)
