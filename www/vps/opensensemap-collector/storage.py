"""Storage module for openSenseMap / senseBox sensor data in PostgreSQL/TimescaleDB.
Follows the Three-Table Core Schema (entities, measurement_definitions, readings)
and maintains sensor_metadata/sensor_latest for API and Map compatibility.
"""

import hashlib
import json
import logging
from datetime import UTC, datetime

import psycopg
from config import Settings
from normalize import OpenSenseBoxObservation

LOG = logging.getLogger("opensensemap-collector.storage")


async def write_legacy(cur, sensor, metric, unit, stamp, value, attempt):
    """Maintain the existing last-reported UI projection, with an exact audit.

    Every physical sensor remains separate in the canonical measurement stream.
    """
    await cur.execute("SELECT to_regprocedure('core_storage_enabled()') IS NOT NULL")
    if (await cur.fetchone())[0]:
        await cur.execute("SELECT core_storage_enabled()")
        if (await cur.fetchone())[0]:
            return  # Native measurement already stored; no compatibility copy or audit.
    await cur.execute("""SELECT value FROM sensor_data WHERE sensor_id=%s AND metric=%s
        AND unit=%s AND timestamp=%s""", (sensor, metric, unit, stamp))
    rows = await cur.fetchall()
    if rows == [(value,)]:
        return
    if rows:
        if attempt is None:
            raise RuntimeError("An openSenseMap receipt is required to replace legacy rows")
        await cur.execute("""INSERT INTO opensensemap_legacy_repairs
            (sensor_id,metric,unit,observed_at,original_rows,collection_attempt_id)
            SELECT %s,%s,%s,%s,jsonb_agg(to_jsonb(t)),%s FROM sensor_data t
            WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s""",
            (sensor, metric, unit, stamp, attempt, sensor, metric, unit, stamp))
        await cur.execute("DELETE FROM sensor_data WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s",
                          (sensor, metric, unit, stamp))
    await cur.execute("INSERT INTO sensor_data(timestamp,sensor_id,metric,value,unit) VALUES (%s,%s,%s,%s,%s)",
                      (stamp, sensor, metric, value, unit))


async def persist_boxes(
    conn: psycopg.AsyncConnection,
    boxes: list[OpenSenseBoxObservation],
    settings: Settings,
    now: datetime | None = None,
    payload_bytes: bytes | None = None,
    payload_sha256: str | None = None,
) -> dict:
    if payload_bytes is not None and hashlib.sha256(payload_bytes).hexdigest() != payload_sha256:
        raise ValueError("openSenseMap source receipt checksum mismatch")
    now = now or datetime.now(UTC)
    stats = {
        "boxes_updated": 0,
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

        # Unique advisory lock for opensensemap-collector
        await cur.execute("SELECT pg_advisory_xact_lock(734223, 1)")

        # 1. Update collection_sources and record collection_attempts
        await cur.execute(
            """
            INSERT INTO collection_sources (id, source_url, adapter, enabled, interval_seconds, description)
            VALUES ('opensensemap', %s, 'opensensemap', TRUE, %s, 'openSenseMap & senseBox Open Environmental Sensor Network (Ried)')
            ON CONFLICT (id) DO UPDATE SET
                source_url = EXCLUDED.source_url,
                interval_seconds = EXCLUDED.interval_seconds,
                updated_at = NOW()
            """,
            (settings.opensensemap_url, settings.poll_seconds),
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
                VALUES ('opensensemap', 200, %s, 'success') RETURNING id
                """,
                (payload_sha256,),
            )
            attempt_id = (await cur.fetchone())[0]
        else:
            await cur.execute(
                """
                INSERT INTO collection_attempts (source_id, http_status, status)
                VALUES ('opensensemap', 200, 'success')
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

        for b in boxes:
            # 2. Canonical Three-Table Core Schema
            if has_measurement_core:
                entity_id = f"sensor:{b.sensor_id}"
                meta = {
                    "box_id": b.box_id,
                    "name": b.name,
                    "model": b.model,
                    "exposure": b.exposure,
                    "has_latitude": True,
                    "has_longitude": True,
                    "source_url": f"https://opensensemap.org/explore/{b.box_id}",
                    "description": b.description,
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
                    (entity_id, b.friendly_name, json.dumps(meta)),
                )

                provenance = json.dumps({
                    "source": "opensensemap",
                    "box_id": b.box_id,
                    "model": b.model,
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
                    (entity_id, b.updated_at, b.latitude, now, provenance),
                )
                await cur.execute(
                    """
                    SELECT write_measurement(
                        %s::text, 'longitude'::text, 'degrees'::text, 'sensor-inventory'::text, 'reported'::text,
                        '{"crs":"EPSG:4326"}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                        'valid'::text, NULL::timestamptz, NULL::timestamptz, 'reference'::text
                    )
                    """,
                    (entity_id, b.updated_at, b.longitude, now, provenance),
                )
                stats["measurements_written"] += 2

                legacy_source = f"legacy-sensor:{b.sensor_id}"
                for m in b.measurements:
                    if not m.sensor_id:
                        raise ValueError("A physical openSenseMap sensor ID is required")
                    measurement_provenance = json.dumps({
                        **json.loads(provenance), "sensor_id": m.sensor_id,
                        "sensor_title": m.sensor_title, "sensor_type": m.sensor_type,
                        "collection_attempt_id": attempt_id, "payload_sha256": payload_sha256,
                    })
                    await cur.execute(
                        """
                        SELECT write_measurement(
                            %s::text, %s::text, %s::text, %s::text, 'observed'::text,
                            %s::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                            'valid'::text, NULL::timestamptz, NULL::timestamptz, 'instantaneous'::text
                        )
                        """,
                        (
                            entity_id,
                            m.metric,
                            m.unit,
                            legacy_source,
                            json.dumps({"sensor_id": m.sensor_id}),
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
                (b.sensor_id, b.friendly_name, b.latitude, b.longitude, b.description),
            )

            # Preserve the UI's existing last-reported choice. Never collapse
            # physical sensors in the canonical stream above.
            projection = {}
            for m in b.measurements:
                projection[(m.metric, m.unit, m.observed_at)] = m
            for m in projection.values():
                metrics_to_record = [(m.metric, m.value, m.unit)]
                # If metric is PM25, also mirror to PM2.5 for clients expecting either format
                if m.metric == "PM25":
                    metrics_to_record.append(("PM2.5", m.value, m.unit))

                for metric_name, metric_val, metric_unit in metrics_to_record:
                    await write_legacy(cur, b.sensor_id, metric_name, metric_unit,
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
                        (b.sensor_id, metric_name, metric_unit, m.observed_at, metric_val),
                    )

            stats["boxes_updated"] += 1

    return stats
