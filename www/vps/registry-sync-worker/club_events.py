"""Source-specific public club calendars; never infer venues from club addresses."""

import hashlib
import json
import logging
import re
from datetime import UTC, date, datetime, timedelta
from urllib.parse import parse_qs, urljoin, urlsplit

from adapters import classify_category, sync_cultural_events_to_db_and_publish
from biblis_events import admission, plain, window
from calendar_recurrence import expand_calendar
from dynamic_calendar import internal_links
from icalendar import Calendar
from municipal_events import (
    BERLIN,
    Document,
    Node,
    event_period,
    municipality_for_venue,
)
from publications import acquire

LOG = logging.getLogger(__name__)
MONTHS = {
    name: index
    for index, name in enumerate(
        (
            "januar",
            "februar",
            "märz",
            "april",
            "mai",
            "juni",
            "juli",
            "august",
            "september",
            "oktober",
            "november",
            "dezember",
        ),
        1,
    )
}
MAX_DETAILS = 100


def clean_document(html):
    return Document(
        re.sub(
            r"<(script|style)\b[^>]*>.*?</\1>",
            "",
            html,
            flags=re.IGNORECASE | re.DOTALL,
        )
    ).root


def children(node, tag):
    return [
        child for child in node.children if isinstance(child, Node) and child.tag == tag
    ]


def text_at(node, cls):
    return next((child.text() for child in node.find(cls=cls)), "")


def dated_range(value):
    """Only explicit full years; no default year or inherited empty table dates."""
    value = re.sub(r"\s+", "", value).replace("–", "-").replace("—", "-")
    numeric = re.fullmatch(r"(\d{1,2})\.?[-/](\d{1,2})\.(\d{1,2})\.(\d{4})", value)
    if numeric:
        first, last, month, year = map(int, numeric.groups())
        start, end = date(year, month, first), date(year, month, last)
    else:
        single = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", value)
        named = re.fullmatch(
            r"(\d{1,2})\.(?:-(\d{1,2})\.)?([a-zä]+)(\d{4})", value.casefold()
        )
        if single:
            day, month, year = map(int, single.groups())
            start = end = date(year, month, day)
        elif named and named[3] in MONTHS:
            start = date(int(named[4]), MONTHS[named[3]], int(named[1]))
            end = date(int(named[4]), MONTHS[named[3]], int(named[2] or named[1]))
        else:
            raise ValueError("Club date is incomplete or unsupported")
    if end < start:
        raise ValueError("Club date range is reversed")
    return start.isoformat(), end.isoformat()


def location(value, source):
    address = re.search(r"\b(\d{5})\s+([\wäöüß-]+)", value, re.IGNORECASE)
    if address:
        postcode, city = address.groups()
        municipality = municipality_for_venue("", city=city, postcode=postcode)
        if municipality != municipality_for_venue("", postcode=postcode):
            municipality = None
        return value, municipality
    alias = source.get("verified_venue_names", {}).get(value)
    if alias:
        return alias["venue_name"], alias["municipality"]
    return value, municipality_for_venue(value)


def event(
    source,
    now,
    title,
    venue,
    start,
    end,
    *,
    description="",
    url=None,
    identity=None,
    cost="",
    organizer=None,
):
    venue, municipality = location(venue, source)
    if not title or not municipality:
        LOG.info("Club event deferred: title=%s, venue=%s", title, venue)
        return None
    first, until = window(now)
    if end < first or start >= until:
        return None
    if end < start:
        raise ValueError("Club event ends before start")
    identity = (
        identity
        or hashlib.sha256(
            f"{title}\n{start.isoformat()}\n{venue}".encode()
        ).hexdigest()[:24]
    )
    return {
        "id": f"{source['id']}-{identity}",
        "title": title,
        "organizer": organizer or source.get("organizer", ""),
        "venue_name": venue,
        "municipality": municipality,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "category": classify_category(title),
        "description": description
        + (
            " Preis: " + cost
            if cost
            else " Preis unbekannt; Teilnahmebedingungen siehe Veranstaltungsseite."
        ),
        "event_url": url or source["url"],
        "ticket_url": url or source["url"],
        "image_url": None,
        "postal_code": None,
        "street_address": None,
        "is_free": admission(cost, description),
        "source": source["id"],
        "status": "past" if end < now else "scheduled",
    }


