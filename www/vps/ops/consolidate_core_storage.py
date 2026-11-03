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
from psycopg.pq import TransactionStatus

MIGRATIONS = Path(os.getenv('CORE_STORAGE_MIGRATIONS', '/app/v1/migrations'))
MAX_TRANSFER_VALUES = 90000


async def report(conn):
    result = {}
    for name in ('sensor_data', 'movement_positions', 'reading_revisions',
                 'collected_dataset_versions', 'telemetry_ingest_batches'):
        row = await (await conn.execute("SELECT relkind,pg_total_relation_size(oid) FROM pg_class WHERE oid=to_regclass(%s)", (name,))).fetchone()
        result[name] = {'kind': row[0], 'parent_bytes': row[1]} if row else None
    print(json.dumps(result), flush=True)
    return result


async def sensor_window(conn, start, end):
    """Copy and verify one stable snapshot; late arrivals are caught at cutover."""
    own_transaction=conn.info.transaction_status==TransactionStatus.IDLE
    async with conn.transaction():
        if own_transaction:
            await conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        await conn.execute("SET LOCAL extra_float_digits=3")
        await conn.execute("SELECT pg_advisory_xact_lock(2026093001)")
        await conn.execute("""CREATE TEMP TABLE core_sensor_native ON COMMIT DROP AS
            SELECT a.sensor_id,a.metric,a.unit,r.observed_at,r.value FROM core_sensor_aliases a
            JOIN readings r USING(measurement_id) WHERE r.observed_at>=%s AND r.observed_at<%s
                AND r.quality='valid'""",(start,end))
        await conn.execute('ANALYZE core_sensor_native')
        await conn.execute("""CREATE TEMP TABLE core_sensor_transfer ON COMMIT DROP AS
            SELECT s.sensor_id,s.metric,s.unit,s.timestamp,min((s.value::text::numeric)) AS value,
                count(DISTINCT s.value) AS variants FROM sensor_data s
            WHERE s.timestamp>=%s AND s.timestamp<%s AND NOT EXISTS(
                SELECT 1 FROM core_sensor_native n WHERE n.sensor_id=s.sensor_id AND n.metric=s.metric
                    AND n.unit=s.unit AND n.observed_at=s.timestamp AND n.value=(s.value::text::numeric))
            GROUP BY s.sensor_id,s.metric,s.unit,s.timestamp""", (start,end))
        await conn.execute('ANALYZE core_sensor_transfer')
        conflicts = await (await conn.execute("SELECT sensor_id,metric,unit,timestamp FROM core_sensor_transfer WHERE variants>1 LIMIT 5")).fetchall()
        if conflicts:
            raise ValueError(f'Unresolved sensor values; no deletion: {conflicts}')
        conflicts = await (await conn.execute("""SELECT t.sensor_id,t.metric,t.unit,t.timestamp FROM core_sensor_transfer t
            WHERE EXISTS(SELECT 1 FROM core_sensor_native n
                WHERE n.sensor_id=t.sensor_id AND n.metric=t.metric AND n.unit=t.unit
                    AND n.observed_at=t.timestamp) LIMIT 5""")).fetchall()
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
        invalid=await (await conn.execute("""SELECT t.sensor_id FROM core_sensor_transfer t
            JOIN measurement_definitions d ON d.entity_id='sensor:'||t.sensor_id AND d.metric=t.metric
                AND d.unit=t.unit AND d.source_id='legacy-sensor:'||t.sensor_id
                AND d.basis='unknown' AND d.dimensions='{}'
            WHERE t.value::text IN('NaN','Infinity','-Infinity') OR t.value<d.minimum OR t.value>d.maximum
                OR (t.metric='latitude' AND t.value NOT BETWEEN -90 AND 90)
                OR (t.metric='longitude' AND t.value NOT BETWEEN -180 AND 180) LIMIT 1""")).fetchone()
        if invalid:
            raise ValueError(f'Invalid historical sensor value: {invalid}')
        await conn.execute("SET LOCAL session_replication_role='replica'")
        await conn.execute("""CREATE TEMP TABLE core_inserted ON COMMIT DROP AS WITH added AS (
            INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at)
            SELECT d.id,t.timestamp,t.value,'valid',NOW() FROM core_sensor_transfer t
            JOIN measurement_definitions d ON d.entity_id='sensor:'||t.sensor_id AND d.metric=t.metric
                AND d.unit=t.unit AND d.source_id='legacy-sensor:'||t.sensor_id
                AND d.basis='unknown' AND d.dimensions='{}'
            ORDER BY d.id,t.timestamp ON CONFLICT DO NOTHING
            RETURNING measurement_id,observed_at,value,quality,collected_at,provenance
        ) SELECT * FROM added""")
        await conn.execute("SET LOCAL session_replication_role='origin'")
        await conn.execute('SELECT refresh_core_transfer_heads()')
        inserted=(await (await conn.execute('SELECT count(*) FROM core_inserted')).fetchone())[0]
        await verify_sensor_window(conn,start,end)
        await conn.execute("""INSERT INTO measurement_migration_state(name,state)
            VALUES('compact:sensors',jsonb_build_object('through',%s::timestamptz))
            ON CONFLICT(name) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()""", (end,))
        await conn.execute('DROP TABLE pg_temp.core_inserted,pg_temp.core_sensor_transfer,pg_temp.core_sensor_native')
        return inserted


