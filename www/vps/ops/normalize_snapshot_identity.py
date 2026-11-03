"""Remove response hashes from measurement identities, retaining accepted values.

Apply only after core consolidation and compatible API/registry deployment.
Each logical quantity merges in its own transaction; no Python numeric roundtrip.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path

import psycopg

MIGRATIONS=Path(os.getenv('CORE_STORAGE_MIGRATIONS','/app/v1/migrations'))


async def normalize(conn):
    await conn.execute((MIGRATIONS/'20261103_snapshot_identity.sql').read_text())
    key_heads=(await (await conn.execute("SELECT to_regclass('measurement_heads') IS NOT NULL")).fetchone())[0]
    groups=await (await conn.execute("""SELECT entity_id,metric,unit,source_id,basis,
        (dimensions-'snapshot_sha256')::text,array_agg(id ORDER BY id)
        FROM measurement_definitions WHERE dimensions ? 'snapshot_sha256'
        GROUP BY entity_id,metric,unit,source_id,basis,dimensions-'snapshot_sha256'
        ORDER BY source_id,entity_id,metric""")).fetchall()
    for entity,metric,unit,source,basis,dimensions,old_ids in groups:
        async with conn.transaction():
            variants=await (await conn.execute("""SELECT count(DISTINCT jsonb_build_array(semantics,minimum,maximum))
                FROM measurement_definitions WHERE id=ANY(%s)""",(old_ids,))).fetchone()
            if variants[0]!=1:
                raise ValueError(f'Incompatible definition semantics: {entity}/{metric}')
            await conn.execute("""CREATE TEMP TABLE accepted_snapshot_values ON COMMIT DROP AS
                SELECT r.*,max(collected_at) OVER(PARTITION BY observed_at) AS newest
                FROM readings r WHERE measurement_id=ANY(%s)""",(old_ids,))
            conflict=await (await conn.execute("""SELECT observed_at FROM accepted_snapshot_values
                WHERE collected_at=newest GROUP BY observed_at
                HAVING count(DISTINCT jsonb_build_array(value,quality,period_start,period_end))>1 LIMIT 1""")).fetchone()
            if conflict:
                raise ValueError(f'Equally recent conflicting accepted values: {entity}/{metric} at {conflict[0]}')
            await conn.execute("""INSERT INTO measurement_definitions(entity_id,metric,unit,source_id,basis,
                dimensions,semantics,minimum,maximum)
                SELECT entity_id,metric,unit,source_id,basis,dimensions-'snapshot_sha256',semantics,minimum,maximum
                FROM measurement_definitions WHERE id=%s
                ON CONFLICT(entity_id,metric,unit,source_id,basis,dimensions) DO NOTHING""",(old_ids[0],))
            target=(await (await conn.execute("""SELECT id FROM measurement_definitions WHERE entity_id=%s
                AND metric=%s AND unit=%s AND source_id=%s AND basis=%s AND dimensions=%s::jsonb""",
                (entity,metric,unit,source,basis,dimensions))).fetchone())[0]
            conflict=await (await conn.execute("""SELECT old.observed_at FROM accepted_snapshot_values old
                JOIN readings current ON current.measurement_id=%s AND current.observed_at=old.observed_at
                WHERE old.collected_at=old.newest AND current.collected_at=old.collected_at
                  AND (current.value,current.quality,current.period_start,current.period_end)
                    IS DISTINCT FROM (old.value,old.quality,old.period_start,old.period_end) LIMIT 1""",(target,))).fetchone()
            if conflict:
                raise ValueError(f'Current/candidate conflict with equal acquisition time: {entity}/{metric}')
            result=await conn.execute("""INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at,
                period_start,period_end,provenance,revision)
                SELECT DISTINCT ON(observed_at) %s,observed_at,value,quality,collected_at,period_start,period_end,
                    compact_reading_details(provenance),0 FROM accepted_snapshot_values
                ORDER BY observed_at,collected_at DESC,measurement_id DESC
                ON CONFLICT(measurement_id,observed_at) DO UPDATE SET value=EXCLUDED.value,quality=EXCLUDED.quality,
                    collected_at=EXCLUDED.collected_at,period_start=EXCLUDED.period_start,
                    period_end=EXCLUDED.period_end,provenance=EXCLUDED.provenance
                WHERE EXCLUDED.collected_at>=readings.collected_at""",(target,))
            await conn.execute("""INSERT INTO measurement_current_members(source_id,measurement_id,observed_at,seen_at)
                SELECT source_id,%s,observed_at,max(seen_at) FROM measurement_current_members
                WHERE measurement_id=ANY(%s) GROUP BY source_id,observed_at
                ON CONFLICT(measurement_id,observed_at) DO UPDATE SET
                    seen_at=GREATEST(measurement_current_members.seen_at,EXCLUDED.seen_at)""",(target,old_ids))
            await conn.execute('UPDATE measurement_publication_cells SET measurement_id=%s WHERE measurement_id=ANY(%s)',(target,old_ids))
            expected=(await (await conn.execute('SELECT count(DISTINCT observed_at) FROM accepted_snapshot_values')).fetchone())[0]
            actual=(await (await conn.execute('SELECT count(*) FROM readings WHERE measurement_id=%s',(target,))).fetchone())[0]
            if actual<expected:
                raise ValueError('Merged observation coverage incomplete')
            if key_heads:
                # All accepted values are already copied and verified. Retire
                # old keys first so delete triggers do not rescan every chunk
                # for a replacement head of an intentionally retired identity.
                await conn.execute('DELETE FROM measurement_heads WHERE measurement_id=ANY(%s)',(old_ids,))
            await conn.execute('DELETE FROM readings WHERE measurement_id=ANY(%s)',(old_ids,))
            await conn.execute('DELETE FROM measurement_definitions WHERE id=ANY(%s)',(old_ids,))
        print(json.dumps({'source':source,'entity':entity,'metric':metric,'retired_hash_definitions':len(old_ids),'accepted_rows':result.rowcount}),flush=True)
    await conn.execute("""INSERT INTO measurement_migration_state(name,state) VALUES('snapshot_identity','{"initialized":true,"normalized":true}')
        ON CONFLICT(name) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()""")


async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    async with await psycopg.AsyncConnection.connect(host=os.environ['DB_HOST'],port=os.getenv('DB_PORT','5432'),
        dbname=os.environ['DB_NAME'],user=os.environ['DB_USER'],password=os.environ['DB_PASSWORD'],autocommit=True,
        application_name='snapshot_identity_normalization') as conn:
        await conn.execute("SET statement_timeout='10min'")
        await conn.execute("SET lock_timeout='10s'")
        await conn.execute('SET max_parallel_workers_per_gather=0')
        print('Definitions with response identity:',(await (await conn.execute("SELECT count(*) FROM measurement_definitions WHERE dimensions ? 'snapshot_sha256'")).fetchone())[0],flush=True)
        if args.apply:
            await normalize(conn)


if __name__=='__main__':
    asyncio.run(main())