def table_events(html, source, now):
    root = clean_document(html)
    headers = source["columns"]
    tables = [
        table
        for table in root.find(tag="table")
        if next(table.find(tag="tr"), Node()).text() == " ".join(headers)
    ]
    if len(tables) != 1:
        raise ValueError("Club calendar table/header missing or ambiguous")
    result = []
    rows = list(tables[0].find(tag="tr"))[1:]
    if not rows or len(rows) > 1000:
        raise ValueError("Club calendar rows missing or unbounded")
    for row in rows:
        cells = children(row, "td")
        if len(cells) != len(headers):
            raise ValueError("Club calendar column count changed")
        values = dict(zip(headers, [cell.text() for cell in cells], strict=True))
        title = values.get("Veranstaltung", values.get("Termin", ""))
        if re.search(r"Platzhalter|Hallenreinigung", title, re.IGNORECASE):
            continue
        try:
            start_date, end_date = dated_range(values["Datum"])
        except ValueError:
            LOG.info("Club event deferred: incomplete date, title=%s", title)
            continue
        venue = values.get("Ort", "")
        if not venue and source["table_kind"] == "kkm":
            # Titles in this two-column list describe performances at named places.
            venue = title
            # Resolve reusable place names, not individual events or calendar years.
            # An explicit Ort column always takes precedence over these suffixes.
            for suffix, canonical in sorted(
                source.get("verified_title_venue_suffixes", {}).items(),
                key=lambda item: len(item[0]),
                reverse=True,
            ):
                if title == suffix or title.endswith(" " + suffix):
                    venue = canonical["venue_name"]
                    break
        verified = source.get("verified_event_venues", {}).get(title)
        if (
            not values.get("Ort")
            and verified
            and verified["year"] == int(start_date[:4])
        ):
            venue = verified["venue_name"]
        start_time_match = re.search(r"Beginn\s+(\d{1,2}:\d{2})\s*Uhr", title)
        start, end = event_period(
            start_date, start_time_match[1] if start_time_match else None, end_date
        )
        description = "Uhrzeit nicht vollständig angegeben; Tagesgrenzen dienen der Kalenderdarstellung."
        if values.get("Abteilung"):
            description += " Abteilung: " + values["Abteilung"] + "."
        parsed = event(source, now, title, venue, start, end, description=description)
        if parsed:
            result.append(parsed)
    return result