async def verify_sensor_window(conn, start, end):
    # Materialize the complete bounded native set before the LIMIT probe.
    # Otherwise PostgreSQL may choose a low-startup nested loop that compares
    # every reading against every alias while proving there is no missing row.
    async with conn.transaction():
        await conn.execute("SET LOCAL extra_float_digits=3")
        row = await (await conn.execute("""WITH native AS MATERIALIZED (
            SELECT a.sensor_id,a.metric,a.unit,r.observed_at,r.value FROM core_sensor_aliases a
            JOIN readings r USING(measurement_id) WHERE r.observed_at>=%s AND r.observed_at<%s AND r.quality='valid'
        ) SELECT t.sensor_id,t.metric,t.unit,t.timestamp FROM sensor_data t
            WHERE t.timestamp>=%s AND t.timestamp<%s AND NOT EXISTS(
                SELECT 1 FROM native n WHERE n.sensor_id=t.sensor_id AND n.metric=t.metric AND n.unit=t.unit
                    AND n.observed_at=t.timestamp AND n.value=(t.value::text::numeric)) LIMIT 1""", (start,end,start,end))).fetchone()
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
            end = min(start+timedelta(hours=1),bounds[1]+timedelta(microseconds=1))
            if family=='movements':
                terms=sql.SQL(' + ').join(sql.SQL("CASE WHEN jsonb_typeof(metadata->{})='number' THEN 1 ELSE 0 END").format(sql.Literal(key))
                    for key in ('speed_kmh','delay_seconds','course_deg','heading_deg','navigation_status',
                                'altitude_baro_m','altitude_geom_m','vertical_rate_mps'))
                while True:
                    count=(await (await conn.execute(sql.SQL('SELECT COALESCE(sum(2+({})),0) FROM {} WHERE timestamp>=%s AND timestamp<%s').format(terms,identifier),(start,end))).fetchone())[0]
                    if count<=MAX_TRANSFER_VALUES:
                        break
                    if end-start<=timedelta(microseconds=1):
                        raise ValueError('Single movement timestamp exceeds the safe batch limit')
                    end=start+(end-start)/2
            yield start,end
            start = end


