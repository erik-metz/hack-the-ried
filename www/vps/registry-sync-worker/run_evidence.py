"""One durable run per adapter invocation, including all its acquisition retries."""

import os


async def begin_run(conn, source_id):
    if os.getenv('COLLECTION_RUN_EVIDENCE', 'false').lower() != 'true':
        return None
    # Enabling this requires the additive MCP migration before worker rollout.
    await conn.execute('''INSERT INTO collection_run_coverage(source_id) VALUES (%s)
        ON CONFLICT DO NOTHING''', (source_id,))
    cursor = await conn.execute('INSERT INTO collection_runs(source_id) VALUES (%s) RETURNING id', (source_id,))
    run_id = (await cursor.fetchone())[0]
    await conn.commit()
    return run_id


async def finish_run(conn, run_id, status):
    if run_id is None:
        return
    outcome = status if isinstance(status, str) and status in {'success','partial','failed'} else 'partial'
    await conn.execute('''UPDATE collection_runs SET status=%s,finished_at=clock_timestamp()
        WHERE id=%s AND finished_at IS NULL''', (outcome, run_id))
    await conn.commit()