def sgh_events(html, source, now, url):
    root = clean_document(html)
    heading = next(root.find(tag="h1"), None)
    if not heading:
        raise ValueError("SGH event heading missing")
    title = heading.text()
    blocks = list(root.find(cls="wpb_text_column"))
    venue_blocks = [
        block
        for block in blocks
        if any(h.text() == "Anschrift" for h in block.find(tag="h5"))
    ]
    if len(venue_blocks) != 1:
        raise ValueError("SGH event address block missing or ambiguous")
    venue_block = venue_blocks[0]
    paragraphs = list(venue_block.find(tag="p"))
    venue = paragraphs[0].text() if paragraphs else ""
    # The actual address is in the paragraph after "Anschrift", not the footer.
    for node in venue_block.find(cls="wpb_wrapper"):
        ns = [c for c in node.children if isinstance(c, Node)]
        for i, child in enumerate(ns[:-1]):
            if child.tag == "h5" and child.text() == "Anschrift":
                address_node = ns[i + 1]
                venue += " " + " ".join(
                    c.text() if isinstance(c, Node) else c
                    for c in address_node.children
                    if not isinstance(c, Node) or c.tag != "a"
                )
    description = " ".join(block.text() for block in blocks if block is not venue_block)
    schedule = venue_block.text()
    periods = []
    # Detailed shooting schedules outrank the inconsistent countdown/hero year.
    schedule_year = re.search(r"Termine\s+(\d{4})\s*:", schedule)
    if schedule_year:
        year = int(schedule_year[1])
        for p in paragraphs:
            text = p.text()
            match = re.fullmatch(
                r"(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s*"
                r"(\d{1,2})\.(?:\s*und\s*(\d{1,2})\.)?\s*([A-Za-zä]+)\s*"
                r"(\d{1,2})\s*[–-]\s*(\d{1,2})\s*Uhr",
                text,
            )
            # <br> separates schedule rows inside one paragraph; handled below.
            if match:
                periods.extend(shooting_periods(match.groups(), year))
        if not periods:
            for match in re.finditer(
                r"(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s*"
                r"(\d{1,2})\.(?:\s*und\s*(\d{1,2})\.)?\s*([A-Za-zä]+)\s*"
                r"(\d{1,2})\s*[–-]\s*(\d{1,2})\s*Uhr",
                schedule,
            ):
                periods.extend(shooting_periods(match.groups(), year))
        if not periods:
            raise ValueError("SGH detailed dated schedule changed")
    elif title == "Nikolausschießen":
        for p in paragraphs:
            for match in re.finditer(
                r"(\d{1,2})\.\s*([A-Za-zä]+)\s+(\d{4})\s+(\d{1,2})\s*[–-]\s*(\d{1,2})\s*Uhr",
                p.text(),
            ):
                day, month, year, start_hour, end_hour = match.groups()
                d = date(int(year), MONTHS[month.casefold()], int(day)).isoformat()
                periods.append(
                    event_period(
                        d, f"{int(start_hour):02}:00", d, f"{int(end_hour):02}:00"
                    )
                )
        if not periods:
            raise ValueError("SGH Nikolaus schedule changed")
    else:
        hero = next(root.find(cls="uvc-sub-heading"), None)
        if not hero:
            raise ValueError("SGH published date missing")
        try:
            start_date, end_date = dated_range(hero.text())
        except ValueError:
            # Maifest gives a day/month and confirms the year in the event text.
            year = re.search(r"Auch in (\d{4}) feiern wir den 1\. Mai", description)
            if title == "Maifest" and hero.text() == "1. Mai" and year:
                start_date = end_date = f"{year[1]}-05-01"
            else:
                LOG.info(
                    "SGH event deferred: incomplete published date, title=%s", title
                )
                return []
        if title == "Volksbank Kerwelauf Hüttenfeld":
            matches = re.findall(
                r"(?:Startzeit|Start)\s*:\s*(\d{1,2}:\d{2})", description
            )
            if not matches:
                raise ValueError("SGH race start times missing")
            periods = [event_period(start_date, min(matches), end_date)]
        elif title == "Maifest":
            hours = re.search(r"Von (\d{1,2}) bis (\d{1,2}) Uhr", description)
            if not hours:
                raise ValueError("SGH Maifest hours missing")
            periods = [
                event_period(
                    start_date,
                    f"{int(hours[1]):02}:00",
                    end_date,
                    f"{int(hours[2]):02}:00",
                )
            ]
        elif title == "Kinderfasching":
            hour = re.search(r"ab (\d{1,2}:\d{2}) Uhr", schedule)
            periods = [event_period(start_date, hour[1] if hour else None, end_date)]
        else:
            periods = [event_period(start_date, end_date=end_date)]
    description += (
        " "
        + schedule
        + " Fehlende End-/Öffnungszeiten werden als Tagesgrenzen dargestellt."
    )
    return [
        parsed
        for start, end in periods
        if (
            parsed := event(
                source, now, title, venue, start, end, description=description, url=url
            )
        )
    ]


def shooting_periods(groups, year):
    first, second, month, start_hour, end_hour = groups
    return [
        event_period(
            date(year, MONTHS[month.casefold()], int(day)).isoformat(),
            f"{int(start_hour):02}:00",
            None,
            f"{int(end_hour):02}:00",
        )
        for day in (first, second)
        if day
    ]