async def transfer(conn):
    if (await (await conn.execute('SELECT core_storage_enabled()')).fetchone())[0]:
        print('Canonical storage already enabled; historical transfer skipped',flush=True)
        return
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
            else:
                await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata)
                    SELECT DISTINCT ON(entity_id) 'movement:'||entity_id,entity_id,
                        CASE WHEN basis='schedule_prediction' THEN 'service_trip' ELSE kind END,
                        compact_movement_metadata(metadata)
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
    async with conn.transaction():
        await conn.execute("SET LOCAL extra_float_digits=3")
        await conn.execute("SET LOCAL enable_mergejoin=off")
        missing=await (await conn.execute("""WITH expected AS MATERIALIZED (
            SELECT p.entity_id,p.source_id,p.basis,p.timestamp,v.* FROM movement_positions p
            CROSS JOIN LATERAL (VALUES
                ('latitude','degrees','{"crs":"EPSG:4326"}'::jsonb,(p.latitude::text::numeric)),
                ('longitude','degrees','{"crs":"EPSG:4326"}'::jsonb,(p.longitude::text::numeric)),
                ('speed','km/h','{}'::jsonb,(p.metadata->>'speed_kmh')::numeric),
                ('delay','s','{}'::jsonb,(p.metadata->>'delay_seconds')::numeric),
                ('course','degrees','{"reference":"true_north"}'::jsonb,(p.metadata->>'course_deg')::numeric),
                ('heading','degrees','{"reference":"true_north"}'::jsonb,(p.metadata->>'heading_deg')::numeric),
                ('navigation_status','state','{"encoding":"AIS_NavigationalStatus"}'::jsonb,(p.metadata->>'navigation_status')::numeric),
                ('altitude_baro','m','{"reference":"pressure_1013.25_hPa"}'::jsonb,(p.metadata->>'altitude_baro_m')::numeric),
                ('altitude_geom','m','{"reference":"WGS84"}'::jsonb,(p.metadata->>'altitude_geom_m')::numeric),
                ('vertical_rate','m/s','{"reference":"barometric"}'::jsonb,(p.metadata->>'vertical_rate_mps')::numeric)
            ) v(metric,unit,dimensions,value)
            WHERE p.timestamp>=%s AND p.timestamp<%s AND v.value IS NOT NULL
        ), definition_keys AS MATERIALIZED (
            SELECT DISTINCT entity_id,source_id,basis,metric,unit,dimensions FROM expected
        ), definitions AS MATERIALIZED (
            SELECT k.*,d.id FROM definition_keys k LEFT JOIN LATERAL (
                SELECT id FROM measurement_definitions d WHERE d.entity_id='movement:'||k.entity_id
                  AND d.source_id=k.source_id AND d.basis=k.basis AND d.metric=k.metric AND d.unit=k.unit
                  AND d.dimensions=k.dimensions LIMIT 1
            ) d ON TRUE
        ), mapped AS MATERIALIZED (
            SELECT e.*,d.id AS measurement_id FROM expected e
            JOIN definitions d USING(entity_id,source_id,basis,metric,unit,dimensions)
        ), native AS MATERIALIZED (
            SELECT measurement_id,observed_at,value,collected_at FROM readings
            WHERE observed_at>=%s AND observed_at<%s AND quality='valid'
        ) SELECT min(jsonb_build_array(e.entity_id,e.timestamp,e.metric)::text) FROM mapped e WHERE NOT EXISTS(
            SELECT 1 FROM native n WHERE n.measurement_id=e.measurement_id
              AND n.observed_at=e.timestamp AND (n.value=e.value OR EXISTS(
                SELECT 1 FROM reading_revisions v
                WHERE v.measurement_id=n.measurement_id AND v.observed_at=n.observed_at
                  AND v.replaced_at<=n.collected_at
                  AND v.previous_record->>'quality'='valid'
                  AND (v.previous_record->>'value')::numeric=e.value
              ))) HAVING count(*)>0""",(start,end,start,end))).fetchone()
    if missing:
        raise ValueError(f'Movement coverage incomplete; no retirement: {missing}')

async def transfer_publications(conn, selected=None):
    """Extract numeric fields before discarding repeated publication snapshots."""
    datasets=await (await conn.execute("""SELECT dataset FROM collected_datasets
        WHERE dataset LIKE 'statistics/%' OR dataset IN('infrastructure/ev-charging',
            'map/layers/charging','environment/flood/gauges','map/layers/floods')
            OR is_coordinate_publication(dataset) ORDER BY dataset""")).fetchall()
    for (dataset,) in datasets:
        if selected and dataset not in selected:
            continue
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
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(2026093001)")
        # Block source mutations while bounded checks run, keeping SELECTs live.
        # Never materialize the entire movement/core history in one giant query.
        await conn.execute('LOCK TABLE sensor_data,movement_positions IN SHARE ROW EXCLUSIVE MODE')
        for family in ('sensors','movements'):
            async for start,end in windows(conn,family):
                if family=='sensors':
                    try:
                        await verify_sensor_window(conn,start,end)
                    except ValueError:
                        count=await sensor_window(conn,start,end)
                        print(json.dumps({'recovered_sensor_values':count,'through':end.isoformat()}),flush=True)
                else:
                    try:
                        await verify_movement_window(conn,start,end)
                    except ValueError:
                        await conn.execute("SELECT backfill_measurement_window('movements',%s,%s)",(start,end))
                        await verify_movement_window(conn,start,end)
                        print(json.dumps({'recovered_movement_window':end.isoformat()}),flush=True)
                print(json.dumps({'verified_family':family,'through':end.isoformat()}),flush=True)
        await conn.execute("SET LOCAL ried.core_retirement_verified='yes'")
        await conn.execute((MIGRATIONS/'20261103_core_retirement.sql').read_text())
    print('Verified physical legacy storage retired',flush=True)


