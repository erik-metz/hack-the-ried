"""Explicit, resumable core-storage consolidation. Default: read-only report.

Run in the API image with /app on PYTHONPATH and the versioned migration files.
Transfer may run online; pause writers for the final --retire cutover. No CASCADE or value rounding.
"""

import argparse
import asyncio
import json
import os
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
from psycopg import sql

MIGRATIONS = Path(os.getenv('CORE_STORAGE_MIGRATIONS', '/app/v1/migrations'))


async def report(conn):
    result = {}
    for name in ('sensor_data', 'movement_positions', 'reading_revisions',
                 'collected_dataset_versions', 'telemetry_ingest_batches'):
        row = await (await conn.execute("SELECT relkind,pg_total_relation_size(oid) FROM pg_class WHERE oid=to_regclass(%s)", (name,))).fetchone()
        result[name] = {'kind': row[0], 'parent_bytes': row[1]} if row else None
    print(json.dumps(result), flush=True)
    return result


async def sensor_window(conn, start, end):
    """Copy only observations not already represented by a native channel."""
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(2026093001)")
        await conn.execute("""CREATE TEMP TABLE core_sensor_transfer ON COMMIT DROP AS
            SELECT sensor_id,metric,unit,timestamp,min(legacy_numeric(value)) AS value,
                count(DISTINCT value) AS variants FROM sensor_data
            WHERE timestamp>=%s AND timestamp<%s GROUP BY sensor_id,metric,unit,timestamp""", (start,end))
        await conn.execute('ANALYZE core_sensor_transfer')
        conflicts = await (await conn.execute("SELECT sensor_id,metric,unit,timestamp FROM core_sensor_transfer WHERE variants>1 LIMIT 5")).fetchall()
        if conflicts:
            raise ValueError(f'Unresolved sensor values; no deletion: {conflicts}')
        await conn.execute("""DELETE FROM core_sensor_transfer t WHERE EXISTS(
            SELECT 1 FROM core_sensor_aliases a JOIN readings r USING(measurement_id)
            WHERE a.sensor_id=t.sensor_id AND a.metric=t.metric AND a.unit=t.unit
                AND r.observed_at=t.timestamp AND r.observed_at>=%s AND r.observed_at<%s
                AND r.value=t.value AND r.quality='valid')""",(start,end))
        conflicts = await (await conn.execute("""SELECT t.sensor_id,t.metric,t.unit,t.timestamp FROM core_sensor_transfer t
            WHERE EXISTS(SELECT 1 FROM core_sensor_aliases a JOIN readings r USING(measurement_id)
                WHERE a.sensor_id=t.sensor_id AND a.metric=t.metric AND a.unit=t.unit
                    AND r.observed_at=t.timestamp AND r.observed_at>=%s AND r.observed_at<%s) LIMIT 5""",(start,end))).fetchall()
        if conflicts:
            raise ValueError(f'Native/legacy disagreement; accepted value needs review: {conflicts}')
        await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata,is_hidden)
            SELECT DISTINCT 'sensor:'||s.id,s.friendly_name,'sensor',jsonb_strip_nulls(jsonb_build_object(
                'latitude',s.latitude,'longitude',s.longitude,'description',s.description)),s.is_hidden
            FROM sensor_metadata s JOIN core_sensor_transfer t ON t.sensor_id=s.id
            ON CONFLICT(id) DO NOTHING""")
        await conn.execute("""INSERT INTO measurement_definitions(entity_id,metric,unit,source_id,basis,dimensions,semantics)
            SELECT DISTINCT 'sensor:'||sensor_id,metric,unit,'legacy-sensor:'||sensor_id,'unknown','{}'::jsonb,'unknown'
            FROM core_sensor_transfer ON CONFLICT(entity_id,metric,unit,source_id,basis,dimensions) DO NOTHING""")
        result = await conn.execute("""INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at)
            SELECT d.id,t.timestamp,t.value,'valid',NOW() FROM core_sensor_transfer t
            JOIN measurement_definitions d ON d.entity_id='sensor:'||t.sensor_id AND d.metric=t.metric
                AND d.unit=t.unit AND d.source_id='legacy-sensor:'||t.sensor_id
                AND d.basis='unknown' AND d.dimensions='{}'
            ON CONFLICT DO NOTHING""")
        await conn.execute("""INSERT INTO measurement_migration_state(name,state)
            VALUES('compact:sensors',jsonb_build_object('through',%s::timestamptz))
            ON CONFLICT(name) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()""", (end,))
        return result.rowcount


async def verify_sensor_window(conn, start, end):
    row = await (await conn.execute("""SELECT t.sensor_id,t.metric,t.unit,t.timestamp FROM sensor_data t
        WHERE t.timestamp>=%s AND t.timestamp<%s AND NOT EXISTS(
            SELECT 1 FROM core_sensor_aliases a JOIN readings r USING(measurement_id)
            WHERE a.sensor_id=t.sensor_id AND a.metric=t.metric AND a.unit=t.unit
                AND r.observed_at=t.timestamp AND r.observed_at>=%s AND r.observed_at<%s
                AND r.value=legacy_numeric(t.value) AND r.quality='valid') LIMIT 1""", (start,end,start,end))).fetchone()
    if row:
        raise ValueError(f'Sensor coverage incomplete; no retirement: {row}')


async def windows(conn, family, after=None):
    """Use actual occupied chunk bounds; sparse decades need no empty-hour scans."""
    relation = {'sensors':'sensor_data', 'movements':'movement_positions'}[family]
    has_timescale = (await (await conn.execute("SELECT to_regclass('timescaledb_information.chunks') IS NOT NULL")).fetchone())[0]
    chunks = await (await conn.execute("""SELECT chunk_schema,chunk_name FROM timescaledb_information.chunks
        WHERE hypertable_schema=current_schema() AND hypertable_name=%s ORDER BY range_start""", (relation,))).fetchall() if has_timescale else []
    if not chunks:  # ordinary PostgreSQL integration fixtures
        chunks = [(None, relation)]
    for schema, table in chunks:
        identifier = sql.Identifier(schema, table) if schema else sql.Identifier(table)
        bounds = await (await conn.execute(sql.SQL('SELECT min(timestamp),max(timestamp) FROM {}').format(identifier))).fetchone()
        if bounds[0] is None:
            continue
        start = max(bounds[0],after) if after else bounds[0]
        while start <= bounds[1]:
            next_row = await (await conn.execute(sql.SQL('SELECT min(timestamp) FROM {} WHERE timestamp>=%s AND timestamp<=%s').format(identifier),(start,bounds[1]))).fetchone()
            if next_row[0] is None:
                break
            start=next_row[0]
            end = min(start+timedelta(minutes=15),bounds[1]+timedelta(microseconds=1))
            yield start,end
            start = end


async def transfer(conn):
    for family in ('sensors','movements'):
        saved = await (await conn.execute("SELECT state->>'through' FROM measurement_migration_state WHERE name=%s", ('compact:'+family,))).fetchone()
        checkpoint = datetime.fromisoformat(saved[0]) if saved else None
        async for start,end in windows(conn,family,after=checkpoint):
            if shutil.disk_usage('/').free<4*1024**3:
                raise RuntimeError('Transfer paused at the 4 GiB free-space reserve')
            if checkpoint and end<=checkpoint:
                continue
            if family == 'sensors':
                count = await sensor_window(conn,start,end)
                await verify_sensor_window(conn,start,end)
            else:
                await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata)
                    SELECT DISTINCT ON(entity_id) 'movement:'||entity_id,entity_id,
                        CASE WHEN basis='schedule_prediction' THEN 'service_trip' ELSE kind END,
                        (metadata-ARRAY['speed_kmh','delay_seconds','course_deg','altitude_baro_m',
                            'altitude_geom_m','vertical_rate_mps','payload_sha256','model_version','fetched_at','received_at'])
                        ||jsonb_build_object('legacy_movement_id',entity_id,'kind',kind,'context_observed_at',timestamp)
                    FROM movement_positions WHERE timestamp>=%s AND timestamp<%s ORDER BY entity_id,timestamp DESC
                    ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,updated_at=NOW()
                    WHERE COALESCE((entities.metadata->>'context_observed_at')::timestamptz,'-infinity')
                        <(EXCLUDED.metadata->>'context_observed_at')::timestamptz""",(start,end))
                count = (await (await conn.execute('SELECT backfill_measurement_window(%s,%s,%s)', (family,start,end))).fetchone())[0]
                await verify_movement_window(conn,start,end)
                await conn.execute("""INSERT INTO measurement_migration_state(name,state)
                    VALUES('compact:movements',jsonb_build_object('through',%s::timestamptz))
                    ON CONFLICT(name) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()""",(end,))
            print(json.dumps({'family':family,'through':end.isoformat(),'samples':count}),flush=True)


