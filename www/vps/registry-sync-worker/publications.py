"""Durable acquisition and atomic publication. Only collectors import providers."""

import asyncio
import hashlib
import json
import os
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit, urlunsplit

import httpx
from contracts import energy_publication
from psycopg.types.json import Jsonb


def public_url(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.hostname or "", parts.path, "", ""))


def acquisition_error(exc):
    """Identify the failing dependency without exposing tokens or address queries."""
    label = type(exc).__name__
    if isinstance(exc, httpx.HTTPError):
        try:
            host = exc.request.url.host
        except RuntimeError:
            host = None
        if host:
            label += f" host={host}"
        if isinstance(exc, httpx.HTTPStatusError):
            label += f" status={exc.response.status_code}"
    return label


async def acquire(conn, client, source, url=None, *, form=None):
    """Bounded retries for safe reads; only fingerprints are retained."""
    retries = min(3, max(0, int(source.get("http_retries", 0)))) if form is None else 0
    for attempt in range(retries + 1):
        try:
            return await _acquire_once(conn, client, source, url, form=form)
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            response = exc.response if isinstance(exc, httpx.HTTPStatusError) else None
            retryable = response is None or response.status_code in {429, 500, 502, 503, 504}
            if attempt == retries or not retryable:
                raise
            delay = min(60, max(0, source.get("retry_delay_seconds", 2)) * 2**attempt)
            if response is not None:
                try:
                    delay = max(delay, min(60, max(0, float(response.headers.get("retry-after", 0)))))
                except ValueError:
                    try:
                        retry_at = parsedate_to_datetime(response.headers.get("retry-after", ""))
                        delay = max(delay, min(60, max(0, (retry_at - datetime.now(UTC)).total_seconds())))
                    except (TypeError, ValueError, OverflowError):
                        pass
            await asyncio.sleep(delay)


async def _acquire_once(conn, client, source, url=None, *, form=None):
    """Record the response fingerprint before parsing. Secrets never enter receipt metadata."""
    target = url or source["url"]
    if urlsplit(target).scheme != "https":
        raise ValueError("Collector source must use HTTPS")
    headers = dict(source.get("headers", {}))
    for header, variable in source.get("header_env", {}).items():
        value = os.environ.get(variable)
        if not value:
            raise ValueError("Required source credential missing")
        headers[header] = value
    if source.get("token_env"):
        token = os.environ[source["token_env"]]
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = (
            await client.get(target, headers=headers)
            if form is None
            else await client.post(target, headers=headers, data=form)
        )
    except Exception as exc:
        await conn.execute(
            "INSERT INTO collection_attempts(source_id,status,error,error_stage) VALUES (%s,'failed',%s,'acquisition')",
            (source["id"], acquisition_error(exc)),
        )
        await conn.commit()
        raise
    body = response.content
    digest = hashlib.sha256(body).hexdigest()
    async with conn.transaction():
        await conn.execute(
            """INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,%s)
            ON CONFLICT DO NOTHING""",
            (
                digest,
                len(body),
                response.headers.get("content-type", "application/octet-stream"),
            ),
        )
        cursor = await conn.execute(
            """INSERT INTO collection_attempts(source_id,http_status,payload_sha256,status,error,error_stage)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
            (
                source["id"],
                response.status_code,
                digest,
                "received" if response.is_success else "failed",
                None if response.is_success else f"HTTP {response.status_code}",
                None if response.is_success else "acquisition",
            ),
        )
        attempt_id = (await cursor.fetchone())[0]
    await conn.commit()
    if not response.is_success:
        sample = body
        for variable in [*source.get("header_env", {}).values(), source.get("token_env")]:
            secret = os.environ.get(variable, "") if variable else ""
            if secret:
                sample = sample.replace(secret.encode(), b"[REDACTED]")
        await conn.execute("SELECT retain_collection_failure(%s,%s)", (attempt_id,sample[:65536]))
        await conn.commit()
    response.raise_for_status()
    return response, digest, attempt_id


async def publish(conn, source, dataset, data, digest, source_time, now=None):
    now = now or datetime.now(UTC)
    if source_time.tzinfo is None or source_time > now + timedelta(minutes=5):
        raise ValueError("Invalid source observation timestamp")
    # max_age is measured from source time, not repeated receipt of an old reading.
    expires = source_time + timedelta(seconds=source.get("max_age_seconds", 604800))
    json.dumps(data, allow_nan=False)
    await conn.execute(
        """INSERT INTO collected_datasets
        (dataset,source_id,source_url,source_updated_at,fetched_at,expires_at,payload_sha256,data)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT(dataset) DO UPDATE SET source_id=EXCLUDED.source_id,source_url=EXCLUDED.source_url,
        source_updated_at=EXCLUDED.source_updated_at,fetched_at=EXCLUDED.fetched_at,
        expires_at=EXCLUDED.expires_at,payload_sha256=EXCLUDED.payload_sha256,data=EXCLUDED.data
        WHERE EXCLUDED.source_updated_at >= collected_datasets.source_updated_at""",
        (
            dataset,
            source["id"],
            public_url(source["url"]),
            source_time,
            now,
            expires,
            digest,
            Jsonb(data),
        ),
    )


async def import_json(conn, client, source):
    """Contract for provider-specific exports/adapters, not unvalidated seed data.

    A provider export contains {source_updated_at, datasets: {key: payload}}.
    Manifest dataset keys are an allowlist; missing datasets fail the whole import.
    """
    response, digest, attempt = await acquire(conn, client, source)
    try:
        body = response.json()
        source_time = datetime.fromisoformat(body["source_updated_at"])
        datasets = body["datasets"]
        expected = source["datasets"]
        if set(datasets) != set(expected):
            raise ValueError("Publication does not match configured dataset contract")
        for key, contract in expected.items():
            if key == "infrastructure/energy":
                datasets[key] = energy_publication(datasets[key], source_time)
            value = datasets[key]
            is_list = contract["type"] == "array"
            if not isinstance(value, list if is_list else dict):
                raise TypeError(f"Invalid payload shape: {key}")
            records = value if is_list else [value]
            if any(
                not isinstance(r, dict)
                or not set(contract.get("required", [])).issubset(r)
                for r in records
            ):
                raise ValueError(f"Missing required fields: {key}")
        async with conn.transaction():
            for key, value in datasets.items():
                await publish(conn, source, key, value, digest, source_time)
                from layers import LAYER_DATASETS, map_collection

                if key in LAYER_DATASETS:
                    layer, container = LAYER_DATASETS[key]
                    await publish(
                        conn,
                        source,
                        f"map/layers/{layer}",
                        map_collection(value, container),
                        digest,
                        source_time,
                    )
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
        await conn.commit()
    except Exception as exc:
        await conn.rollback()
        await conn.execute(
            "UPDATE collection_attempts SET status='failed',error=%s WHERE id=%s",
            (type(exc).__name__, attempt),
        )
        await conn.commit()
        raise