async def consolidate_traffic(conn):
    if not (await (await conn.execute('SELECT core_storage_enabled()')).fetchone())[0]:
        raise RuntimeError('Complete the primary storage cutover first')
    await conn.execute((MIGRATIONS/'20261104_traffic_core.sql').read_text())
    kind=(await (await conn.execute("SELECT relkind FROM pg_class WHERE oid='traffic_corridor_snapshots'::regclass")).fetchone())[0]
    if kind=='v':
        return
    async def verify():
        missing=await (await conn.execute("""SELECT s.corridor_id,s.timestamp FROM traffic_corridor_snapshots s
            LEFT JOIN core_corridor_snapshots c USING(corridor_id,timestamp)
            WHERE c.corridor_id IS NULL OR (s.road_name,s.status,s.active_incidents_count,s.max_length_meters)
                IS DISTINCT FROM (c.road_name,c.status,c.active_incidents_count,c.max_length_meters)
                OR (s.delay_kind IN('reported','estimated') AND s.active_incidents_count>0
                    AND s.delay_seconds IS DISTINCT FROM c.delay_seconds) LIMIT 1""")).fetchone()
        if missing:
            raise ValueError(f'Traffic coverage incomplete; no retirement: {missing}')

    # Keep source writers available during the full historical copy. A temporary
    # key set identifies the final delta without relying on client clock order.
    await conn.execute('CREATE TEMP TABLE IF NOT EXISTS transferred_corridors(corridor_id text,timestamp timestamptz,PRIMARY KEY(corridor_id,timestamp)) ON COMMIT PRESERVE ROWS')
    conflict=await (await conn.execute("""SELECT corridor_id,timestamp FROM traffic_corridor_snapshots s
        GROUP BY corridor_id,timestamp HAVING count(DISTINCT to_jsonb(s))>1 LIMIT 1""")).fetchone()
    if conflict:
        raise ValueError(f'Conflicting traffic snapshots; no retirement: {conflict}')
    await conn.execute("""DO $transfer$ DECLARE item RECORD;
        BEGIN FOR item IN SELECT * FROM traffic_corridor_snapshots ORDER BY timestamp LOOP
            PERFORM write_corridor_snapshot(to_jsonb(item),true);
            INSERT INTO transferred_corridors VALUES(item.corridor_id,item.timestamp) ON CONFLICT DO NOTHING;
        END LOOP; END $transfer$;""")
    await verify()
    async with conn.transaction():
        await conn.execute('LOCK TABLE traffic_corridor_snapshots IN ACCESS EXCLUSIVE MODE')
        await conn.execute("""DO $transfer$ DECLARE item RECORD;
            BEGIN FOR item IN SELECT s.* FROM traffic_corridor_snapshots s
                WHERE NOT EXISTS(SELECT 1 FROM transferred_corridors t
                    WHERE t.corridor_id=s.corridor_id AND t.timestamp=s.timestamp) LOOP
                PERFORM write_corridor_snapshot(to_jsonb(item),true);
            END LOOP; END $transfer$;""")
        await verify()
        await conn.execute('DROP TABLE traffic_corridor_snapshots')
        await conn.execute('CREATE VIEW traffic_corridor_snapshots AS SELECT * FROM core_corridor_snapshots')
        await conn.execute("""CREATE TRIGGER canonical_corridor_write INSTEAD OF INSERT ON traffic_corridor_snapshots
            FOR EACH ROW EXECUTE FUNCTION core_corridor_compat_write()""")
    print('Traffic observations verified and physical duplicate retired',flush=True)