async def verify_movement_window(conn,start,end):
    missing = await (await conn.execute("""SELECT p.entity_id,p.timestamp FROM movement_positions p
        WHERE p.timestamp>=%s AND p.timestamp<%s AND NOT EXISTS(
            SELECT 1 FROM measurement_positions c WHERE c.entity_id='movement:'||p.entity_id
                AND c.source_id=p.source_id AND c.basis=p.basis AND c.observed_at=p.timestamp
                AND c.observed_at>=%s AND c.observed_at<%s
                AND c.latitude=legacy_numeric(p.latitude) AND c.longitude=legacy_numeric(p.longitude)) LIMIT 1""", (start,end,start,end))).fetchone()
    if missing:
        raise ValueError(f'Movement coverage incomplete; no retirement: {missing}')


async def transfer_publications(conn):
    """Extract numeric fields before discarding repeated publication snapshots."""
    datasets=await (await conn.execute("""SELECT dataset FROM collected_datasets
        WHERE dataset LIKE 'statistics/%' OR dataset IN('infrastructure/ev-charging',
            'map/layers/charging','environment/flood/gauges','map/layers/floods')
            OR is_coordinate_publication(dataset) ORDER BY dataset""")).fetchall()
    for (dataset,) in datasets:
        function = ('mirror_statistical_publication' if dataset.startswith('statistics/')
            else 'mirror_charger_publication' if dataset in ('infrastructure/ev-charging','map/layers/charging')
            else 'mirror_gauge_publication' if dataset in ('environment/flood/gauges','map/layers/floods')
            else 'mirror_coordinate_publication')
        async with conn.transaction():
            # Old versions contain normalized data, not original response bytes.
            # Replay chronologically, then restore the current accepted snapshot
            # in this same transaction. No intermediate revision is exposed.
            await conn.execute("SELECT set_config('ried.transfer_dataset',%s,true)",(dataset,))
            if dataset.startswith('statistics/') or dataset in ('infrastructure/ev-charging','map/layers/charging','environment/flood/gauges'):
                # Keep JSONB entirely inside PostgreSQL: a Python float roundtrip
                # would lose precision for arbitrary source decimal numbers.
                await conn.execute(sql.SQL("""DO $transfer$ DECLARE v RECORD; d collected_datasets;
                    BEGIN SELECT * INTO STRICT d FROM collected_datasets WHERE dataset=current_setting('ried.transfer_dataset');
                    FOR v IN SELECT * FROM collected_dataset_versions WHERE dataset=d.dataset
                        ORDER BY source_updated_at,payload_sha256 LOOP
                        PERFORM {}(jsonb_populate_record(NULL::collected_datasets,to_jsonb(d)||
                            jsonb_build_object('payload_sha256',v.payload_sha256,'source_updated_at',v.source_updated_at,
                                'fetched_at',NOW(),'data',v.data)));
                    END LOOP; END $transfer$;""").format(sql.Identifier(function)))
            await conn.execute(sql.SQL("""SELECT {}(jsonb_populate_record(NULL::collected_datasets,
                to_jsonb(d)||jsonb_build_object('fetched_at',NOW())))
                FROM collected_datasets d WHERE dataset=%s""").format(sql.Identifier(function)),(dataset,))
        print(json.dumps({'publication_transferred':dataset}),flush=True)


