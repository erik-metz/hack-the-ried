"""Explicit, additive measurement migration and bounded historical backfill.

No command switches production API readers or drops legacy data. Run inventory
first and rehearse against a restored database before enabling shadow writes.
"""

import argparse
import asyncio
import json
import os
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import psycopg
from endpoints.sensor_integrations import _write_canonical_readings
from psycopg import sql
from psycopg.types.json import Jsonb
from weather_measurements import replay_weather_receipt

MIGRATIONS = Path(__file__).parent / "migrations"
LOCK = 2026093001


async def install(conn, shadow=False):
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK,))
        await conn.execute("SET LOCAL lock_timeout = '10s'")
        await conn.execute((MIGRATIONS / "20260930_measurements.sql").read_text())
        await conn.execute((MIGRATIONS / "20261001_read_models.sql").read_text())
        await conn.execute((MIGRATIONS / "20261001_statistics.sql").read_text())
        await conn.execute((MIGRATIONS / "20261002_inventory.sql").read_text())
        await conn.execute((MIGRATIONS / "20261002_gauges.sql").read_text())
        await conn.execute((MIGRATIONS / "20261003_weather_reconciliation.sql").read_text())
        await conn.execute((MIGRATIONS / "20261004_inventory_coordinates.sql").read_text())
        await conn.execute((MIGRATIONS / "20261004_movement_writer.sql").read_text())
        await conn.execute((MIGRATIONS / "20261004_bulk_history.sql").read_text())
        await conn.execute((MIGRATIONS / "20261005_ais.sql").read_text())
        await conn.execute((MIGRATIONS / "20261005_aircraft.sql").read_text())
        await conn.execute((MIGRATIONS / "20261006_ogn.sql").read_text())
        await conn.execute((MIGRATIONS / "20261006_environment_contract.sql").read_text())
        await conn.execute((MIGRATIONS / "20261021_ttn_interval_statistics.sql").read_text())
        if shadow:
            paused = await (await conn.execute("""SELECT state->>'requires_reconciliation'
                FROM measurement_migration_state WHERE name='shadow_writes'""")).fetchone()
            if paused == ("true",):
                raise RuntimeError("Shadow writes were paused; audit and reconcile the gap before re-enabling")
            await conn.execute((MIGRATIONS / "20260930_shadow_writes.sql").read_text())


async def inventory(conn):
    cursor = await conn.execute("""SELECT schemaname, relname, n_live_tup AS estimated_rows,
        pg_total_relation_size(relid) AS bytes FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC, schemaname, relname""")
    tables = [{"schema": schema, "table": name, "estimated_rows": rows, "bytes": size}
              for schema, name, rows, size in await cursor.fetchall()]
    size = (await (await conn.execute("SELECT pg_database_size(current_database())")).fetchone())[0]
    return {"database_bytes": size, "tables": tables,
            "notice": "Row counts are estimates. Includes Timescale chunks. Check host free disk separately."}


async def capacity(conn, available_gib):
    """Conservative rehearsal gate; free space is a fresh operator-supplied sample.

    PostgreSQL doesn't expose free filesystem space via a portable SQL function.
    Source bytes include inherited Timescale chunks. This estimate is not a
    substitute for measuring actual amplification and WAL on a restored copy.
    """
    available = Decimal(str(available_gib))
    if not available.is_finite() or available < 0:
        raise ValueError("Available disk must be a finite nonnegative GiB value")
    cursor = await conn.execute("""WITH RECURSIVE relations(oid) AS (
        SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=current_schema() AND c.relname IN ('sensor_data','movement_positions')
        UNION
        SELECT i.inhrelid FROM pg_inherits i JOIN relations r ON i.inhparent=r.oid
    ) SELECT COALESCE(SUM(pg_total_relation_size(oid)),0)::bigint FROM relations""")
    source_bytes = (await cursor.fetchone())[0]
    # Four times current source storage plus 2 GiB headroom. Do not allow an
    # accidental full copy on a nearly full VPS even before a sizing rehearsal.
    required_bytes = source_bytes * 4 + 2 * 1024**3
    available_bytes = int(available * 1024**3)
    return {"source_bytes": source_bytes, "available_bytes": available_bytes,
            "minimum_free_bytes": required_bytes, "passes_preliminary_gate": available_bytes >= required_bytes,
            "notice": "Conservative preliminary estimate, not a capacity guarantee. Measure WAL and actual growth in rehearsal."}