async def deduplicate(conn):
    """Remove only proven compatibility copies, preserving physical channels."""
    if not (await (await conn.execute('SELECT core_storage_enabled()')).fetchone())[0]:
        raise RuntimeError('Complete canonical cutover before deduplication')
    await conn.execute('CREATE TEMP TABLE IF NOT EXISTS core_dedup_pairs(old_mid bigint,native_mid bigint,PRIMARY KEY(old_mid,native_mid)) ON COMMIT PRESERVE ROWS')
    await conn.execute('CREATE TEMP TABLE IF NOT EXISTS core_dedup_keys(old_mid bigint PRIMARY KEY,first_at timestamptz,last_at timestamptz) ON COMMIT PRESERVE ROWS')
    await conn.execute('TRUNCATE pg_temp.core_dedup_pairs,pg_temp.core_dedup_keys')
    async with conn.transaction():
        await conn.execute('SET LOCAL enable_nestloop=off')
        await conn.execute("""WITH eligible AS MATERIALIZED (
            SELECT id,substr(entity_id,8) AS sensor_id,metric,unit,source_id FROM measurement_definitions
            WHERE basis='unknown' AND dimensions='{}' AND entity_id LIKE 'sensor:%'
              AND source_id='legacy-sensor:'||substr(entity_id,8)
        ), aliases AS MATERIALIZED (
            SELECT measurement_id,sensor_id,metric,unit,source_id FROM core_sensor_aliases WHERE basis<>'unknown'
        ) INSERT INTO core_dedup_pairs SELECT DISTINCT old.id,a.measurement_id
        FROM eligible old JOIN aliases a USING(sensor_id,metric,unit)
        WHERE a.source_id=old.source_id OR a.source_id IN('environment-weather','ttnmapper','maengelmelder-ried')""")
    await conn.execute('ANALYZE pg_temp.core_dedup_pairs')
    has_timescale=(await (await conn.execute("SELECT to_regclass('timescaledb_information.chunks') IS NOT NULL")).fetchone())[0]
    chunks=await (await conn.execute("""SELECT chunk_schema,chunk_name FROM timescaledb_information.chunks
        WHERE hypertable_schema=current_schema() AND hypertable_name='readings' ORDER BY range_start""")).fetchall() if has_timescale else []
    if not chunks:
        chunks=[((await (await conn.execute('SELECT current_schema()')).fetchone())[0],'readings')]
    for schema,table in chunks:
        identifier=sql.Identifier(schema,table)
        await conn.execute('TRUNCATE pg_temp.core_dedup_keys')
        # Seek first/last by primary key, rather than rescanning all remaining
        # candidates to find the next occupied hour after every deletion.
        await conn.execute(sql.SQL("""INSERT INTO core_dedup_keys
            SELECT p.old_mid,f.observed_at,l.observed_at FROM (SELECT DISTINCT old_mid FROM core_dedup_pairs) p
            CROSS JOIN LATERAL (SELECT observed_at FROM {table} r WHERE r.measurement_id=p.old_mid ORDER BY observed_at LIMIT 1) f
            CROSS JOIN LATERAL (SELECT observed_at FROM {table} r WHERE r.measurement_id=p.old_mid ORDER BY observed_at DESC LIMIT 1) l""").format(table=identifier))
        await conn.execute('ANALYZE pg_temp.core_dedup_keys')
        start,last=await (await conn.execute('SELECT min(first_at),max(last_at) FROM core_dedup_keys')).fetchone()
        if start is None:
            print(json.dumps({'chunk':table,'duplicate_compatibility_rows_removed':0}),flush=True)
            continue
        while start<=last:
            start=(await (await conn.execute(sql.SQL("""SELECT min(n.observed_at) FROM core_dedup_keys k
                CROSS JOIN LATERAL (SELECT observed_at FROM {table} r WHERE r.measurement_id=k.old_mid
                    AND r.observed_at>=%s ORDER BY observed_at LIMIT 1) n WHERE k.last_at>=%s""").format(table=identifier),(start,start))).fetchone())[0]
            if start is None:
                break
            end=min(start+timedelta(hours=1),last+timedelta(microseconds=1))
            while True:
                count=(await (await conn.execute(sql.SQL("""SELECT count(*) FROM {table} r
                    JOIN core_dedup_keys k ON k.old_mid=r.measurement_id
                    WHERE r.observed_at>=%s AND r.observed_at<%s""").format(table=identifier),(start,end))).fetchone())[0]
                if count<=MAX_TRANSFER_VALUES:
                    break
                if end-start<=timedelta(microseconds=1):
                    raise ValueError('Single deduplication timestamp exceeds the safe batch limit')
                end=start+(end-start)/2
            result=await conn.execute(sql.SQL("""WITH native AS MATERIALIZED (
                SELECT p.old_mid,r.observed_at,r.value,r.quality FROM core_dedup_pairs p
                JOIN core_dedup_keys k USING(old_mid) JOIN readings r ON r.measurement_id=p.native_mid
                WHERE r.observed_at>=%s AND r.observed_at<%s
            ) DELETE FROM {table} r USING core_dedup_keys k
            WHERE r.measurement_id=k.old_mid AND r.observed_at>=%s AND r.observed_at<%s
              AND EXISTS(SELECT 1 FROM native n WHERE n.old_mid=r.measurement_id AND n.observed_at=r.observed_at
                AND n.value=r.value AND n.quality=r.quality)""").format(table=identifier),(start,end,start,end))
            print(json.dumps({'chunk':table,'deduplication_through':end.isoformat(),'duplicate_compatibility_rows_removed':result.rowcount}),flush=True)
            start=end
    await conn.execute('DROP TABLE pg_temp.core_dedup_keys,pg_temp.core_dedup_pairs')


