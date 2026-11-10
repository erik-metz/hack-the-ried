"""Privacy-conscious QR scan events and public daily aggregates."""

from typing import Annotated

import psycopg_pool
from dependencies import get_db_pool, verify_admin_key
from fastapi import APIRouter, Depends, Query
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

router = APIRouter(tags=["Marketing QR Codes"])
DbPool = Annotated[psycopg_pool.AsyncConnectionPool, Depends(get_db_pool)]
AdminAuth = Annotated[str, Depends(verify_admin_key)]


class QrScanEvent(BaseModel):
    qr_id: str = Field(pattern=r"^(?:[1-9]|10)$")
    referrer_host: str | None = Field(default=None, max_length=255)
    user_agent: str | None = Field(default=None, max_length=512)
    campaign: dict[str, str] = Field(default_factory=dict, max_length=8)


@router.post("/qr/scans/record", status_code=201)
async def record_scan(payload: QrScanEvent, _admin: AdminAuth, pool: DbPool):
    allowed_campaign_keys = {"qr", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"}
    campaign = {
        key: value[:200]
        for key, value in payload.campaign.items()
        if key in allowed_campaign_keys and value
    }
    async with pool.connection() as conn:
        await conn.execute(
            """INSERT INTO qr_scan_events (qr_id, referrer_host, user_agent, campaign)
               VALUES (%s, %s, %s, %s::jsonb)""",
            (payload.qr_id, payload.referrer_host, payload.user_agent, Jsonb(campaign)),
        )
    return {"recorded": True}


@router.get("/qr/scans/daily")
async def daily_scans(
    pool: DbPool,
    days: int = Query(default=30, ge=1, le=365),
):
    async with pool.connection() as conn:
        cursor = await conn.execute(
            """SELECT (scanned_at AT TIME ZONE 'UTC')::date AS day, qr_id, count(*)::int AS scans
               FROM qr_scan_events
               WHERE scanned_at >= now() - (%s * interval '1 day')
               GROUP BY 1, qr_id
               ORDER BY 1, qr_id""",
            (days,),
        )
        rows = await cursor.fetchall()
    return [{"day": row["day"].isoformat(), "qr_id": row["qr_id"], "scans": row["scans"]} for row in rows]


@router.get("/admin/qr/scans")
async def list_scans(
    _admin: AdminAuth,
    pool: DbPool,
    before: int | None = Query(default=None, gt=0, le=9223372036854775807),
    qr_id: str | None = Query(default=None, pattern=r"^(?:[1-9]|10)$"),
    days: int = Query(default=0, ge=0, le=3650),
    limit: int = Query(default=100, ge=1, le=100),
):
    """All retained events, newest first; ID cursors keep older pages stable."""
    clauses = []
    params = []
    if before is not None:
        clauses.append("id < %s")
        params.append(before)
    if qr_id is not None:
        clauses.append("qr_id = %s")
        params.append(qr_id)
    if days:
        clauses.append("scanned_at >= now() - (%s * interval '1 day')")
        params.append(days)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    params.append(limit + 1)
    async with pool.connection() as conn:
        cursor = await conn.execute(
            "SELECT id, qr_id, scanned_at, referrer_host, user_agent, campaign "
            "FROM qr_scan_events" + where + " ORDER BY id DESC LIMIT %s",
            tuple(params),
        )
        rows = await cursor.fetchall()
    items = [
        {**dict(row), "id": str(row["id"]), "scanned_at": row["scanned_at"].isoformat()}
        for row in rows[:limit]
    ]
    return {"items": items, "next_cursor": items[-1]["id"] if len(rows) > limit else None}
