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
    qr_id: str = Field(pattern=r"^[1-5]$")
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
