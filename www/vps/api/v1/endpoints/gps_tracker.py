"""TTN GPS tracker ingestion with application-level encryption and gateway identification."""

import hashlib
import logging
import os
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg_pool
from cryptography.exceptions import InvalidTag
from dependencies import get_db_pool, verify_admin_key
from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from gps_crypto import decrypt_gps_data, encrypt_gps_data

logger = logging.getLogger(__name__)

router = APIRouter(tags=["GPS Tracker"])
basic_auth = HTTPBasic(auto_error=False)

DEVICE_ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$")


def _authenticate(credentials: HTTPBasicCredentials | None) -> None:
    username = os.getenv("TTN_WEBHOOK_USERNAME", "")
    password = os.getenv("TTN_WEBHOOK_PASSWORD", "")
    if not username or not password:
        raise HTTPException(503, "TTN webhook credentials are not configured")
    supplied_username = credentials.username if credentials else ""
    supplied_password = credentials.password if credentials else ""
    username_ok = secrets.compare_digest(supplied_username, username)
    password_ok = secrets.compare_digest(supplied_password, password)
    if not (username_ok and password_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


def _event_time(uplink: dict[str, Any], body: dict[str, Any]) -> datetime:
    value = uplink.get("received_at") or body.get("received_at")
    if not isinstance(value, str):
        raise HTTPException(422, "Uplink received_at timestamp is required")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(422, "Uplink received_at must be ISO-8601") from exc
    if parsed.tzinfo is None:
        raise HTTPException(422, "Uplink received_at must include a timezone")
    return parsed.astimezone(UTC)


def _inspect_gateways(rx_metadata: list[dict[str, Any]]) -> dict[str, Any]:
    """Examine rx_metadata to distinguish own gateway from public TTN gateways."""
    own_gw_id = os.getenv("OWN_GATEWAY_ID", "kamue-gateway").strip().lower()
    own_gw_eui = os.getenv("OWN_GATEWAY_EUI", "98FE54FFFE63713B").strip().upper().replace("-", "").replace(":", "")

    received_by_own = False
    own_rssi: int | None = None
    own_snr: float | None = None

    best_gw_id: str | None = None
    best_gw_rssi: int | None = None
    best_gw_snr: float | None = None

    for meta in rx_metadata:
        gw_ids = meta.get("gateway_ids") or {}
        gw_id = str(gw_ids.get("gateway_id", "")).strip()
        gw_eui = str(gw_ids.get("eui", "")).strip().upper().replace("-", "").replace(":", "")
        rssi = meta.get("rssi")
        snr = meta.get("snr")

        # Track overall best gateway
        if isinstance(rssi, (int, float)):
            rssi_int = int(rssi)
            if best_gw_rssi is None or rssi_int > best_gw_rssi:
                best_gw_rssi = rssi_int
                best_gw_id = gw_id or gw_eui or "unknown-gateway"
                best_gw_snr = float(snr) if isinstance(snr, (int, float)) else None

        # Check if this matches our own gateway
        is_own = (
            (gw_id and gw_id.lower() == own_gw_id) or
            (gw_eui and own_gw_eui and gw_eui == own_gw_eui)
        )
        if is_own:
            received_by_own = True
            if isinstance(rssi, (int, float)):
                own_rssi = int(rssi)
            if isinstance(snr, (int, float)):
                own_snr = float(snr)

    return {
        "received_by_own_gateway": received_by_own,
        "own_gateway_rssi": own_rssi,
        "own_gateway_snr": own_snr,
        "best_gateway_id": best_gw_id,
        "best_gateway_rssi": best_gw_rssi,
        "best_gateway_snr": best_gw_snr,
        "gateway_count": len(rx_metadata),
    }


@router.post(
    "/integrations/gps/uplink",
    status_code=status.HTTP_200_OK,
    summary="Receive batched GPS uplinks from TTN with encrypted storage",
)
async def receive_gps_uplink(
    body: dict[str, Any],
    credentials: HTTPBasicCredentials | None = Security(basic_auth),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    _authenticate(credentials)
    ids = body.get("end_device_ids")
    if not isinstance(ids, dict) or not isinstance(ids.get("application_ids"), dict):
        raise HTTPException(422, "end_device_ids and application_ids are required")

    application_id = ids["application_ids"].get("application_id")
    device_id = ids.get("device_id")
    expected_app = os.getenv("TTN_APPLICATION_ID", "").strip()
    if expected_app and application_id != expected_app:
        raise HTTPException(403, "Uplink belongs to an unconfigured TTN application")

    if not isinstance(device_id, str) or not DEVICE_ID_PATTERN.fullmatch(device_id):
        raise HTTPException(422, "TTN device_id must be a lowercase slug")

    uplink = body.get("uplink_message")
    if not isinstance(uplink, dict):
        raise HTTPException(422, "uplink_message is required")

    observed_at = _event_time(uplink, body)
    decoded_payload = uplink.get("decoded_payload") or {}
    rx_metadata = uplink.get("rx_metadata") or []
    gw_stats = _inspect_gateways(rx_metadata)

    # Correlate event identity
    correlations = body.get("correlation_ids") or []
    event_id = next((v for v in correlations if isinstance(v, str) and v.startswith("as:up:")), None)
    if not event_id:
        digest_mat = f"{application_id}:{device_id}:{observed_at.isoformat()}:{uplink.get('f_cnt')}"
        event_id = hashlib.sha256(digest_mat.encode()).hexdigest()

    # Extract positions: either multi-position array (v2) or single fix (v1)
    points_to_insert = []
    positions = decoded_payload.get("positions")
    if isinstance(positions, list) and len(positions) > 0:
        for p in positions:
            if not isinstance(p, dict):
                continue
            has_fix = bool(p.get("has_fix"))
            try:
                slot = int(p.get("slot", 0))
                offset_seconds = int(p.get("offset_seconds", 0))
            except (TypeError, ValueError):
                continue
            if not 0 <= slot <= 4:
                continue
            recorded_at = observed_at + timedelta(seconds=offset_seconds)

            if has_fix and p.get("latitude") is not None and p.get("longitude") is not None:
                coord_payload = {
                    "latitude": float(p["latitude"]),
                    "longitude": float(p["longitude"]),
                    "altitude": p.get("altitude"),
                    "satellites": p.get("satellites"),
                }
                encrypted = encrypt_gps_data(coord_payload)
            else:
                encrypted = encrypt_gps_data({"has_fix": False})

            points_to_insert.append((
                device_id,
                event_id,
                recorded_at,
                observed_at,
                slot,
                has_fix,
                gw_stats["received_by_own_gateway"],
                gw_stats["own_gateway_rssi"],
                gw_stats["own_gateway_snr"],
                gw_stats["best_gateway_id"],
                gw_stats["best_gateway_rssi"],
                gw_stats["best_gateway_snr"],
                gw_stats["gateway_count"],
                encrypted,
            ))
    elif decoded_payload.get("latitude") is not None and decoded_payload.get("longitude") is not None:
        # Legacy v1 single fix packet
        has_fix = bool(decoded_payload.get("gps_fix", True))
        coord_payload = {
            "latitude": float(decoded_payload["latitude"]),
            "longitude": float(decoded_payload["longitude"]),
            "altitude": decoded_payload.get("altitude"),
            "satellites": decoded_payload.get("satellites"),
        }
        encrypted = encrypt_gps_data(coord_payload)
        points_to_insert.append((
            device_id,
            event_id,
            observed_at,
            observed_at,
            0,
            has_fix,
            gw_stats["received_by_own_gateway"],
            gw_stats["own_gateway_rssi"],
            gw_stats["own_gateway_snr"],
            gw_stats["best_gateway_id"],
            gw_stats["best_gateway_rssi"],
            gw_stats["best_gateway_snr"],
            gw_stats["gateway_count"],
            encrypted,
        ))

    if not points_to_insert:
        return {"status": "ignored", "reason": "No GPS positions to record", "event_id": event_id}

    async with pool.connection() as conn, conn.transaction(), conn.cursor() as cur:
        await cur.executemany(
            """INSERT INTO gps_tracker_points (
                device_id, uplink_event_id, recorded_at, received_at,
                slot_index, has_fix, received_by_own_gateway,
                own_gateway_rssi, own_gateway_snr,
                best_gateway_id, best_gateway_rssi, best_gateway_snr,
                gateway_count, encrypted_payload
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (uplink_event_id, slot_index) DO NOTHING""",
            points_to_insert,
        )

    return {
        "status": "accepted",
        "device_id": device_id,
        "event_id": event_id,
        "points_recorded": len(points_to_insert),
        "received_by_own_gateway": gw_stats["received_by_own_gateway"],
        "gateways_heard": gw_stats["gateway_count"],
    }


@router.get(
    "/admin/gps-tracker/points",
    dependencies=[Security(verify_admin_key)],
    summary="Retrieve decrypted GPS tracker points for coverage visualization",
)
async def get_gps_tracker_points(
    device_id: str | None = Query(None, description="Optional device filter"),
    since: datetime | None = Query(None, description="Filter points recorded at or after this time"),
    only_own_gateway: bool = Query(False, description="Filter for points heard by own gateway only"),
    limit: int = Query(1000, ge=1, le=5000),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    query = """
        SELECT id, device_id, uplink_event_id, recorded_at, received_at,
               slot_index, has_fix, received_by_own_gateway,
               own_gateway_rssi, own_gateway_snr,
               best_gateway_id, best_gateway_rssi, best_gateway_snr,
               gateway_count, encrypted_payload
        FROM gps_tracker_points
        WHERE 1=1
    """
    params = []
    if device_id:
        query += " AND device_id = %s"
        params.append(device_id)
    if since:
        query += " AND recorded_at >= %s"
        params.append(since)
    if only_own_gateway:
        query += " AND received_by_own_gateway = TRUE"

    # Bound the latest history, then restore chronological order for the route.
    # Limiting ascending rows would permanently hide newer trips once full.
    query += " ORDER BY recorded_at DESC, id DESC LIMIT %s"
    params.append(limit)

    results = []
    async with pool.connection() as conn:
        rows = await (await conn.execute(query, tuple(params))).fetchall()
        for row in reversed(rows):
            point = {
                "id": row["id"],
                "device_id": row["device_id"],
                "recorded_at": row["recorded_at"].isoformat(),
                "received_at": row["received_at"].isoformat(),
                "slot_index": row["slot_index"],
                "has_fix": row["has_fix"],
                "received_by_own_gateway": row["received_by_own_gateway"],
                "own_gateway_rssi": row["own_gateway_rssi"],
                "own_gateway_snr": row["own_gateway_snr"],
                "best_gateway_id": row["best_gateway_id"],
                "best_gateway_rssi": row["best_gateway_rssi"],
                "best_gateway_snr": row["best_gateway_snr"],
                "gateway_count": row["gateway_count"],
            }
            # Decrypt the encrypted payload on-the-fly
            if row["encrypted_payload"]:
                try:
                    decrypted = decrypt_gps_data(bytes(row["encrypted_payload"]))
                    point.update(decrypted)
                except (InvalidTag, ValueError) as exc:
                    logger.warning("Failed to decrypt GPS point %s: %s", row["id"], exc)
                    point["decryption_error"] = True

            results.append(point)

    return {"count": len(results), "points": results}