async def retire(conn):
    if (await (await conn.execute('SELECT core_storage_enabled()')).fetchone())[0]:
        print('Canonical retirement already complete',flush=True)
        return
    for family in ('sensors','movements'):
        async for start,end in windows(conn,family):
            if family == 'sensors':
                await verify_sensor_window(conn,start,end)
            else:
                await verify_movement_window(conn,start,end)
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(2026093001)")
        # The lock prevents a writer racing between the final full-range check
        # and retirement. Operators also stop collectors to avoid stalled requests.
        await conn.execute('LOCK TABLE sensor_data,movement_positions IN ACCESS EXCLUSIVE MODE')
        for family in ('sensors','movements'):
            relation = 'sensor_data' if family=='sensors' else 'movement_positions'
            bounds = await (await conn.execute(sql.SQL('SELECT min(timestamp),max(timestamp) FROM {}').format(sql.Identifier(relation)))).fetchone()
            if bounds[0] is not None:
                if family=='sensors':
                    await verify_sensor_window(conn,bounds[0],bounds[1]+timedelta(microseconds=1))
                else:
                    await verify_movement_window(conn,bounds[0],bounds[1]+timedelta(microseconds=1))
        await conn.execute("SET LOCAL ried.core_retirement_verified='yes'")
        await conn.execute((MIGRATIONS/'20261103_core_retirement.sql').read_text())
    print('Verified physical legacy storage retired',flush=True)


