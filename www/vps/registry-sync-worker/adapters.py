import logging
import re
from datetime import UTC, datetime
from urllib.parse import urlencode, urlsplit

from event_policy import aggregate_events, event_status
from event_replacements import superseded_occurrence
from municipal_events import (
    BERLIN,
    EVENT_HORIZON_YEARS,
    calendar_page,
    calendar_url,
    confirmed_detail_period,
    cross7_venue,
    detail_fields,
    event_period,
    municipality_for_venue,
)
from publications import acquire, publish

logger = logging.getLogger(__name__)


CATEGORY_PATTERNS = (
    ("sports", r"\bsport\w*|\b(?:volks|stadt|kerwe|kerb|spenden|silvester|benefiz)?lauf\b|\blaufen\b|\bläufe\b|\bturn(?:en|ier|fest)\w*|fußball|fussball|\brad(?:fahren|tour|rennen|sport)\w*|schieß|schiess|schützen|schuetzen|\breit\w*|schwimm|triathlon|bosseln"),
    ("festival", r"kerwe|kerb|kirchweih|\w*fest\b|\bfestkommers\b|\bfeier\w*|fasching|fastnacht|fasnacht|karneval|\b\w*glühen\b|frühschoppen"),
    ("market", r"markt|basar|flohmarkt|börse|advent|weihnacht"),
    ("concert", r"konzert|musik|\b\w*chor\b|gesang|\brock\b|\bband\b|akustik|acoustic"),
    ("theater", r"theater|kabarett|comedy|lesung|bühne|kino|\bfilm\w*|musical"),
    ("civic", r"repair|reparier|nachhaltig|umweltmobil|müll|abfall"),
    ("workshop", r"workshop|kurs|seminar|schulung|hackathon|sprechstunde"),
    ("exhibition", r"ausstellung|museum|galerie|kunst"),
)


def classify_category(text: str, details: str = "") -> str:
    """Title takes precedence; generic prose must not override a named festival."""
    for value in (text, details):
        for category, pattern in CATEGORY_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                return category
    return "civic"


async def sync_cultural_events_to_db_and_publish(conn, source, new_events, digest, now):
    """Upserts extracted events into cultural_events table and publishes aggregate to social/events."""
    for ev in new_events:
        await conn.execute(
            """INSERT INTO cultural_events (
                id, title, organizer, venue_name, municipality,
                start_time, end_time, category, description,
                ticket_url, event_url, image_url, street_address,
                postal_code, status, is_free, is_archived, source, updated_at
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, FALSE, %s, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                organizer = EXCLUDED.organizer,
                venue_name = EXCLUDED.venue_name,
                municipality = EXCLUDED.municipality,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                category = EXCLUDED.category,
                description = EXCLUDED.description,
                ticket_url = EXCLUDED.ticket_url,
                event_url = EXCLUDED.event_url,
                image_url = EXCLUDED.image_url,
                street_address = EXCLUDED.street_address,
                postal_code = EXCLUDED.postal_code,
                status = EXCLUDED.status,
                is_free = EXCLUDED.is_free,
                updated_at = NOW()""",
            (
                ev["id"],
                ev["title"],
                ev.get("organizer", ""),
                ev.get("venue_name", ""),
                ev["municipality"],
                ev["start_time"],
                ev.get("end_time"),
                ev["category"],
                ev.get("description"),
                ev.get("ticket_url"),
                ev.get("event_url"),
                ev.get("image_url"),
                ev.get("street_address"),
                ev.get("postal_code"),
                event_status(ev),
                ev.get("is_free", True),
                ev.get("source", source["id"]),
            ),
        )

    # Read all aggregated events from cultural_events table if possible
    all_events = []
    cur = await conn.execute(
        """SELECT to_jsonb(t) FROM (
            SELECT id, title, organizer, venue_name, municipality,
                   start_time, end_time, category, description,
                   ticket_url, event_url, image_url, street_address,
                   postal_code, status, is_free, is_archived, source
            FROM cultural_events
            ORDER BY start_time ASC
        ) t;"""
    )
    rows = await cur.fetchall()
    for r in rows:
        if r and r[0]:
            item = r[0]
            all_events.append(item)

    if not all_events:
        all_events = new_events

    await publish(conn, source, "social/events", aggregate_events(all_events), digest, now)