def dlrg_listing(html):
    tables = [
        n
        for n in clean_document(html).find(tag="table")
        if n.attrs.get("id", "").startswith("DlrgSeminarPublicSeminarList")
    ]
    if len(tables) != 1 or "data-data" not in tables[0].attrs:
        raise ValueError("DLRG complete embedded seminar list missing")
    rows = json.loads(tables[0].attrs["data-data"])
    if not isinstance(rows, list) or len(rows) > MAX_DETAILS:
        raise ValueError("DLRG seminar list invalid or unbounded")
    ids = set()
    for row in rows:
        if (
            not isinstance(row, dict)
            or type(row.get("id")) is not int
            or row["id"] in ids
        ):
            raise ValueError("DLRG seminar identity missing or repeated")
        ids.add(row["id"])
    return rows


def dlrg_detail(html, row, source):
    root = clean_document(html)
    definitions = list(root.find(tag="dl"))
    fields = {}
    for dl in definitions:
        key = None
        for child in dl.children:
            if not isinstance(child, Node):
                continue
            if child.tag == "dt":
                key = child.text()
            elif child.tag == "dd" and key:
                fields[key] = child
                key = None
    if "Veranstaltungsort" not in fields or not any(
        k in fields for k in ("Termin", "Termine")
    ):
        raise ValueError("DLRG venue or schedule details missing")
    exports = [
        n.attrs["href"]
        for n in root.find(tag="a")
        if "action=ical" in n.attrs.get("href", "")
    ]
    if len(exports) != 1:
        raise ValueError("DLRG calendar export missing or ambiguous")
    parts = urlsplit(exports[0])
    query = parse_qs(parts.query)
    if (
        parts.scheme != "https"
        or parts.netloc != "dlrg.net"
        or parts.path != "/apps/seminar"
        or query.get("action") != ["ical"]
        or query.get("edvnummer") != [source["edvnummer"]]
        or query.get("id") != [str(row["id"])]
    ):
        raise ValueError("Unexpected DLRG calendar export target")
    description = " ".join(
        f"{k}: {v.text()}"
        for k, v in fields.items()
        if k
        not in (
            "Verwalter",
            "Referierende",
            "Leitung",
            "Dokumente",
            "Termin",
            "Termine",
        )
    )
    description += (
        " Anmeldung: " + row.get("anmeldungStatusAsText", "Status unbekannt") + "."
    )
    schedule = fields.get("Termine", fields.get("Termin"))
    count_match = re.search(r"(\d+) Termine insgesamt", schedule.text())
    if "Termine" in fields and not count_match:
        raise ValueError("DLRG advertised occurrence count missing")
    expected_count = int(count_match[1]) if count_match else 1
    if not 1 <= expected_count <= 1000:
        raise ValueError("DLRG advertised occurrence count unbounded")
    return (
        exports[0],
        description,
        fields.get("Gebühren", Node()).text(),
        expected_count,
    )


def ical_events(body, row, source, now, description, cost, expected_count=None):
    calendar = Calendar.from_ical(body)
    if calendar.name != "VCALENDAR":
        raise ValueError("DLRG calendar invalid")
    records = expand_calendar(calendar)
    if not records or len(records) > 1000:
        raise ValueError("DLRG calendar occurrences missing or unbounded")
    if expected_count is not None and len(records) != expected_count:
        raise ValueError("DLRG calendar export truncated or inconsistent")
    result, ids = [], set()
    for record, uid in records:
        if uid in ids:
            raise ValueError("DLRG occurrence identity repeated")
        ids.add(uid)
        start = record.decoded("DTSTART")
        end = record.decoded("DTEND") if "DTEND" in record else None
        if isinstance(start, datetime):
            start = (
                start.replace(tzinfo=BERLIN)
                if start.tzinfo is None
                else start.astimezone(BERLIN)
            )
            if not isinstance(end, datetime):
                raise TypeError("DLRG occurrence end time missing")
            end = (
                end.replace(tzinfo=BERLIN)
                if end.tzinfo is None
                else end.astimezone(BERLIN)
            )
        else:
            if end is not None and (isinstance(end, datetime) or end <= start):
                raise ValueError("DLRG all-day end invalid")
            end = (end - timedelta(days=1)) if end else start  # RFC 5545 exclusive end
            start, end = event_period(start.isoformat(), end_date=end.isoformat())
        title = plain(str(record.get("SUMMARY", row["titel"])))
        venue = plain(str(record.get("LOCATION", "")))
        parsed = event(
            source,
            now,
            title,
            venue,
            start,
            end,
            description=description,
            cost=cost,
            url=row["link"],
            identity=f"{row['id']}-{uid}",
            organizer=row.get("veranstalter"),
        )
        if parsed:
            if str(record.get("STATUS", "")).upper() == "CANCELLED":
                parsed["status"] = "cancelled"
            result.append(parsed)
    return result