async def disable_shadow(conn):
    """Stop extra writes without changing API reads or deleting either history."""
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK,))
        await conn.execute("SET LOCAL lock_timeout = '10s'")
        await conn.execute("DROP TRIGGER IF EXISTS measurement_shadow_sensor ON sensor_data")
        await conn.execute("DROP TRIGGER IF EXISTS measurement_shadow_metadata ON sensor_metadata")
        await conn.execute("DROP TRIGGER IF EXISTS measurement_shadow_statistics ON collected_datasets")
        await conn.execute("DROP TRIGGER IF EXISTS measurement_shadow_chargers ON collected_datasets")
        await conn.execute("DROP TRIGGER IF EXISTS measurement_shadow_gauges ON collected_datasets")
        await conn.execute("DROP TRIGGER IF EXISTS measurement_shadow_coordinates ON collected_datasets")
        await conn.execute("DROP TRIGGER IF EXISTS measurement_shadow_movement ON movement_positions")
        await conn.execute("""UPDATE measurement_migration_state
            SET state='{"enabled":false,"requires_reconciliation":true}',updated_at=NOW()
            WHERE name='shadow_writes'""")


async def retire_unused_registries(conn):
    """Safely drops unmounted legacy registry tables and registers state."""
    async with conn.transaction():
        await conn.execute((MIGRATIONS / "20261004_retire_unused_registries.sql").read_text())
        row = await (await conn.execute("""SELECT state FROM measurement_migration_state
            WHERE name='retired_unused_registries'""")).fetchone()
        return row[0] if row else {"retired": True}


async def audit(conn, start, end):
    """Compare a bounded interval using the current sensor/movement bridge contract.

    This is exact value comparison, not just row counts. Run intervals repeatedly
    to cover history. A clean result does not certify source/metric classification.
    """
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise ValueError("Audit needs an increasing timezone-aware interval")
    async with conn.transaction():
        await conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        await conn.execute("SET LOCAL statement_timeout = '60s'")
        sensors = await conn.execute("""WITH legacy_raw AS (
            SELECT sensor_id,metric,unit,timestamp,MIN(legacy_numeric(value)) AS value,
                COUNT(DISTINCT value) AS variants FROM sensor_data
            WHERE timestamp >= %s AND timestamp < %s GROUP BY sensor_id,metric,unit,timestamp
        ), verified AS (
            SELECT *,CASE WHEN variants>1 THEN weather_history_explained(sensor_id,metric,unit,timestamp)
                ELSE FALSE END AS reconciled FROM legacy_raw
        ), legacy AS (
            SELECT sensor_id,metric,unit,timestamp,variants,reconciled,
                CASE WHEN reconciled THEN (
                    SELECT r.value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
                    WHERE d.entity_id='sensor:'||v.sensor_id AND d.source_id='environment-weather'
                        AND d.basis='model' AND d.dimensions='{}' AND d.metric=v.metric AND d.unit=v.unit
                        AND r.observed_at=v.timestamp
                ) ELSE value END AS value FROM verified v
        ), core AS (
            SELECT substr(d.entity_id,8) AS sensor_id,d.metric,d.unit,r.observed_at AS timestamp,r.value
            FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
            WHERE r.observed_at >= %s AND r.observed_at < %s
                AND d.source_id='legacy-sensor:'||substr(d.entity_id,8) AND d.basis='unknown'
        ) SELECT COUNT(*) FILTER (WHERE l.sensor_id IS NOT NULL),
            COUNT(*) FILTER (WHERE c.sensor_id IS NOT NULL),
            COUNT(*) FILTER (WHERE c.sensor_id IS NULL),
            COUNT(*) FILTER (WHERE l.sensor_id IS NULL),
            COUNT(*) FILTER (WHERE l.sensor_id IS NOT NULL AND c.sensor_id IS NOT NULL
                AND l.value IS DISTINCT FROM c.value),
            COUNT(*) FILTER (WHERE l.variants > 1 AND NOT l.reconciled),
            COUNT(*) FILTER (WHERE l.reconciled)
        FROM legacy l FULL JOIN core c USING(sensor_id,metric,unit,timestamp)""", (start,end,start,end))
        movement = await conn.execute("""WITH legacy AS (
            SELECT entity_id,source_id,basis,timestamp,legacy_numeric(latitude) AS latitude,legacy_numeric(longitude) AS longitude
            FROM movement_positions WHERE timestamp >= %s AND timestamp < %s
        ), core AS (
            SELECT substr(entity_id,10) AS entity_id,source_id,basis,observed_at AS timestamp,latitude,longitude
            FROM measurement_positions WHERE observed_at >= %s AND observed_at < %s
                AND entity_id LIKE 'movement:%%'
        ) SELECT COUNT(*) FILTER (WHERE l.entity_id IS NOT NULL),
            COUNT(*) FILTER (WHERE c.entity_id IS NOT NULL),
            COUNT(*) FILTER (WHERE c.entity_id IS NULL),
            COUNT(*) FILTER (WHERE l.entity_id IS NULL),
            COUNT(*) FILTER (WHERE l.entity_id IS NOT NULL AND c.entity_id IS NOT NULL
                AND (l.latitude,l.longitude) IS DISTINCT FROM (c.latitude,c.longitude))
        FROM legacy l FULL JOIN core c USING(entity_id,source_id,basis,timestamp)""", (start,end,start,end))
        fields = ["legacy_samples","core_samples","missing","extra","different","conflicting_legacy"]
        return {"sensors": dict(zip([*fields,"reconciled_legacy"], await sensors.fetchone(), strict=True)),
                "movements": dict(zip(fields[:5], await movement.fetchone(), strict=True))}


