"""Newsletter interest registrations for the manually sent HackTheRied newsletter."""

import re
from typing import Annotated

from dependencies import get_db_pool, verify_admin_key
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

router = APIRouter(tags=["Newsletter"])
CONSENT_TEXT_VERSION = "2026-10-27-v1"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class NewsletterSignup(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    consent: bool

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("Bitte gib eine gültige E-Mail-Adresse ein.")
        return normalized


class NewsletterRemoval(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("Bitte gib eine gültige E-Mail-Adresse ein.")
        return normalized


@router.post("/newsletter/subscribers", status_code=201)
async def signup(payload: NewsletterSignup, pool=Depends(get_db_pool)):
    if not payload.consent:
        raise HTTPException(400, "Bitte bestätige die Newsletter-Einwilligung.")
    async with pool.connection() as conn:
        await conn.execute(
            """INSERT INTO newsletter_subscribers (email, consent_text_version)
               VALUES (%s, %s)
               ON CONFLICT (email) DO UPDATE SET
                   consented_at = now(),
                   consent_text_version = EXCLUDED.consent_text_version,
                   unsubscribed_at = NULL
               WHERE newsletter_subscribers.unsubscribed_at IS NOT NULL""",
            (payload.email, CONSENT_TEXT_VERSION),
        )
    return {"success": True}


@router.get("/admin/newsletter/subscribers")
async def list_subscribers(
    _admin: Annotated[str, Depends(verify_admin_key)], pool=Depends(get_db_pool)
):
    async with pool.connection() as conn:
        cursor = await conn.execute(
            """SELECT email, consented_at FROM newsletter_subscribers
               WHERE unsubscribed_at IS NULL ORDER BY consented_at"""
        )
        rows = await cursor.fetchall()
    return [{"email": row["email"], "consented_at": row["consented_at"]} for row in rows]


@router.delete("/admin/newsletter/subscribers")
async def remove_subscriber(
    payload: NewsletterRemoval,
    _admin: Annotated[str, Depends(verify_admin_key)],
    pool=Depends(get_db_pool),
):
    async with pool.connection() as conn:
        await conn.execute(
            "DELETE FROM newsletter_subscribers WHERE email = %s", (payload.email,)
        )
    return {"success": True}