async def import_cross7(conn, client, source):
    """Imports Cross-7 events for Bürstadt or Groß-Rohrheim, supporting past and scheduled events."""
    events = []
    receipts = []
    now = datetime.now(UTC)
    muni = source.get("municipality", "Bürstadt")
    slug_domain = "https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender?c7-item=" if "gross-rohrheim" in source["url"] or muni == "Groß-Rohrheim" else "https://www.buerstadt.de/de/kultur-freizeit/veranstaltungen/veranstaltungskalender?c7-item="

    page_digests = set()
    for page in range(1, 101):
        url = (
            source["url"]
            + "?"
            + urlencode(
                {"pageNumber": page, "pageSize": 50, "sortType": 0, "sortDirection": 1}
            )
        )
        response, digest, attempt = await acquire(conn, client, source, url)
        receipts.append(attempt)
        if digest in page_digests:
            raise ValueError("Cross7 repeated page; incomplete import rejected")
        page_digests.add(digest)
        body = response.json()
        if not isinstance(body.get("items"), list):
            raise TypeError("Cross7 items missing")
        for item in body["items"]:
            target = item.get("link", {}).get("targetId")
            if not target or not item.get("fromDate") or not item.get("name"):
                raise ValueError("Incomplete Cross7 event")
            start, end = event_period(item["fromDate"], item.get("fromTime"),
                                      item.get("untilDate"), item.get("untilTime"))

            detail_url = f"{slug_domain}{target}"
            addresses = item.get("addresses") or []
            venue_addr = next((a for a in addresses if a.get("type") == "Veranstaltungsort"),
                              next((a for a in addresses if a.get("type") != "Veranstalter"), {}))
            venue_text, venue_muni = cross7_venue(venue_addr, source)
            if not venue_muni:
                logger.info("Event excluded: unknown or external venue, source=%s id=%s", source["id"], target)
                continue
            organizer_addr = next((a for a in addresses if a.get("type") == "Veranstalter"), None)
            organizer = (organizer_addr.get("name") if organizer_addr else item.get("organizer")) or f"Stadt {muni}"

            # Category classification
            cat_names = " ".join([c.get("name", "") for c in item.get("categoryNames", [])])
            cat = classify_category(item["name"], f"{cat_names} {item.get('teaserText') or ''}")

            street = f"{venue_addr.get('street', '')} {venue_addr.get('houseNumber', '')}".strip() or None
            zip_code = venue_addr.get("zipCode")

            events.append(
                {
                    "id": f"c7-{target}",
                    "title": item["name"],
                    "organizer": organizer,
                    "venue_name": venue_text,
                    "municipality": venue_muni,
                    "start_time": start.isoformat(),
                    "end_time": end.isoformat() if end else None,
                    "category": cat,
                    "description": item.get("teaserText"),
                    "event_url": detail_url,
                    "ticket_url": detail_url,
                    "image_url": item.get("teaserPictureUrl"),
                    "street_address": street,
                    "postal_code": zip_code,
                    "is_free": bool(re.search(r"eintritt\s+frei|kostenlos", item.get("teaserText") or "", re.IGNORECASE)),
                    "source": source["id"],
                    "status": "past" if (end or start) < now else "scheduled",
                }
            )
        if len(body["items"]) < 50:
            break
    else:
        raise ValueError("Cross7 pagination limit reached; incomplete import rejected")

    async with conn.transaction():
        # A fully traversed source replaces only its own imported records.
        # This removes previously misassigned external/unknown venues as well.
        await conn.execute(
            "DELETE FROM cultural_events WHERE source=%s AND NOT (id = ANY(%s))",
            (source["id"], [event["id"] for event in events]),
        )
        await sync_cultural_events_to_db_and_publish(conn, source, events, digest, now)
        for attempt in receipts:
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
    await conn.commit()