async def deduplicate(conn):
    """Remove only proven compatibility copies, preserving physical channels."""
    chunks=await (await conn.execute("""SELECT chunk_schema,chunk_name,range_start,range_end FROM timescaledb_information.chunks
        WHERE hypertable_schema=current_schema() AND hypertable_name='readings' ORDER BY range_start""")).fetchall()
    for schema,table,start,end in chunks:
        result=await conn.execute(sql.SQL("""DELETE FROM {} r USING measurement_definitions old
            WHERE r.measurement_id=old.id AND old.basis='unknown' AND old.dimensions='{{}}'
              AND old.entity_id LIKE 'sensor:%%' AND old.source_id='legacy-sensor:'||substr(old.entity_id,8)
              AND EXISTS(SELECT 1 FROM core_sensor_aliases a JOIN readings native USING(measurement_id)
                WHERE a.sensor_id=substr(old.entity_id,8) AND a.metric=old.metric AND a.unit=old.unit
                  AND a.basis<>'unknown' AND (a.source_id=old.source_id
                    OR a.source_id IN('environment-weather','ttnmapper'))
                  AND native.observed_at=r.observed_at AND native.observed_at>=%s AND native.observed_at<%s
                  AND native.value=r.value AND native.quality=r.quality)""").format(sql.Identifier(schema,table)),(start,end))
        print(json.dumps({'chunk':table,'duplicate_compatibility_rows_removed':result.rowcount}),flush=True)


async def maintain(conn):
    for _ in range(1000):
        result=(await (await conn.execute('SELECT maintain_core_storage()')).fetchone())[0]
        print(json.dumps(result),flush=True)
        if result.get('pending_cutover'):
            raise RuntimeError('Retention requires completed canonical cutover')
        if not sum(result.values()):
            break
    else:
        raise RuntimeError('Retention batch limit reached; run again')


async def compact_existing(conn, compress_cold=False):
    """Remove discarded receipt metadata in bounded physical chunks.

    UPDATE assignments affect only provenance and the retired revision counter.
    Session-local replica mode avoids running unrelated ingestion side effects
    for unchanged measurement values. Other sessions retain normal validation.
    """
    if not (await (await conn.execute('SELECT core_storage_enabled()')).fetchone())[0]:
        raise RuntimeError('Complete coverage and retirement before physical compaction')
    chunks=await (await conn.execute("""SELECT chunk_schema,chunk_name,range_end FROM timescaledb_information.chunks
        WHERE hypertable_schema=current_schema() AND hypertable_name='readings' ORDER BY range_start""")).fetchall()
    for schema,table,range_end in chunks:
        identifier=sql.Identifier(schema,table)
        async with conn.transaction():
            await conn.execute("SET LOCAL session_replication_role='replica'")
            result=await conn.execute(sql.SQL("UPDATE {} SET provenance=compact_reading_details(provenance),revision=0 WHERE provenance IS DISTINCT FROM compact_reading_details(provenance) OR revision<>0").format(identifier))
            changed=result.rowcount
        cold=range_end<datetime.now(UTC)-timedelta(days=7)
        if cold and not compress_cold:
            await conn.execute(sql.SQL('VACUUM(FULL,ANALYZE) {}').format(identifier))
        elif not cold:
            # Keep acquisition live on the active chunk; freed pages are reused.
            await conn.execute(sql.SQL('VACUUM(ANALYZE) {}').format(identifier))
        print(json.dumps({'chunk':table,'compacted':changed}),flush=True)
    kind=(await (await conn.execute("SELECT relkind FROM pg_class WHERE oid='latest_readings'::regclass")).fetchone())[0]
    if kind=='r':
        await conn.execute("UPDATE latest_readings SET provenance=compact_reading_details(provenance) WHERE provenance IS DISTINCT FROM compact_reading_details(provenance)")
    for table in ('telemetry_ingest_batches','collection_attempts','collected_payloads',
                  'smartcity_observations','nextbike_observations','measurement_heads'):
        kind=await (await conn.execute('SELECT relkind FROM pg_class WHERE oid=to_regclass(%s)',(table,))).fetchone()
        if kind and kind[0]=='r':
            await conn.execute(sql.SQL('VACUUM(FULL,ANALYZE) {}').format(sql.Identifier(table)))