async def maintain(conn):
    for _ in range(1000):
        result=(await (await conn.execute('SELECT maintain_core_storage()')).fetchone())[0]
        print(json.dumps(result),flush=True)
        if result.get('pending_cutover'):
            raise RuntimeError('Retention requires completed canonical cutover')
        # Acquisition keeps moving the seven-day cutoff. A partial batch in
        # every category means the backlog is drained; do not chase new expiry
        # forever while collectors remain active. Hourly maintenance continues.
        if all(value<(10000 if key=='expired_batch_receipts' else 5000)
               for key,value in result.items()):
            break
    else:
        raise RuntimeError('Retention batch limit reached; run again')


async def compact_reading_chunk(conn, schema, table):
    """Commit metadata-only rewrites hourly, preserving every valid scalar/time."""
    identifier=sql.Identifier(schema,table)
    first,last=await (await conn.execute(sql.SQL(
        'SELECT min(observed_at),max(observed_at) FROM {}').format(identifier))).fetchone()
    changed=invalid=0
    while first is not None and first<=last:
        end=min(first+timedelta(hours=1),last+timedelta(microseconds=1))
        async with conn.transaction():
            await conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
            result=await conn.execute(sql.SQL("DELETE FROM {} WHERE observed_at>=%s AND observed_at<%s AND quality='invalid'").format(identifier),(first,end))
            removed=result.rowcount
            # Derive forbidden keys once from the authoritative filter. Native
            # JSONB subtraction then keeps all allowed values exactly, avoiding
            # a separate aggregate-function invocation for every reading.
            discarded=(await (await conn.execute(sql.SQL("""WITH keys AS MATERIALIZED (
                SELECT DISTINCT jsonb_object_keys(provenance) AS key FROM {}
                WHERE observed_at>=%s AND observed_at<%s
            ), allowed AS MATERIALIZED (
                SELECT compact_reading_details(COALESCE(jsonb_object_agg(key,0),'{{}}')) AS details FROM keys
            ) SELECT COALESCE(array_agg(key) FILTER(WHERE NOT details?key),'{{}}'::text[])
              FROM keys CROSS JOIN allowed""").format(identifier),(first,end))).fetchone())[0]
            await conn.execute("SET LOCAL session_replication_role='replica'")
            result=await conn.execute(sql.SQL("""UPDATE {} SET provenance=provenance-%s::text[],revision=0
                WHERE observed_at>=%s AND observed_at<%s
                  AND (provenance ?| %s::text[] OR revision<>0)""").format(identifier),(discarded,first,end,discarded))
            updated=result.rowcount
        changed+=updated
        invalid+=removed
        print(json.dumps({'chunk':table,'metadata_compacted_through':end.isoformat(),
                          'compacted':updated,'discarded_invalid_placeholders':removed}),flush=True)
        first=(await (await conn.execute(sql.SQL(
            'SELECT min(observed_at) FROM {} WHERE observed_at>=%s AND observed_at<=%s'
        ).format(identifier),(end,last))).fetchone())[0]
    return changed,invalid


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
        changed,invalid=await compact_reading_chunk(conn,schema,table)
        cold=range_end<datetime.now(UTC)-timedelta(days=7)
        if cold and not compress_cold:
            await conn.execute(sql.SQL('VACUUM(FULL,ANALYZE) {}').format(identifier))
        elif not cold:
            # Keep acquisition live on the active chunk; freed pages are reused.
            await conn.execute(sql.SQL('VACUUM(ANALYZE) {}').format(identifier))
        print(json.dumps({'chunk':table,'compacted':changed,'discarded_invalid_placeholders':invalid}),flush=True)
    kind=(await (await conn.execute("SELECT relkind FROM pg_class WHERE oid='latest_readings'::regclass")).fetchone())[0]
    if kind=='r':
        await conn.execute("UPDATE latest_readings SET provenance=compact_reading_details(provenance) WHERE provenance IS DISTINCT FROM compact_reading_details(provenance)")
    await reclaim_operational_tables(conn)


