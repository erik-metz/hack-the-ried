"""Task-local rejection diagnostics, published independently for every social source."""

import hashlib
import json
import logging
from collections import Counter
from contextvars import ContextVar
from datetime import UTC, datetime

from publications import publish

CURRENT = ContextVar("social_import_diagnostics", default=None)


class RejectionHandler(logging.Handler):
    def emit(self, record):
        current = CURRENT.get()
        if current is None:
            return
        message = record.getMessage()
        if (
            "deferred" not in message.casefold()
            and "excluded" not in message.casefold()
        ):
            return
        reason = message.split(",", 1)[0].split("title=", 1)[0].strip()
        current["reasons"][reason] += 1
        if len(current["examples"]) < 20:
            current["examples"].append(message[:400])


HANDLER = RejectionHandler()
logging.getLogger().addHandler(HANDLER)


def begin():
    return CURRENT.set({"reasons": Counter(), "examples": []})


async def finish(conn, source, started):
    current = CURRENT.get()
    cursor = await conn.execute(
        """SELECT count(*) FROM cultural_events WHERE source=%s AND updated_at >= %s""",
        (source["id"], started),
    )
    accepted = (await cursor.fetchone())[0]
    cursor = await conn.execute(
        """SELECT jsonb_array_length(data) FROM collected_datasets
        WHERE dataset=%s AND jsonb_typeof(data)='array'""",
        ("social/regular-offers/" + source["id"],),
    )
    row = await cursor.fetchone()
    if row:
        accepted = row[0]
    cursor = await conn.execute(
        "SELECT count(*) FROM collection_attempts WHERE source_id=%s AND received_at >= %s",
        (source["id"], started),
    )
    requests = (await cursor.fetchone())[0]
    data = {
        "source_id": source["id"],
        "accepted": accepted,
        "deferred": sum(current["reasons"].values()),
        "reasons": dict(current["reasons"]),
        "examples": current["examples"],
        "http_attempts": requests,
        "processed_at": datetime.now(UTC).isoformat(),
    }
    body = json.dumps(data, sort_keys=True).encode()
    digest = hashlib.sha256(body).hexdigest()
    async with conn.transaction():
        await conn.execute(
            """INSERT INTO collected_payloads(sha256,size_bytes,content_type)
            VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING""",
            (digest, len(body)),
        )
        await publish(
            conn,
            source,
            "social/source-diagnostics/" + source["id"],
            data,
            digest,
            datetime.now(UTC),
        )
        await conn.execute(
            """UPDATE collection_attempts SET item_count=%s,item_count_unit=%s
            WHERE id=(SELECT id FROM collection_attempts WHERE source_id=%s
            ORDER BY received_at DESC,id DESC LIMIT 1)""",
            (accepted, "accepted_events_or_offers", source["id"]),
        )
    await conn.commit()
