"""Storage module for TTN Mapper and Packet Broker gateways in PostgreSQL/TimescaleDB.
Follows the Three-Table Core Schema (entities, measurement_definitions, readings)
and maintains sensor_metadata/sensor_latest for API/Map compatibility.
"""

import hashlib
import json
import logging
from datetime import UTC, datetime

import psycopg
from config import Settings
from normalize import NormalizedGateway, RiedCoverageSnapshot

LOG = logging.getLogger("ttnmapper-collector.storage")


async def persist_gateways(
    conn: psycopg.AsyncConnection,
    gateways: list[NormalizedGateway],
    snapshot: RiedCoverageSnapshot,
    settings: Settings,
    now: datetime | None = None,
    payload_bytes: bytes | None = None,
    payload_sha256: str | None = None,
    backfill: bool = False,
    attempt_id: int | None = None,
) -> dict:
    now = now or datetime.now(UTC)
    if payload_bytes is not None:
        actual_hash = hashlib.sha256(payload_bytes).hexdigest()
        if payload_sha256 != actual_hash:
            raise ValueError("Gateway payload checksum mismatch")
    stats = {
        "gateways_updated": 0,
        "measurements_written": 0,
        "area_metrics_written": 0,
    }
    if not gateways:
        return stats

    async with conn.transaction(), conn.cursor() as cur:
        await cur.execute("SET LOCAL statement_timeout = '30s'")
        await cur.execute("SET LOCAL lock_timeout = '10s'")

        # Schema version gate if table exists
        await cur.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = 'collector_schema_versions'"
        )
        if (await cur.fetchone()) is not None:
            await cur.execute(
                "SELECT version FROM collector_schema_versions WHERE version=20260916"
            )
            if await cur.fetchone() is None:
                raise RuntimeError(
                    "Apply API schema migration 20260916 before starting collectors"
                )

        # Unique advisory lock for ttnmapper-collector
        await cur.execute("SELECT pg_advisory_xact_lock(734225, 1)")

        # Check collection_sources table
        await cur.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = 'collection_sources'"
        )
        if (await cur.fetchone()) is not None:
            await cur.execute(
                """
                INSERT INTO collection_sources (id, source_url, adapter, enabled, interval_seconds, description)
                VALUES ('ttnmapper', %s, 'packetbroker', TRUE, %s, 'TTN Mapper & Packet Broker LoRaWAN Gateway Coverage (Ried)')
                ON CONFLICT (id) DO UPDATE SET
                    source_url = EXCLUDED.source_url,
                    adapter = EXCLUDED.adapter,
                    enabled = TRUE,
                    interval_seconds = EXCLUDED.interval_seconds,
                    description = EXCLUDED.description,
                    updated_at = NOW()
                """,
                (settings.packetbroker_api_url, settings.poll_seconds),
            )

        # Keep the original response and link it to this poll, atomically with its data.
        if payload_bytes is not None:
            await cur.execute(
                """INSERT INTO collected_payloads(sha256,body,content_type,received_at)
                VALUES (%s,%s,'application/json',%s) ON CONFLICT DO NOTHING""",
                (payload_sha256, payload_bytes, now),
            )
            if attempt_id is not None:
                await cur.execute(
                    """UPDATE collection_attempts SET payload_sha256=%s,http_status=200,
                    fetched_at=%s WHERE id=%s AND source_id='ttnmapper'""",
                    (payload_sha256, now, attempt_id),
                )
                if cur.rowcount != 1:
                    raise ValueError("Gateway collection attempt missing")

        # Check Three-Table Core routine
        await cur.execute(
            """SELECT 1 FROM information_schema.routines
            WHERE routine_name = 'write_measurement'
            AND routine_schema = current_schema()
            AND to_regclass('entities') IS NOT NULL"""
        )
        has_measurement_core = (await cur.fetchone()) is not None

        # 1. Canonical Three-Table Core Schema: Physical Gateways
        for gw in gateways:
            if has_measurement_core:
                entity_id = f"lora:gateway:{gw.gateway_id}"
                meta = {
                    "gateway_id": gw.gateway_id,
                    "eui": gw.eui,
                    "net_id": gw.net_id,
                    "tenant_id": gw.tenant_id,
                    "cluster_id": gw.cluster_id,
                    "antenna_placement": gw.antenna_placement,
                    "has_latitude": True,
                    "has_longitude": True,
                    "altitude": gw.altitude,
                    "source": "ttnmapper",
                    "description": gw.description,
                }
                await cur.execute(
                    """
                    INSERT INTO entities (id, name, entity_type, metadata)
                    VALUES (%s, %s, 'lora_gateway', %s)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        metadata = entities.metadata || EXCLUDED.metadata,
                        updated_at = NOW()
                    """,
                    (entity_id, gw.friendly_name, json.dumps(meta)),
                )

                provenance = json.dumps({
                    "source": "packetbroker",
                    "tenant_id": gw.tenant_id,
                    "cluster_id": gw.cluster_id,
                })

                # Coordinates as reference measurements
                await cur.execute(
                    """
                    SELECT write_measurement(
                        %s::text, 'latitude'::text, 'degrees'::text, 'lora-infrastructure'::text, 'reported'::text,
                        '{"crs":"EPSG:4326"}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                        'valid'::text, NULL::timestamptz, NULL::timestamptz, 'reference'::text, %s::boolean
                    )
                    """,
                    (entity_id, gw.updated_at, gw.latitude, now, provenance, backfill),
                )
                await cur.execute(
                    """
                    SELECT write_measurement(
                        %s::text, 'longitude'::text, 'degrees'::text, 'lora-infrastructure'::text, 'reported'::text,
                        '{"crs":"EPSG:4326"}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                        'valid'::text, NULL::timestamptz, NULL::timestamptz, 'reference'::text, %s::boolean
                    )
                    """,
                    (entity_id, gw.updated_at, gw.longitude, now, provenance, backfill),
                )
                stats["measurements_written"] += 2

                if gw.altitude is not None:
                    await cur.execute(
                        """
                        SELECT write_measurement(
                            %s::text, 'altitude'::text, 'm'::text, 'lora-infrastructure'::text, 'reported'::text,
                            '{}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                            'valid'::text, NULL::timestamptz, NULL::timestamptz, 'reference'::text, %s::boolean
                        )
                        """,
                        (entity_id, gw.updated_at, gw.altitude, now, provenance, backfill),
                    )
                    stats["measurements_written"] += 1

                # Online is the state returned by this poll. Gateway updatedAt
                # belongs to the registry entry, not the observation of its status.
                status_provenance = json.dumps({
                    **json.loads(provenance),
                    "gateway_updated_at": gw.updated_at.isoformat(),
                    **({"payload_sha256": payload_sha256} if payload_bytes is not None else {}),
                    **({"collection_attempt_id": attempt_id} if attempt_id is not None else {}),
                })
                online_val = 1.0 if gw.online else 0.0
                await cur.execute(
                    """
                    SELECT write_measurement(
                        %s::text, 'online_status'::text, 'state'::text, 'ttnmapper'::text, 'observed'::text,
                        '{}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                        'valid'::text, NULL::timestamptz, NULL::timestamptz, 'state'::text, %s::boolean
                    )
                    """,
                    (entity_id, now, online_val, now, status_provenance, backfill),
                )
                stats["measurements_written"] += 1

            # 2. Legacy Telemetry & Map Compatibility (sensor_metadata, sensor_data, sensor_latest)
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
                (gw.sensor_id, gw.friendly_name, gw.latitude, gw.longitude, gw.description),
            )

            status_val = 1.0 if gw.online else 0.0
            await cur.execute(
                """SELECT 1 FROM sensor_data WHERE timestamp=%s AND sensor_id=%s
                AND metric='online_status' AND unit='state' AND value IS DISTINCT FROM %s LIMIT 1""",
                (now, gw.sensor_id, status_val),
            )
            if await cur.fetchone() is not None:
                raise ValueError("Conflicting gateway status for the same poll")
            # sensor_data has no unique key: ON CONFLICT does not make retries idempotent.
            # The collector advisory lock serializes the existence check and insertion.
            await cur.execute(
                """INSERT INTO sensor_data (timestamp, sensor_id, metric, value, unit)
                SELECT %s, %s, 'online_status', %s, 'state' WHERE NOT EXISTS (
                    SELECT 1 FROM sensor_data WHERE timestamp=%s AND sensor_id=%s
                    AND metric='online_status' AND unit='state')""",
                (now, gw.sensor_id, status_val, now, gw.sensor_id),
            )
            await cur.execute(
                """
                INSERT INTO sensor_latest (sensor_id, metric, unit, timestamp, value)
                VALUES (%s, 'online_status', 'state', %s, %s)
                ON CONFLICT (sensor_id, metric, unit) DO UPDATE SET
                    timestamp = EXCLUDED.timestamp,
                    value = EXCLUDED.value
                WHERE EXCLUDED.timestamp >= sensor_latest.timestamp
                """,
                (gw.sensor_id, now, status_val),
            )

            stats["gateways_updated"] += 1

        # 3. Canonical Three-Table Core Schema: Regional Ried Ausbau Tracking Area
        if has_measurement_core and snapshot.total_gateways > 0:
            area_id = "lora:area:hessisches_ried"
            area_meta = {
                "region": "Hessisches Ried",
                "center_lat": settings.center_lat,
                "center_lon": settings.center_lon,
                "radius_meters": settings.radius_meters,
                "source": "ttnmapper",
                "description": "LoRaWAN Ausbau- und Versorgungsmonitoring für das Hessische Ried",
            }
            await cur.execute(
                """
                INSERT INTO entities (id, name, entity_type, metadata)
                VALUES (%s, 'LoRaWAN-Ausbau Hessisches Ried', 'lora_coverage_area', %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    metadata = entities.metadata || EXCLUDED.metadata,
                    updated_at = NOW()
                """,
                (area_id, json.dumps(area_meta)),
            )

            area_provenance = json.dumps({
                "source": "ttnmapper-sync",
                "gateways_sampled": snapshot.total_gateways,
            })

            metrics = [
                ("active_gateways_count", snapshot.active_gateways, "count"),
                ("total_gateways_count", snapshot.total_gateways, "count"),
                ("outdoor_gateways_count", snapshot.outdoor_gateways, "count"),
                ("indoor_gateways_count", snapshot.indoor_gateways, "count"),
                ("online_ratio", snapshot.online_ratio_pct, "percent"),
            ]

            for metric_name, val, unit in metrics:
                await cur.execute(
                    """
                    SELECT write_measurement(
                        %s::text, %s::text, %s::text, 'ttnmapper'::text, 'observed'::text,
                        '{}'::jsonb, %s::timestamptz, %s::numeric, %s::timestamptz, %s::jsonb,
                        'valid'::text, NULL::timestamptz, NULL::timestamptz, 'instantaneous'::text, %s::boolean
                    )
                    """,
                    (area_id, metric_name, unit, snapshot.observed_at, val, now, area_provenance, backfill),
                )
                stats["area_metrics_written"] += 1

    return stats