async def backfill(conn, family, batch_size=1000, max_batches=1):
    """Checkpoint keyset batches. Shadow writes must be enabled before scanning.

    Legacy sensor timestamps are not unique. Conflicting duplicate values abort
    the batch for review; identical duplicates collapse to a single reading.
    Backfill never replaces a reading already written by the live path.
    """
    if family not in {"metadata", "sensors", "movements", "statistics", "chargers", "gauges", "weather", "coordinates", "ttn"}:
        raise ValueError("Unsupported backfill family")
    if not 1 <= batch_size <= 10000 or not 1 <= max_batches <= 10000:
        raise ValueError("Batch limits must be between 1 and 10000")
    total = 0
    for _ in range(max_batches):
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK,))
            await conn.execute("SET LOCAL statement_timeout = '60s'")
            await conn.execute("SET LOCAL lock_timeout = '10s'")
            enabled = await (await conn.execute("""SELECT state->>'enabled'
                FROM measurement_migration_state WHERE name='shadow_writes'""")).fetchone()
            if family != "ttn" and enabled != ("true",):
                raise RuntimeError("Enable shadow writes before backfilling")
            name = "backfill:" + family
            await conn.execute("""INSERT INTO measurement_migration_state(name) VALUES (%s)
                ON CONFLICT DO NOTHING""", (name,))
            state = (await (await conn.execute(
                "SELECT state FROM measurement_migration_state WHERE name=%s FOR UPDATE", (name,)
            )).fetchone())[0]
            key = state.get("cursor")
            if family == "ttn":
                phase = state.get("phase", "windows")
                if phase == "windows":
                    condition = sql.SQL("WHERE w.sensor_id LIKE 'ttn-%%'") if key is None else sql.SQL(
                        "WHERE (w.window_end,w.sensor_id,m.metric) > (%s,%s,%s) AND w.sensor_id LIKE 'ttn-%%'")
                    params = () if key is None else (datetime.fromisoformat(key[0]), *key[1:])
                    cursor = await conn.execute(sql.SQL("""SELECT w.window_end,w.sensor_id,
                            w.window_start,w.window_seconds,w.event_id,m.metric,m.unit,
                            m.minimum,m.mean,m.maximum,m.sample_count,
                            COALESCE(e.application_id,'unknown')
                        FROM sensor_measurement_windows w JOIN sensor_window_metrics m
                            USING(sensor_id,window_end)
                        LEFT JOIN LATERAL (SELECT application_id FROM ttn_uplink_events e
                            WHERE e.event_id=w.event_id AND e.device_id=substring(w.sensor_id FROM 5)
                            ORDER BY abs(EXTRACT(EPOCH FROM (e.received_at-w.window_end))) LIMIT 1) e ON TRUE
                        {} ORDER BY w.window_end,w.sensor_id,m.metric LIMIT %s""").format(condition),
                        (*params, batch_size))
                    rows = await cursor.fetchall()
                    exhausted = len(rows) < batch_size
                    for row in rows:
                        end, sensor, start, seconds, event_id, metric, unit, minimum, mean, maximum, count, app_id = row
                        stats = {"metric": metric, "unit": unit, "min_value": minimum,
                                 "mean_value": mean, "max_value": maximum, "sample_count": count}
                        await _write_canonical_readings(conn, sensor_id=sensor,
                            device_id=sensor.removeprefix("ttn-"), application_id=app_id,
                            event_id=event_id, observed_at=end, collected_at=end,
                            measurements=[{"metric": metric, "unit": unit, "value": mean}],
                            window=(seconds, [stats]), backfill=True, window_start=start)
                    if rows:
                        key = [rows[-1][0].isoformat(), rows[-1][1], rows[-1][5]]
                    if exhausted:
                        key = None
                        state.update(phase="points", cursor=None)
                else:
                    condition = sql.SQL("WHERE s.sensor_id LIKE 'ttn-%%'") if key is None else sql.SQL(
                        "WHERE (s.timestamp,s.sensor_id,s.metric,s.unit) > (%s,%s,%s,%s) AND s.sensor_id LIKE 'ttn-%%'")
                    params = () if key is None else (datetime.fromisoformat(key[0]), *key[1:])
                    cursor = await conn.execute(sql.SQL("""SELECT s.timestamp,s.sensor_id,
                            s.metric,s.unit,MIN(legacy_numeric(s.value)),COUNT(DISTINCT s.value)
                        FROM sensor_data s {}
                        AND NOT EXISTS (SELECT 1 FROM sensor_measurement_windows w
                            WHERE w.sensor_id=s.sensor_id AND w.window_end=s.timestamp)
                        GROUP BY s.timestamp,s.sensor_id,s.metric,s.unit
                        ORDER BY s.timestamp,s.sensor_id,s.metric,s.unit LIMIT %s""").format(condition),
                        (*params, batch_size))
                    rows = await cursor.fetchall()
                    exhausted = len(rows) < batch_size
                    for stamp, sensor, metric, unit, value, variants in rows:
                        if variants != 1:
                            raise ValueError(f"Conflicting TTN legacy values for {sensor}/{metric} at {stamp}")
                        await _write_canonical_readings(conn, sensor_id=sensor,
                            device_id=sensor.removeprefix("ttn-"), application_id="legacy",
                            event_id="legacy-unlinked", observed_at=stamp, collected_at=stamp,
                            measurements=[{"metric": metric, "unit": unit, "value": value}],
                            window=None, backfill=True)
                    if rows:
                        key = [rows[-1][0].isoformat(), *rows[-1][1:4]]
                total += len(rows)
                state.update(cursor=key, processed=state.get("processed", 0) + len(rows),
                             caught_up=phase == "points" and exhausted)
                await conn.execute("""UPDATE measurement_migration_state SET state=%s,updated_at=NOW()
                    WHERE name=%s""", (Jsonb(state), name))
            elif family == "gauges":
                cursor = await conn.execute("""SELECT dataset FROM collected_datasets
                    WHERE dataset IN ('environment/flood/gauges','map/layers/floods')
                    AND (%s::text IS NULL OR dataset > %s) ORDER BY dataset LIMIT %s FOR UPDATE""", (key,key,batch_size))
                rows = await cursor.fetchall()
                exhausted = len(rows) < batch_size
                for (dataset,) in rows:
                    await conn.execute("SELECT mirror_gauge_publication(d) FROM collected_datasets d WHERE dataset=%s", (dataset,))
                if rows:
                    key = rows[-1][0]
            elif family == "coordinates":
                cursor = await conn.execute("""SELECT dataset FROM collected_datasets
                    WHERE is_coordinate_publication(dataset) AND (%s::text IS NULL OR dataset > %s)
                    ORDER BY dataset LIMIT %s FOR UPDATE""", (key,key,batch_size))
                rows = await cursor.fetchall()
                exhausted = len(rows) < batch_size
                for (dataset,) in rows:
                    await conn.execute("SELECT mirror_coordinate_publication(d) FROM collected_datasets d WHERE dataset=%s", (dataset,))
                if rows:
                    key = rows[-1][0]
            elif family == "weather":
                cursor = await conn.execute("""SELECT a.id,a.received_at,a.payload_sha256,p.body
                    FROM collection_attempts a LEFT JOIN collected_payloads p ON p.sha256=a.payload_sha256
                    WHERE a.source_id='environment-weather' AND a.status='success'
                      AND a.http_status=200 AND a.id > %s
                    ORDER BY a.id LIMIT %s""", (key or 0,batch_size))
                rows = await cursor.fetchall()
                exhausted = len(rows) < batch_size
                for receipt in rows:
                    if receipt[3] is None:
                        raise ValueError(f"Missing archived weather payload for receipt {receipt[0]}")
                    await replay_weather_receipt(conn, *receipt)
                if rows:
                    key = rows[-1][0]
            elif family == "chargers":
                cursor = await conn.execute("""SELECT dataset FROM collected_datasets
                    WHERE dataset IN ('infrastructure/ev-charging','map/layers/charging')
                    AND (%s::text IS NULL OR dataset > %s) ORDER BY dataset LIMIT %s FOR UPDATE""", (key,key,batch_size))
                rows = await cursor.fetchall()
                exhausted = len(rows) < batch_size
                for (dataset,) in rows:
                    await conn.execute("SELECT mirror_charger_publication(d) FROM collected_datasets d WHERE dataset=%s", (dataset,))
                if rows:
                    key = rows[-1][0]
            elif family == "statistics":
                cursor = await conn.execute("""SELECT dataset FROM collected_datasets
                    WHERE dataset LIKE 'statistics/%%' AND (%s::text IS NULL OR dataset > %s)
                    ORDER BY dataset LIMIT %s FOR UPDATE""", (key,key,batch_size))
                rows = await cursor.fetchall()
                exhausted = len(rows) < batch_size
                for (dataset,) in rows:
                    await conn.execute("SELECT mirror_statistical_publication(d) FROM collected_datasets d WHERE dataset=%s", (dataset,))
                if rows:
                    key = rows[-1][0]
            elif family == "metadata":
                cursor = await conn.execute("""SELECT id FROM sensor_metadata
                    WHERE (%s::text IS NULL OR id > %s) ORDER BY id LIMIT %s""", (key,key,batch_size))
                rows = await cursor.fetchall()
                exhausted = len(rows) < batch_size
                for (sensor,) in rows:
                    await conn.execute("SELECT 1 FROM sensor_metadata WHERE id=%s FOR SHARE", (sensor,))
                    await conn.execute("SELECT mirror_sensor_metadata(m) FROM sensor_metadata m WHERE id=%s", (sensor,))
                if rows:
                    key = rows[-1][0]
            elif family == "sensors":
                condition = sql.SQL("") if key is None else sql.SQL(
                    "WHERE timestamp >= %s AND (timestamp,sensor_id,metric,unit) > (%s,%s,%s,%s)")
                params = () if key is None else (datetime.fromisoformat(key[0]),
                                                datetime.fromisoformat(key[0]), *key[1:])
                # Bound the ordered physical scan before deduplication. A global
                # GROUP BY forces millions of historical rows through a sort for
                # every small batch. Exact-key validation below still reads all
                # duplicates, including ones beyond this physical batch boundary.
                cursor = await conn.execute(sql.SQL("""SELECT timestamp,sensor_id,metric,unit
                    FROM sensor_data {}
                    ORDER BY timestamp,sensor_id,metric,unit LIMIT %s""").format(condition),
                    (*params, batch_size))
                rows = await cursor.fetchall()
                exhausted = len(rows) < batch_size
                rows = list(dict.fromkeys(rows))
                keys = [{"observed_at": stamp.isoformat(), "sensor_id": sensor,
                         "metric": metric, "unit": unit} for stamp, sensor, metric, unit in rows]
                try:
                    await conn.execute("SELECT backfill_sensor_samples(%s)", (Jsonb(keys),))
                except psycopg.errors.CardinalityViolation as exc:
                    raise ValueError(str(exc).splitlines()[0]) from exc
                if rows:
                    key = [rows[-1][0].isoformat(), *rows[-1][1:4]]
            else:
                condition = sql.SQL("") if key is None else sql.SQL(
                    "WHERE (timestamp,entity_id,basis) > (%s,%s,%s)")
                params = () if key is None else (datetime.fromisoformat(key[0]), *key[1:])
                cursor = await conn.execute(sql.SQL("""SELECT timestamp,entity_id,basis
                    FROM movement_positions {} ORDER BY timestamp,entity_id,basis LIMIT %s""").format(condition),
                    (*params, batch_size))
                rows = await cursor.fetchall()
                exhausted = len(rows) < batch_size
                keys = [{"observed_at": stamp.isoformat(), "entity_id": entity, "basis": basis}
                        for stamp, entity, basis in rows]
                await conn.execute("SELECT backfill_movement_samples(%s)", (Jsonb(keys),))
                if rows:
                    key = [rows[-1][0].isoformat(), *rows[-1][1:]]
            if family != "ttn":
                total += len(rows)
                state.update(cursor=key, processed=state.get("processed", 0) + len(rows),
                             caught_up=exhausted)
                await conn.execute("""UPDATE measurement_migration_state SET state=%s,updated_at=NOW()
                    WHERE name=%s""", (Jsonb(state), name))
        if exhausted and (family != "ttn" or state.get("caught_up")):
            break
    return {"batch_processed": total, **state}


