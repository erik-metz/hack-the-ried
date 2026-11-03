"""Private gateway operations. No credentials or host details in public APIs."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from dependencies import get_db_pool, security, verify_admin_key
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Security
from fastapi.security import HTTPAuthorizationCredentials
from gateway_contract import METRICS, Batch
from gateway_storage import SOURCE, history, ingest

router = APIRouter(tags=["Gateway operations"])


@router.post("/gateways/{gateway}/telemetry/batch")
async def upload(
    gateway: str,
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
    pool=Depends(get_db_pool),
):
    # Bounded body even for chunked requests.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 512000:
            raise HTTPException(413, "Gateway batch too large")
    async with pool.connection() as conn, conn.transaction():
        row = await (
            await conn.execute(
                "SELECT token_hash FROM gateway_devices WHERE id=%s", (gateway,)
            )
        ).fetchone()
        if not row or not secrets.compare_digest(
            row["token_hash"],
            hashlib.sha256(credentials.credentials.encode()).hexdigest(),
        ):
            raise HTTPException(401, "Invalid gateway credential")
        from pydantic import ValidationError

        try:
            batch = Batch.model_validate_json(body)
        except ValidationError:
            raise HTTPException(422, "Invalid gateway telemetry contract") from None
        return await ingest(conn, gateway, batch)


@router.get("/admin/gateways", dependencies=[Security(verify_admin_key)])
async def list_gateways(pool=Depends(get_db_pool)):
    async with pool.connection() as conn:
        rows = await (
            await conn.execute(
                "SELECT id,name,latest_at,last_contact,sensor_config FROM gateway_devices ORDER BY name"
            )
        ).fetchall()
    return rows


@router.get("/admin/gateways/{gateway}", dependencies=[Security(verify_admin_key)])
async def details(
    gateway: str,
    days: int = Query(1, ge=1, le=730),
    metric: str = Query("cpu_temperature"),
    pool=Depends(get_db_pool),
):
    if metric not in METRICS:
        raise HTTPException(400, "Unknown metric")
    now = datetime.now(UTC)
    resolution = "minute" if days <= 1 else "hour"
    async with pool.connection() as conn, conn.transaction():
        await conn.execute("SET LOCAL statement_timeout='5s'")
        device = await (
            await conn.execute(
                "SELECT id,name,entity_id,latest_at,last_contact,latest_boot,sensor_config FROM gateway_devices WHERE id=%s",
                (gateway,),
            )
        ).fetchone()
        if not device:
            raise HTTPException(404, "Unknown gateway")
        latest = await (
            await conn.execute(
                """SELECT d.metric,d.unit,r.value,r.quality FROM readings r
            JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.entity_id=%s AND d.source_id=%s
            AND r.observed_at=%s AND d.dimensions->>'resolution'='minute' AND d.dimensions->>'statistic'='value'
            AND d.dimensions - 'resolution' - 'statistic'='{}'::jsonb""",
                (device["entity_id"], SOURCE, device["latest_at"]),
            )
        ).fetchall()
        series, resolution = await history(
            conn, device["entity_id"], gateway, metric, now - timedelta(days=days), days
        )
        availability = {}
        for key in ("state_known_seconds", "state_up_seconds"):
            points, _ = await history(
                conn,
                device["entity_id"],
                gateway,
                key,
                now - timedelta(days=days),
                days,
            )
            for point in points:
                state = point["dimensions"].get("state")
                if point["quality"] == "valid" and state:
                    entry = availability.setdefault(
                        state,
                        {
                            "known_seconds": 0,
                            "up_seconds": 0,
                            "window_seconds": days * 86400,
                        },
                    )
                    entry[
                        "known_seconds"
                        if key == "state_known_seconds"
                        else "up_seconds"
                    ] += float(point["value"])
        events = await (
            await conn.execute(
                "SELECT observed_at,kind,details FROM gateway_events WHERE gateway_id=%s AND observed_at>=%s ORDER BY observed_at DESC LIMIT 100",
                (gateway, now - timedelta(days=days)),
            )
        ).fetchall()
        maintenance = await (
            await conn.execute(
                "SELECT max(completed_at) AS last_completed,count(*) FILTER(WHERE dirty) AS pending_hours FROM gateway_rollup_hours WHERE gateway_id=%s",
                (gateway,),
            )
        ).fetchone()
    fresh = bool(
        device["latest_at"]
        and timedelta(minutes=-2) <= now - device["latest_at"] <= timedelta(minutes=5)
    )
    return {
        "device": device,
        "fresh": fresh,
        "latest": latest,
        "series": series,
        "resolution": resolution,
        "events": events,
        "availability": availability,
        "maintenance": maintenance,
        "metrics": {k: {"unit": v[0], "operation": v[3]} for k, v in METRICS.items()},
    }
