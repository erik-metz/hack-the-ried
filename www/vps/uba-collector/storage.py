"""Storage module for Umweltbundesamt (UBA) air data in PostgreSQL/TimescaleDB.
Follows the Three-Table Core Schema (entities, measurement_definitions, readings)
and maintains sensor_metadata/sensor_latest for API and Map compatibility.
"""

import hashlib
import json
import logging
from datetime import UTC, datetime

import psycopg
from config import Settings
from normalize import UbaStationObservation

LOG = logging.getLogger("uba-collector.storage")


async def write_legacy(cur, sensor_id, metric, unit, observed_at, value, attempt_id):
    """Keep one current compatibility row; retain replaced rows in an audit table.

    The caller holds the UBA advisory lock. Canonical revisions and source
    receipts are retained independently of this compatibility projection.
    """
    await cur.execute(
        """SELECT value FROM sensor_data
        WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s""",
        (sensor_id, metric, unit, observed_at),
    )
    rows = await cur.fetchall()
    if len(rows) == 1 and rows[0][0] == value:
        return
    if rows:
        if attempt_id is None:
            raise RuntimeError("A UBA source receipt is required to replace legacy rows")
        await cur.execute(
            """INSERT INTO uba_legacy_repairs
            (sensor_id,metric,unit,observed_at,original_rows,chosen_value,collection_attempt_id)
            SELECT %s,%s,%s,%s,jsonb_agg(to_jsonb(s)),%s,%s FROM sensor_data s
            WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s""",
            (sensor_id, metric, unit, observed_at, value, attempt_id,
             sensor_id, metric, unit, observed_at),
        )
        await cur.execute(
            "DELETE FROM sensor_data WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s",
            (sensor_id, metric, unit, observed_at),
        )
    await cur.execute(
        "INSERT INTO sensor_data(timestamp,sensor_id,metric,value,unit) VALUES (%s,%s,%s,%s,%s)",
        (observed_at, sensor_id, metric, value, unit),
    )