async def import_lampertheim_events(conn, client, source):
    """Scrapes structured community events from Stadt Lampertheim (Weblication CMS)."""
    receipts = []
    now = datetime.now(UTC)
    events = []
    url = calendar_url(source["url"], now)
    visited = set()
    details = {}
    seen_events = set()
    for _ in range(100):
        if url in visited:
            raise ValueError("Municipal pagination cycle; incomplete import rejected")
        visited.add(url)
        response, digest, attempt = await acquire(conn, client, source, url)
        receipts.append(attempt)
        page_events, next_url = calendar_page(response.text, url, source["id"], now, recover_details=True)
        for event in page_events:
            if superseded_occurrence(event):
                continue
            if event["id"] in seen_events:
                continue
            seen_events.add(event["id"])
            detail_url = event["event_url"]
            if detail_url not in details:
                if (urlsplit(detail_url).netloc == urlsplit(source["url"]).netloc
                        and urlsplit(detail_url).path.startswith("/de/veranstaltungen/termine/")):
                    detail, _, detail_attempt = await acquire(conn, client, source, detail_url)
                    receipts.append(detail_attempt)
                    details[detail_url] = detail_fields(detail.text)
                else:
                    # Some municipal entries point at external ticket portals.
                    # Keep the event but do not crawl an unrelated provider.
                    details[detail_url] = ({}, "", False)
            fields, description, free = details[detail_url]
            if event.pop("_date_conflict", False):
                try:
                    start, end = confirmed_detail_period(fields)
                except ValueError:
                    logger.info("Municipal event deferred: conflicting listing and unusable detail dates, title=%s", event["title"])
                    continue
                event["start_time"], event["end_time"] = start.isoformat(), end.isoformat()
                event["status"] = "past" if end < now else "scheduled"
                logger.info("Municipal dates recovered from explicit detail schedule, title=%s", event["title"])
            if fields.get("Ort"):
                postcode = re.search(r"\b\d{5}\b", fields["Ort"])
                location = fields["Ort"]
                if location.startswith("Kernstadt"):
                    location = "Lampertheim " + location
                municipality = municipality_for_venue(location, postcode=postcode[0] if postcode else None)
                if not municipality:
                    continue
                event["municipality"] = municipality
            event["is_free"] = free
            event["description"] = " ".join(filter(None, [description, event["description"],
                "Preis: " + fields["Preis"] if fields.get("Preis") else "Preis nicht angegeben."]))
            event["category"] = classify_category(event["title"], description)
            events.append(event)
        if not next_url:
            break
        url = next_url
    else:
        raise ValueError("Municipal pagination limit reached; incomplete import rejected")

    async with conn.transaction():
        # Reconcile only the explicitly requested two-year window. Older
        # archived occurrences are retained even though absent from this crawl.
        await conn.execute(
            """DELETE FROM cultural_events WHERE source=%s AND NOT (id = ANY(%s))
               AND COALESCE(end_time, start_time) >= %s AND start_time < %s""",
            (source["id"], [event["id"] for event in events],
             datetime(now.astimezone(BERLIN).year, 1, 1, tzinfo=BERLIN),
             datetime(now.astimezone(BERLIN).year + EVENT_HORIZON_YEARS, 1, 1, tzinfo=BERLIN)),
        )
        await sync_cultural_events_to_db_and_publish(conn, source, events, digest, now)
        for attempt in receipts:
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
    await conn.commit()


async def import_tiles(conn, client, source):
    """Explicit licensed tile inventory; no request-time proxy or unbounded crawl."""
    now = datetime.now(UTC)
    for tile in source.get("tiles", []):
        layer, z, x, y = tile["layer"], tile["z"], tile["x"], tile["y"]
        if (
            layer not in ("base", "rain")
            or not 0 <= z <= 19
            or not (0 <= x < 2**z and 0 <= y < 2**z)
        ):
            raise ValueError("Invalid tile coordinate")
        response, digest, attempt = await acquire(
            conn, client, source, source["url"].format(z=z, x=x, y=y)
        )
        if not response.headers.get("content-type", "").startswith("image/"):
            raise ValueError("Tile endpoint did not return an image")
        async with conn.transaction():
            await conn.execute("SELECT store_collected_file(%s,%s,%s)",
                               (digest,response.content,response.headers["content-type"].split(";")[0]))
            await conn.execute(
                """INSERT INTO collected_map_tiles(layer,z,x,y,payload_sha256,fetched_at)
                VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(layer,z,x,y) DO UPDATE SET
                payload_sha256=EXCLUDED.payload_sha256,fetched_at=EXCLUDED.fetched_at""",
                (layer, z, x, y, digest, now),
            )
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
        await conn.commit()
