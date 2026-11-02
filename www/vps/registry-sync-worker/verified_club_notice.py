"""One manually verified club notice, bound to its original poster and venue proof."""

import hashlib
import json
from datetime import UTC, datetime
from urllib.parse import urlsplit

from adapters import sync_cultural_events_to_db_and_publish
from municipal_events import BERLIN, Document, municipality_for_venue
from publications import acquire


def verified_event(html, poster, venue_html, source, now):
    root = Document(html).root
    headings = [
        node.text().removesuffix(" | Aktuelle Nachrichten und Informationen")
        for node in root.find(tag="h1")
    ]
    bodies = [
        node.text()
        for node in root.find()
        if node.attrs.get("itemprop") == "articleBody"
    ]
    if source["headline"] not in headings or len(bodies) != 1:
        raise ValueError("Verified club notice missing or ambiguous")
    if hashlib.sha256(bodies[0].encode()).hexdigest() != source["notice_text_sha256"]:
        raise ValueError("Club notice changed; verification required")
    images = [
        urlsplit(image.attrs.get("src", ""))._replace(query="", fragment="").geturl()
        for node in root.find()
        if node.attrs.get("itemprop") == "image"
        for image in node.find(tag="img")
    ]
    if (
        source["poster_url"] not in images
        or hashlib.sha256(poster).hexdigest() != source["poster_sha256"]
    ):
        raise ValueError("Verified poster changed or missing")
    if source["venue_proof"] not in Document(venue_html).root.text():
        raise ValueError("Tennis venue proof changed")
    event = dict(source["verified_event"])
    if (
        municipality_for_venue(event["venue_name"], postcode=event["postal_code"])
        != event["municipality"]
    ):
        raise ValueError("Club venue outside agreed Ried area")
    start = datetime.fromisoformat(event["start_time"])
    if (
        start.tzinfo is None
        or start.astimezone(BERLIN).strftime("%d.%m.%Y") not in source["headline"]
    ):
        raise ValueError("Verified event date differs from notice")
    event.update(
        source=source["id"],
        event_url=source["url"],
        image_url=source["poster_url"],
        status="past" if start < now else "scheduled",
    )
    return event


async def import_verified_club_notice(conn, client, source):
    response, page_digest, page_attempt = await acquire(conn, client, source)
    poster, poster_digest, poster_attempt = await acquire(
        conn, client, source, source["poster_url"]
    )
    venue, venue_digest, venue_attempt = await acquire(
        conn, client, source, source["venue_url"]
    )
    now = datetime.now(UTC)
    event = verified_event(response.text, poster.content, venue.text, source, now)
    # Archive the mapping as well as all three originals. Publication FK points
    # to actual archived bytes, not an unarchived combined hash.
    bundle = json.dumps(
        {
            "source_id": source["id"],
            "payload_sha256": [page_digest, poster_digest, venue_digest],
            "verified_event": source["verified_event"],
            "notice_text_sha256": source["notice_text_sha256"],
            "poster_sha256": source["poster_sha256"],
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    digest = hashlib.sha256(bundle).hexdigest()
    async with conn.transaction():
        await conn.execute(
            "INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING",
            (digest, len(bundle)),
        )
        await sync_cultural_events_to_db_and_publish(conn, source, [event], digest, now)
        for attempt in [page_attempt, poster_attempt, venue_attempt]:
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
    await conn.commit()