async def persist_stations(
    conn: psycopg.AsyncConnection,
    stations: list[UbaStationObservation],
    settings: Settings,
    now: datetime | None = None,
    payload_bytes: bytes | None = None,
    payload_sha256: str | None = None,
) -> dict:
    if payload_bytes is not None and hashlib.sha256(payload_bytes).hexdigest() != payload_sha256:
        raise ValueError("UBA source receipt checksum mismatch")
    now = now or datetime.now(UTC)
    stats = {
        "stations_updated": 0,
        "measurements_written": 0,
    }

    async with conn.transaction(), conn.cursor() as cur:
        await cur.execute("SET LOCAL statement_timeout = '30s'")
        await cur.execute("SET LOCAL lock_timeout = '10s'")
        await cur.execute(
            "SELECT version FROM collector_schema_versions WHERE version=20260916"
        )
        if await cur.fetchone() is None:
            raise RuntimeError(
                "Apply API schema migration 20260916 before starting collectors"
            )

        # Unique advisory lock for uba-collector
        await cur.execute("SELECT pg_advisory_xact_lock(734225, 1)")

        # 1. Update collection_sources and record collection_attempts
        source_url = f"{settings.uba_api_base}/airquality/json"
        await cur.execute(
            """
            INSERT INTO collection_sources (id, source_url, adapter, enabled, interval_seconds, description)
            VALUES ('uba', %s, 'uba', TRUE, %s, 'Umweltbundesamt (UBA) Luftdaten & Immissionsmessnetz (Ried)')
            ON CONFLICT (id) DO UPDATE SET
                source_url = EXCLUDED.source_url,
                interval_seconds = EXCLUDED.interval_seconds,
                updated_at = NOW()
            """,
            (source_url, settings.poll_seconds),
        )

        if payload_bytes and payload_sha256:
            await cur.execute(
                """
                INSERT INTO collected_payloads (sha256, size_bytes, content_type)
                VALUES (%s, %s, 'application/json')
                ON CONFLICT DO NOTHING
                """,
                (payload_sha256, len(payload_bytes)),
            )
            await cur.execute(
                """
                INSERT INTO collection_attempts (source_id, http_status, payload_sha256, status)
                VALUES ('uba', 200, %s, 'success') RETURNING id
                """,
                (payload_sha256,),
            )
            attempt_id = (await cur.fetchone())[0]
        else:
            await cur.execute(
                """
                INSERT INTO collection_attempts (source_id, http_status, status)
                VALUES ('uba', 200, 'success')
                """
            )
            attempt_id = None

        await cur.execute(
            """SELECT 1 FROM information_schema.routines
            WHERE routine_name = 'write_measurement'
            AND routine_schema = current_schema()
            AND to_regclass('entities') IS NOT NULL"""
        )
        has_measurement_core = (await cur.fetchone()) is not None

        for s in stations:
            # 2. Canonical Three-Table Core Schema
            if has_measurement_core:
                entity_id = f"sensor:{s.sensor_id}"
                meta = {
                    "station_id": s.station_id,
                    "station_code": s.station_code,
                    "name": s.name,
                    "city": s.city,
                    "network": s.network,
                    "station_type": s.station_type,
                    "has_latitude": True,
                    "has_longitude": True,
                    "source_url": f"https://www.umweltbundesamt.de/daten/luft/luftdaten/stationen/egho/{s.station_code}",
                    "description": s.description,
                }
                await cur.execute(
                    """
                    INSERT INTO entities (id, name, entity_type, metadata)
                    VALUES (%s, %s, 'environmental_sensor', %s)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        metadata = entities.metadata || EXCLUDED.metadata,
                        updated_at = NOW()
                    """,
                    (entity_id, s.friendly_name, json.dumps(meta)),
                )

                provenance = json.dumps({
                    "source": "uba",
                    "station_code": s.station_code,
                    "network": s.network,
                })

                # Coordinates as reference measurements
                await cur.execute(
                    """
                    SELECT write_measurement(
                        %s::text, 'latitude'::text, 'degrees'::text, 'sensor-inventory'::text, 'reported'::text,
                        '{"crs":"EPSG:4326"}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                        'valid'::text, NULL::timestamptz, NULL::timestamptz, 'reference'::text
                    )
                    """,
                    (entity_id, s.updated_at, s.latitude, now, provenance),
                )
                await cur.execute(
                    """
                    SELECT write_measurement(
                        %s::text, 'longitude'::text, 'degrees'::text, 'sensor-inventory'::text, 'reported'::text,
                        '{"crs":"EPSG:4326"}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                        'valid'::text, NULL::timestamptz, NULL::timestamptz, 'reference'::text
                    )
                    """,
                    (entity_id, s.updated_at, s.longitude, now, provenance),
                )
                stats["measurements_written"] += 2

                legacy_source = f"legacy-sensor:{s.sensor_id}"
                measurement_provenance = json.dumps({
                    **json.loads(provenance),
                    "collection_attempt_id": attempt_id,
                    "payload_sha256": payload_sha256,
                })
                for m in s.measurements:
                    await cur.execute(
                        """
                        SELECT write_measurement(
                            %s::text, %s::text, %s::text, %s::text, 'observed'::text,
                            '{}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                            'valid'::text, NULL::timestamptz, NULL::timestamptz, 'instantaneous'::text
                        )
                        """,
                        (
                            entity_id,
                            m.metric,
                            m.unit,
                            legacy_source,
                            m.observed_at,
                            m.value,
                            now,
                            measurement_provenance,
                        ),
                    )
                    stats["measurements_written"] += 1

            # 3. Legacy Telemetry & Map Compatibility (sensor_metadata, sensor_data, sensor_latest)
            await cur.execute(
                """
                INSERT INTO sensor_metadata (id, friendly_name, latitude, longitude, description)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    friendly_name = EXCLUDED.friendly_name,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    description = EXCLUDED.description
                """,
                (s.sensor_id, s.friendly_name, s.latitude, s.longitude, s.description),
            )

            for m in s.measurements:
                metrics_to_record = [(m.metric, m.value, m.unit)]
                if m.metric == "PM25":
                    metrics_to_record.append(("PM2.5", m.value, m.unit))

                for metric_name, metric_val, metric_unit in metrics_to_record:
                    await write_legacy(cur, s.sensor_id, metric_name, metric_unit,
                                       m.observed_at, metric_val, attempt_id)
                    await cur.execute(
                        """
                        INSERT INTO sensor_latest (sensor_id, metric, unit, timestamp, value)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (sensor_id, metric, unit) DO UPDATE SET
                            timestamp = EXCLUDED.timestamp,
                            value = EXCLUDED.value
                        WHERE EXCLUDED.timestamp >= sensor_latest.timestamp
                        """,
                        (s.sensor_id, metric_name, metric_unit, m.observed_at, metric_val),
                    )

            stats["stations_updated"] += 1

    return stats