def hofheim_request(html, source):
    root = clean_document(html)
    panel = next(root.find(cls="panel-year"), None)
    container = next(panel.find(cls="r34ics-ajax-container"), None) if panel else None
    nonce = re.search(r'"r34ics_nonce":"([a-zA-Z0-9]+)"', html)
    if not container or not nonce:
        raise ValueError("Hofheim calendar request metadata missing")
    return urljoin(source["url"], "/wp-admin/admin-ajax.php"), {
        "action": "r34ics_ajax",
        "r34ics_nonce": nonce[1],
        "subaction": "display_calendar",
        "args": container.attrs["data-args"],
        "js_args": container.attrs["data-js-args"],
    }


def hofheim_events(html, source, now):
    root = clean_document(html)
    calendars = list(root.find(cls="ics-calendar"))
    if len(calendars) != 1:
        raise ValueError("Hofheim rendered calendar missing")
    result = []
    for dl in calendars[0].find(tag="dl"):
        time_text = ""
        for node in dl.children:
            if not isinstance(node, Node):
                continue
            if node.tag == "dt":
                time_text = node.text()
            elif node.tag == "dd":
                title, venue = text_at(node, "title"), text_at(node, "location")
                if title.casefold().startswith(
                    (
                        "herbstferien",
                        "weihnachtsferien",
                        "sommerferien",
                        "osterferien",
                        "winterferien",
                        "pfingstferien",
                    )
                ):
                    continue
                match = re.search(
                    r"\bd(\d{8})(?:_(\d{8}))?\b", node.attrs.get("class", "")
                )
                if not match or not title:
                    raise ValueError("Hofheim event date/title missing")
                start_date = date.fromisoformat(match[1])
                end_date = (
                    date.fromisoformat(match[2]) - timedelta(days=1)
                    if match[2]
                    else start_date
                )
                times = re.findall(r"\d{1,2}:\d{2}", time_text)
                start, end = event_period(
                    start_date.isoformat(),
                    times[0] if times else None,
                    end_date.isoformat(),
                    times[1] if len(times) == 2 else None,
                )
                parsed = event(
                    source,
                    now,
                    title,
                    venue,
                    start,
                    end,
                    description=text_at(node, "eventdesc"),
                )
                if parsed:
                    result.append(parsed)
                time_text = ""
    return result


def hofheim_race(html, source, now):
    root = clean_document(html)
    content = next(root.find(cls="entry-content"), None)
    if not content:
        raise ValueError("Hofheim race page missing")
    title = next(
        (
            n.text()
            for n in content.find()
            if n.tag in ("h1", "h2") and "Hofheimer Volkslauf" in n.text()
        ),
        None,
    )
    dates = re.findall(r"\b\d{1,2}\.\d{1,2}\.\d{4}\b", content.text())
    if not title or len(set(dates)) != 1:
        raise ValueError("Hofheim race date/title missing or ambiguous")
    start_date, end_date = dated_range(dates[0])
    verified = source["verified_race_venue"]
    start, end = event_period(start_date, end_date=end_date)
    parsed = event(
        source,
        now,
        title,
        (verified["venue_name"] if int(start_date[:4]) == verified["year"]
         else "Lampertheim-Hofheim – genauer Startort siehe aktuelle Ausschreibung"),
        start,
        end,
        description="Volkslauf; Uhrzeiten und Teilnahmebedingungen siehe Ausschreibung. Tagesgrenzen dienen der Kalenderdarstellung.",
    )
    return [parsed] if parsed else []