async def main(args):
    async with await psycopg.AsyncConnection.connect(
        host=os.getenv("DB_HOST", "timescaledb"), port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "mydatabase"), user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""), connect_timeout=10, autocommit=True,
    ) as conn:
        if args.action == "inventory":
            result = await inventory(conn)
        elif args.action == "install":
            if args.shadow:
                if args.available_disk_gib is None:
                    raise ValueError("Enabling shadow writes requires --available-disk-gib from a fresh host disk check")
                report = await capacity(conn, args.available_disk_gib)
                if not report['passes_preliminary_gate']:
                    raise RuntimeError("Insufficient preliminary migration headroom: " + json.dumps(report))
            await install(conn, args.shadow)
            result = {"schema": 20260930, "shadow_enabled": args.shadow}
        elif args.action == "disable-shadow":
            await disable_shadow(conn)
            result = {"shadow_enabled": False, "requires_reconciliation": True}
        elif args.action == "audit":
            result = await audit(conn, datetime.fromisoformat(args.start), datetime.fromisoformat(args.end))
        elif args.action == "capacity":
            result = await capacity(conn, args.available_disk_gib)
        elif args.action == "retire-unused-registries":
            result = await retire_unused_registries(conn)
        else:
            report = await capacity(conn, args.available_disk_gib)
            if not report['passes_preliminary_gate']:
                raise RuntimeError("Insufficient preliminary migration headroom: " + json.dumps(report))
            result = await backfill(conn, args.family, args.batch_size, args.max_batches)
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("inventory")
    install_parser = sub.add_parser("install")
    install_parser.add_argument("--shadow", action="store_true")
    install_parser.add_argument("--available-disk-gib", type=Decimal)
    sub.add_parser("disable-shadow")
    sub.add_parser("retire-unused-registries")
    capacity_parser = sub.add_parser("capacity")
    capacity_parser.add_argument("--available-disk-gib", type=Decimal, required=True)
    audit_parser = sub.add_parser("audit")
    audit_parser.add_argument("--start", required=True)
    audit_parser.add_argument("--end", required=True)
    backfill_parser = sub.add_parser("backfill")
    backfill_parser.add_argument("family", choices=["metadata", "sensors", "movements", "statistics", "chargers", "gauges", "weather", "coordinates", "ttn"])
    backfill_parser.add_argument("--batch-size", type=int, default=1000)
    backfill_parser.add_argument("--max-batches", type=int, default=1)
    backfill_parser.add_argument("--available-disk-gib", type=Decimal, required=True,
                                 help="Fresh available GiB on the database volume from host df; not container RAM")
    asyncio.run(main(parser.parse_args()))