async def reclaim_operational_tables(conn):
    """Repack bounded receipts; keep active latest-key writes online."""
    for table in ('telemetry_ingest_batches','collection_attempts','collected_payloads',
                  'smartcity_observations','nextbike_observations','measurement_heads'):
        kind=await (await conn.execute('SELECT relkind FROM pg_class WHERE oid=to_regclass(%s)',(table,))).fetchone()
        if kind and kind[0]=='r':
            mode='ANALYZE' if table=='measurement_heads' else 'FULL,ANALYZE'
            print(json.dumps({'reclaiming_operational_table':table,'vacuum_mode':mode}),flush=True)
            await conn.execute(sql.SQL('VACUUM('+mode+') {}').format(sql.Identifier(table)))
            print(json.dumps({'reclaimed_operational_table':table}),flush=True)


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


async def configure_maintenance(conn):
    """Keep queries and index maintenance inside the container memory budget."""
    await conn.execute("SET statement_timeout='10min'")
    await conn.execute("SET lock_timeout='10s'")
    await conn.execute('SET max_parallel_workers_per_gather=0')
    await conn.execute('SET max_parallel_maintenance_workers=0')
    await conn.execute("SET work_mem='64MB'")
    await conn.execute("SET maintenance_work_mem='64MB'")


async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install',action='store_true')
    parser.add_argument('--transfer',action='store_true')
    parser.add_argument('--retire',action='store_true')
    parser.add_argument('--maintain',action='store_true')
    parser.add_argument('--compact',action='store_true')
    parser.add_argument('--deduplicate',action='store_true')
    parser.add_argument('--publications',action='store_true')
    parser.add_argument('--publication',action='append')
    parser.add_argument('--compress',action='store_true')
    parser.add_argument('--heads',action='store_true')
    parser.add_argument('--traffic',action='store_true')
    args=parser.parse_args()
    async with await psycopg.AsyncConnection.connect(host=os.environ['DB_HOST'],port=os.getenv('DB_PORT','5432'),
        dbname=os.environ['DB_NAME'],user=os.environ['DB_USER'],password=os.environ['DB_PASSWORD'],autocommit=True,
        application_name='core_storage_consolidation') as conn:
        await configure_maintenance(conn)
        if args.install:
            await conn.execute((MIGRATIONS/'20261103_core_storage.sql').read_text())
        await report(conn)
        if args.publications or args.publication:
            await transfer_publications(conn,selected=args.publication)
        if args.transfer:
            await transfer(conn)
        if args.retire:
            await retire(conn)
        if args.traffic:
            await consolidate_traffic(conn)
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