async def import_club_events(conn, client, source):
    now = datetime.now(UTC)
    receipts, digests = [], []

    async def get(url=None, form=None):
        response, digest, attempt = await acquire(conn, client, source, url, form=form)
        receipts.append(attempt)
        digests.append(digest)
        return response

    kind = source["format"]
    if kind == "hofheim":
        # The public WordPress page cache can outlive its calendar nonce.
        # Obtain fresh display metadata before the read-only rendering request.
        fresh_url = source["url"] + ("&" if "?" in source["url"] else "?") + "ried_calendar=" + str(int(now.timestamp()))
        response = await get(fresh_url)
    else:
        response = await get()
    if kind == "table":
        events = table_events(response.text, source, now)
    elif kind == "sgh":
        urls = internal_links(response.text, source["url"], section="Events")
        if not urls or len(urls) > MAX_DETAILS:
            raise ValueError("SGH event pages unbounded")
        events = []
        for path in urls:
            url = urljoin(source["url"], path)
            if urlsplit(url).netloc != urlsplit(source["url"]).netloc:
                raise ValueError("External SGH detail target")
            detail = await get(url)
            events.extend(sgh_events(detail.text, source, now, url))
    elif kind == "dlrg":
        events = []
        for row in dlrg_listing(response.text):
            if re.search(source["exclude_titles"], row.get("titel", ""), re.IGNORECASE):
                continue
            if not municipality_for_venue(row.get("ort", "")):
                continue
            parts = urlsplit(row["link"])
            if (
                parts.scheme != "https"
                or parts.netloc != urlsplit(source["url"]).netloc
                or not parts.path.startswith("/aktuelle-termine/")
            ):
                raise ValueError("External DLRG seminar target")
            detail = await get(row["link"])
            url, description, cost, count = dlrg_detail(detail.text, row, source)
            export = await get(url)
            events.extend(
                ical_events(export.content, row, source, now, description, cost, count)
            )
    elif kind == "hofheim":
        url, form = hofheim_request(response.text, source)
        rendered = await get(url, form)
        events = hofheim_events(rendered.text, source, now)
    elif kind == "hofheim-race":
        events = hofheim_race(response.text, source, now)
    else:
        raise ValueError("Unknown club calendar format")
    ids = [ev["id"] for ev in events]
    if len(ids) != len(set(ids)):
        raise ValueError("Club calendar occurrence repeated")
    today = now.astimezone(BERLIN).replace(hour=0, minute=0, second=0, microsecond=0)
    _, until = window(now)
    # Publication digests must identify archived bytes, including when a
    # calendar combines a listing, detail pages and individual ICS feeds.
    bundle = json.dumps(
        {"source_id": source["id"], "payload_sha256": digests},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    digest = hashlib.sha256(bundle).hexdigest()
    async with conn.transaction():
        # Upcoming-only providers must never erase archived past occurrences.
        await conn.execute(
            """DELETE FROM cultural_events WHERE source=%s
            AND NOT (id = ANY(%s)) AND COALESCE(end_time,start_time) >= %s
            AND start_time < %s""",
            (source["id"], ids, today, until),
        )
        await conn.execute(
            """INSERT INTO collected_payloads(sha256,size_bytes,content_type)
            VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING""",
            (digest, len(bundle)),
        )
        await sync_cultural_events_to_db_and_publish(conn, source, events, digest, now)
        for attempt in receipts:
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
    await conn.commit()
    LOG.info("Club calendar %s: %s accepted occurrences", source["id"], len(events))
