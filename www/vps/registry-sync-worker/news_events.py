"""Discover municipal announcements from the public RSS feed, parse explicit event data."""

import hashlib
import json
import logging
import re
from datetime import UTC, datetime
from urllib.parse import urlsplit

from adapters import sync_cultural_events_to_db_and_publish
from defusedxml import ElementTree as ET
from dynamic_calendar import clock, explicit_periods, identity
from municipal_events import Document, event_period, municipality_for_venue
from publications import acquire

LOG = logging.getLogger(__name__)


def feed_links(body, source):
    root = ET.fromstring(body)
    if root.tag != "rss":
        raise ValueError("Municipal public RSS feed missing")
    items = root.findall("./channel/item")
    if not items or len(items) > 200:
        raise ValueError("Municipal feed empty or exceeds discovery limit")
    links = []
    for item in items:
        url = item.findtext("link", "").strip()
        p = urlsplit(url)
        if (
            p.scheme != "https"
            or p.netloc != urlsplit(source["url"]).netloc
            or not re.fullmatch(r"/[\w%.-]+_[A-Za-z0-9]+(?:/[A-Za-z0-9]+)?", p.path)
        ):
            raise ValueError("Unexpected municipal feed detail link")
        legacy_paths = {
            urlsplit(old).path.split("/")[1]
            for old in source.get("legacy_notice_urls", [])
        }
        if p.path.split("/")[1] not in legacy_paths and url not in links:
            links.append(url)
    return links


def article_events(html, url, source, now):
    root = Document(html).root
    headings = list(root.find(tag="h1"))
    bodies = [n for n in root.find() if n.attrs.get("itemprop") == "articleBody"]
    if len(headings) != 1 or len(bodies) != 1:
        raise ValueError("Municipal article structure missing or ambiguous")
    title = headings[0].text().split(" | ")[0]
    paragraphs = [n.text() for n in bodies[0].find(tag="p")]
    text = " ".join(paragraphs)
    # Articles are news, not automatically events: require a public invitation.
    if not re.search(
        r"willkommen|einlad|öffentlich|alle Interessierten|für alle|mitmachen|Eintritt|Karten|Besuch",
        text,
        re.IGNORECASE,
    ):
        LOG.info("News deferred: no public invitation, title=%s", title)
        return []
    candidates = []
    for paragraph in paragraphs:
        for first, last in explicit_periods(paragraph):
            candidates.append((first, last, paragraph))
        for match in re.finditer(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b", paragraph):
            day = f"{match[3]}-{int(match[2]):02}-{int(match[1]):02}"
            candidates.append((day, day, paragraph))
    if not candidates:
        for first, last in explicit_periods(title):
            candidates.append((first, last, text))
        match = re.search(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b", title)
        if match:
            day = f"{match[3]}-{int(match[2]):02}-{int(match[1]):02}"
            candidates.append((day, day, text))
    result, seen = [], set()
    for first, last, context in candidates:
        venue = ""
        for alias, canonical in source.get("venue_aliases", {}).items():
            if alias in context or alias in title:
                venue = canonical
                break
        # Never use the municipality footer or an organizer's address as a venue.
        address = re.search(
            r"(?:im|in der|am|auf dem)\s+([^.;]{2,160}?(?:686\d{2}\s+[^.;]{2,50}))",
            context,
        )
        if address:
            venue = address[1]
        municipality = municipality_for_venue(venue)
        if not municipality:
            LOG.info("News deferred: no explicit Ried venue, title=%s", title)
            continue
        hour = re.search(
            r"(?:um|ab|Beginn[: ]*)\s*(\d{1,2}(?:[:.]\d{2})?)\s*Uhr",
            context,
            re.IGNORECASE,
        )
        start, end = event_period(first, clock(hour[1]) if hour else None, last)
        if end < now:
            continue
        label = (
            context.split(":", 1)[0]
            if re.match(r"(?:AG |Vereinsfrühschoppen:)", context)
            else title
        )
        key = identity(url + label + first)
        if key in seen:
            continue
        seen.add(key)
        result.append(
            {
                "id": source["id"] + "-" + key,
                "source": source["id"],
                "title": label,
                "venue_name": venue,
                "municipality": municipality,
                "start_time": start.isoformat(),
                "end_time": end.isoformat() if not hour else None,
                "event_url": url,
                "category": "civic",
                "is_free": False,
                "status": "scheduled",
                "organizer": "Veranstalter siehe Gemeindemitteilung",
                "description": context
                + " Endzeit und Preis nicht vollständig angegeben. "
                + (
                    ""
                    if hour
                    else "Uhrzeit unbekannt; Tagesgrenzen dienen der Kalenderdarstellung."
                ),
            }
        )
    return result


async def import_news_events(conn, client, source):
    feed, feed_digest, feed_attempt = await acquire(conn, client, source)
    links = feed_links(feed.content, source)
    events, digests, receipts = [], [feed_digest], [feed_attempt]
    for url in links:
        article, digest, attempt = await acquire(conn, client, source, url)
        receipts.append(attempt)
        digests.append(digest)
        events.extend(article_events(article.text, url, source, datetime.now(UTC)))
    bundle = json.dumps(
        {"payload_sha256": digests, "events": events}, sort_keys=True
    ).encode()
    digest = hashlib.sha256(bundle).hexdigest()
    async with conn.transaction():
        # Reconcile only articles actually revisited; older feed entries may roll off.
        await conn.execute(
            "DELETE FROM cultural_events WHERE source=%s AND event_url=ANY(%s) "
            "AND NOT (id=ANY(%s)) AND COALESCE(end_time,start_time)>=%s",
            (source["id"], links, [event["id"] for event in events], datetime.now(UTC)),
        )
        await conn.execute(
            "INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING",
            (digest, len(bundle)),
        )
        await sync_cultural_events_to_db_and_publish(
            conn, source, events, digest, datetime.now(UTC)
        )
        for attempt in receipts:
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
    await conn.commit()
