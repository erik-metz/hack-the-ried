"""Read the published HCV calendar as literal data, without JavaScript execution."""

import hashlib
import json
import re
from datetime import UTC, datetime
from urllib.parse import urljoin, urlsplit

from adapters import sync_cultural_events_to_db_and_publish
from club_events import dated_range
from dynamic_calendar import clock, identity, reconcile_future
from municipal_events import Document, event_period, municipality_for_venue
from publications import acquire


def campaign_asset(html, page_url):
    if page_url != "https://hcv-buerstadt.de/":
        raise ValueError("Unexpected HCV source")
    assets = [
        urljoin(page_url, n.attrs.get("src", ""))
        for n in Document(html).root.find(tag="script")
        if n.attrs.get("type") == "module"
    ]
    if len(assets) != 1 or not re.fullmatch(
        r"https://hcv-buerstadt\.de/assets/index-[A-Za-z0-9_-]+\.js", assets[0]
    ):
        raise ValueError("Expected same-origin HCV module missing or ambiguous")
    return assets[0]


def campaign_events(javascript, source, now):
    if source["id"] != "hcv-buerstadt-campaign":
        raise ValueError("Unexpected HCV source")
    # Literal arrays are parsed as data. Never eval JavaScript or fetch its imports.
    arrays = re.findall(
        r"\b[A-Za-z_$][\w$]*=\[(\{datum:[^\n]{1,30000}?)\](?=[,;])", javascript
    )
    arrays = [literal for literal in arrays if re.search(r"[,}]event:", literal)]
    if len(arrays) != 1:
        raise ValueError("HCV dated event array missing or ambiguous")
    literal = "[" + arrays[0] + "]"
    symbols = dict(
        re.findall(r'\b([A-Za-z_$][\w$]*)=("[^"\n]{1,300}")(?=[,;])', javascript)
    )
    literal = re.sub(r"(datum|event|ort|uhrzeit):", r'"\1":', literal)
    literal = re.sub(
        r":([A-Za-z_$][\w$]*)(?=[,}])",
        lambda m: ":" + symbols.get(m[1], "null"),
        literal,
    )
    rows = json.loads(literal)
    if not rows or len(rows) > 100:
        raise ValueError("HCV calendar empty or unbounded")
    result = []
    for row in rows:
        title = row.get("event", "")
        # Public agenda also contains clearly internal gatherings.
        if re.search(
            r"Familienabend|Kampagnenabschluss|Versammlung|intern|Probe",
            title,
            re.IGNORECASE,
        ):
            continue
        venue = row.get("ort") or ""
        if venue == "Die Lächner 9":
            venue += ", Bürstadt"
        if not municipality_for_venue(venue):
            continue
        first, last = dated_range(row["datum"])
        published_clock = row.get("uhrzeit", "").removesuffix(" Uhr").strip()
        start, end = event_period(
            first, clock(published_clock) if published_clock else None, last
        )
        description = (
            "Veröffentlichter Termin des HCV. "
            "Endzeit und Eintrittspreise sind nicht angegeben. "
            "Teilnahmebedingungen, Anmeldung und verfügbare Karten bitte beim HCV prüfen."
        )
        if not published_clock:
            description += " Beginn unbekannt; Tagesgrenzen dienen ausschließlich der Kalenderdarstellung."
        # Preserve existing identities for the published campaign, distinguish new same-day events.
        event_id = source["id"] + "-" + first
        if any(e["id"] == event_id for e in result):
            event_id += "-" + identity(title + venue)
        result.append(
            {
                "id": event_id,
                "title": title,
                "municipality": municipality_for_venue(venue),
                "organizer": "Heimat- und Carneval-Verein Bürstadt 1959 e.V.",
                "venue_name": venue,
                "start_time": start.isoformat(),
                "end_time": end.isoformat()
                if not published_clock or first != last
                else None,
                "category": "festival",
                "is_free": False,
                "status": "past"
                if (end if not published_clock else start) < now
                else "scheduled",
                "source": source["id"],
                "event_url": source["url"],
                "description": description,
            }
        )
    return result


async def import_hcv_campaign(conn, client, source):
    page, page_digest, page_attempt = await acquire(conn, client, source)
    asset_url = campaign_asset(page.text, source["url"])
    script, script_digest, script_attempt = await acquire(
        conn, client, source, asset_url
    )
    if urlsplit(str(script.url)).hostname != "hcv-buerstadt.de":
        raise ValueError("Unexpected HCV asset redirect")
    now = datetime.now(UTC)
    events = campaign_events(script.text, source, now)
    bundle = json.dumps(
        {"payload_sha256": [page_digest, script_digest], "events": events},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    digest = hashlib.sha256(bundle).hexdigest()
    async with conn.transaction():
        await conn.execute(
            "INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING",
            (digest, len(bundle)),
        )
        await reconcile_future(conn, source, events, now)
        await sync_cultural_events_to_db_and_publish(conn, source, events, digest, now)
        for attempt in (page_attempt, script_attempt):
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
    await conn.commit()