async def compress_history(conn):
    chunks=await (await conn.execute("""SELECT chunk_schema,chunk_name FROM timescaledb_information.chunks
        WHERE hypertable_schema=current_schema() AND hypertable_name='readings'
          AND NOT is_compressed AND range_end<NOW()-INTERVAL '7 days' ORDER BY range_start""")).fetchall()
    for schema,table in chunks:
        identifier=sql.Identifier(schema,table)
        relation=f'{schema}.{table}'
        size=(await (await conn.execute('SELECT pg_total_relation_size(%s::regclass)',(relation,))).fetchone())[0]
        if shutil.disk_usage('/').free<size*2+4*1024**3:
            raise RuntimeError('Compression paused before exceeding the disk reserve')
        if size<16*1024**2:
            await conn.execute(sql.SQL('VACUUM(FULL,ANALYZE) {}').format(identifier))
            continue
        signature=sql.SQL("""SELECT count(*),sum(hashtextextended(jsonb_build_array(
            measurement_id,observed_at,value,quality,period_start,period_end)::text,0)::numeric) FROM {}""").format(identifier)
        async with conn.transaction():
            await conn.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(identifier))
            before=await (await conn.execute(signature)).fetchone()
            await conn.execute('SELECT compress_chunk(%s::regclass,if_not_compressed=>true)',(relation,))
            after=await (await conn.execute(signature)).fetchone()
            if before!=after:
                raise ValueError('Compression changed an observation; transaction rolled back')
        print(json.dumps({'compressed_chunk':table,'verified_rows':before[0]}),flush=True)
    await conn.execute("SELECT add_compression_policy('readings',INTERVAL '7 days',if_not_exists=>true)")


async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install',action='store_true')
    parser.add_argument('--transfer',action='store_true')
    parser.add_argument('--retire',action='store_true')
    parser.add_argument('--maintain',action='store_true')
    parser.add_argument('--compact',action='store_true')
    parser.add_argument('--deduplicate',action='store_true')
    parser.add_argument('--publications',action='store_true')
    parser.add_argument('--compress',action='store_true')
    parser.add_argument('--heads',action='store_true')
    args=parser.parse_args()
    async with await psycopg.AsyncConnection.connect(host=os.environ['DB_HOST'],port=os.getenv('DB_PORT','5432'),
        dbname=os.environ['DB_NAME'],user=os.environ['DB_USER'],password=os.environ['DB_PASSWORD'],autocommit=True,
        application_name='core_storage_consolidation') as conn:
        await conn.execute("SET statement_timeout='10min'")
        await conn.execute("SET lock_timeout='10s'")
        await conn.execute('SET max_parallel_workers_per_gather=0')
        if args.install:
            await conn.execute((MIGRATIONS/'20261103_core_storage.sql').read_text())
        await report(conn)
        if args.publications:
            await transfer_publications(conn)
        if args.transfer:
            await transfer(conn)
        if args.retire:
            await retire(conn)
        if args.heads:
            await conn.execute((MIGRATIONS/'20261103_measurement_heads.sql').read_text())
            await conn.execute('ANALYZE measurement_heads')
        if args.deduplicate:
            await deduplicate(conn)
        if args.maintain:
            await maintain(conn)
        if args.compact:
            await compact_existing(conn,compress_cold=args.compress)
        if args.compress:
            await compress_history(conn)


if __name__=='__main__':
    asyncio.run(main())
