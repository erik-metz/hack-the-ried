"""Quarantine old, incorrectly dated TTN online states; never coordinates.

Stop the old collector first. Run --snapshot NAME, export that schema with
pg_dump, then --apply NAME. Both phases retain the original rows unchanged in
an independent schema. The apply phase refuses a changed source snapshot.
"""
import argparse
import asyncio
import json
import os
import re

import psycopg
from psycopg import sql

DEFINITIONS = """SELECT id FROM measurement_definitions WHERE metric='online_status'
    AND unit='state' AND ((source_id='ttnmapper' AND entity_id LIKE 'lora:gateway:%')
    OR (source_id LIKE 'legacy-sensor:ttn-gw-%' AND entity_id LIKE 'sensor:ttn-gw-%'))"""
SCOPES = {
    'readings': f'measurement_id IN ({DEFINITIONS})',
    'reading_revisions': f'measurement_id IN ({DEFINITIONS})',
    'latest_readings': f'measurement_id IN ({DEFINITIONS})',
    'sensor_data': "sensor_id LIKE 'ttn-gw-%' AND metric='online_status' AND unit='state'",
    'sensor_latest': "sensor_id LIKE 'ttn-gw-%' AND metric='online_status' AND unit='state'",
    'data_archives': """EXISTS (SELECT 1 FROM unnest(entity_ids) id
        WHERE id LIKE 'lora:gateway:%' OR id LIKE 'sensor:ttn-gw-%')""",
}


def identifier(name):
    if len(name) > 63 or not re.fullmatch(r'ttn_status_quarantine_[a-z0-9_]+', name):
        raise ValueError('Use a unique schema starting with ttn_status_quarantine_')
    return sql.Identifier(name)


async def counts(conn):
    result = {}
    for table, condition in SCOPES.items():
        result[table] = (await (await conn.execute(
            sql.SQL('SELECT count(*) FROM {} WHERE ' + condition).format(sql.Identifier(table))
        )).fetchone())[0]
    return result


async def quarantine(conn, name, *, snapshot=False):
    schema = identifier(name)
    async with conn.transaction():
        await conn.execute("SET LOCAL lock_timeout='5s'")
        await conn.execute("SET LOCAL statement_timeout='300s'")
        await conn.execute('SET LOCAL max_parallel_workers_per_gather=0')
        await conn.execute('SELECT pg_advisory_xact_lock(734225,1)')
        await conn.execute('SELECT pg_advisory_xact_lock(72819401)')
        before = await counts(conn)
        if snapshot:
            await conn.execute(sql.SQL('CREATE SCHEMA {}').format(schema))
            for table, condition in SCOPES.items():
                await conn.execute(sql.SQL('CREATE TABLE {}.{} AS SELECT * FROM {} WHERE ' + condition)
                    .format(schema, sql.Identifier(table), sql.Identifier(table)))
            return before
        for table, condition in SCOPES.items():
            # EXCEPT ALL checks the exact row multiset, including duplicate legacy rows.
            difference = await (await conn.execute(sql.SQL('''SELECT EXISTS (
                (SELECT * FROM {table} WHERE {condition} EXCEPT ALL SELECT * FROM {schema}.{table})
                UNION ALL (SELECT * FROM {schema}.{table} EXCEPT ALL SELECT * FROM {table} WHERE {condition})
            )''').format(table=sql.Identifier(table), schema=schema, condition=sql.SQL(condition)))).fetchone()
            if difference[0]:
                raise ValueError(f'{table} changed after backup; stop the collector and create a fresh snapshot')
        # Remove affected public archive links immediately, retaining their full catalogue in the backup.
        await conn.execute(sql.SQL('''INSERT INTO archive_cleanup(key)
            SELECT file->>'key' FROM {}.data_archives a, jsonb_array_elements(a.files) file
            ON CONFLICT DO NOTHING''').format(schema))
        await conn.execute(sql.SQL('''UPDATE data_archives SET files='[]',reading_count=0,size_bytes=0,
            is_complete=false WHERE ''') + sql.SQL(SCOPES['data_archives']))
        # Clear caches first so per-row delete triggers need not find a replacement repeatedly.
        for table in ('latest_readings', 'sensor_latest', 'sensor_data', 'readings', 'reading_revisions'):
            await conn.execute(sql.SQL('DELETE FROM {} WHERE ' + SCOPES[table]).format(sql.Identifier(table)))
        after = await counts(conn)
        if any(after[table] for table in SCOPES if table != 'data_archives'):
            raise ValueError('Some targeted TTN states remain; transaction rolled back')
        return before


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--snapshot', metavar='SCHEMA')
    mode.add_argument('--apply', metavar='SCHEMA')
    args = parser.parse_args()
    async with await psycopg.AsyncConnection.connect(
        host=os.environ['DB_HOST'], dbname=os.environ['DB_NAME'],
        user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'], autocommit=True,
    ) as conn:
        result = (await quarantine(conn, args.snapshot or args.apply, snapshot=bool(args.snapshot))
            if args.snapshot or args.apply else await counts(conn))
        print(json.dumps(result))


if __name__ == '__main__':
    asyncio.run(main())
