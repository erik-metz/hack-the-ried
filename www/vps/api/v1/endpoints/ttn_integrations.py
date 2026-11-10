"""One TTN webhook for sensor measurements, encrypted GPS and update feedback."""

import os
from typing import Any

import psycopg_pool
from dependencies import get_db_pool
from endpoints import gps_tracker, sensor_integrations
from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBasicCredentials

router = APIRouter(prefix="/integrations/ttn", tags=["TTN integrations"])


@router.post("/uplink", summary="Receive all TTN application uplinks")
async def receive_ttn_uplink(
    body: dict[str, Any],
    credentials: HTTPBasicCredentials | None = Security(sensor_integrations.basic_auth),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    sensor_integrations._authenticate(credentials)
    expected_app = os.getenv("TTN_APPLICATION_ID", "").strip()
    if not expected_app:
        raise HTTPException(503, "TTN application is not configured")
    ids = body.get("end_device_ids")
    if not isinstance(ids, dict) or not isinstance(ids.get("application_ids"), dict):
        raise HTTPException(422, "end_device_ids and application_ids are required")
    if ids["application_ids"].get("application_id") != expected_app:
        raise HTTPException(403, "Uplink belongs to an unconfigured TTN application")
    device_id = ids.get("device_id")
    if not isinstance(device_id, str) or not sensor_integrations.DEVICE_ID_PATTERN.fullmatch(device_id):
        raise HTTPException(422, "TTN device_id must be a lowercase slug of at most 60 characters")
    uplink = body.get("uplink_message")
    if not isinstance(uplink, dict):
        raise HTTPException(422, "uplink_message is required")
    port = uplink.get("f_port")
    if isinstance(port, bool) or not isinstance(port, int) or not 0 <= port <= 255:
        raise HTTPException(422, "f_port must be an integer from 0 to 255")

    # Route by the wire protocol, never by the presence of plaintext coordinates.
    if port == 44:
        return await gps_tracker.receive_gps_uplink(body, credentials, pool)
    if port == 10:
        return await sensor_integrations.receive_sensor_uplink(body, credentials, pool)
    # FUOTA feedback (42/43) and other nonmeasurement ports are normal uplinks.
    # Acknowledge them so TTN does not deactivate the application webhook.
    return {"status": "ignored", "reason": "No ingestion configured for this FPort", "f_port": port}
