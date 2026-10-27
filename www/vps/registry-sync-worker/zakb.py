"""ZAKB public calendar collector and explicitly modelled collection tours.

Calendar lookups are address-specific. An OSM-derived representative address per
street is a coverage sample, never evidence that every house shares its schedule.
No vehicle identity, license plate, load or actual completion is invented.
"""

import asyncio
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from html.parser import HTMLParser
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx
from house_numbers import house_number_identity, house_number_parts, house_number_sort
from icalendar import Calendar
from psycopg.types.json import Jsonb
from publications import acquire, publish


class CalendarForm(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = {}
        self.options = {}
        self.select = None
        self.enabled = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "form":
            self.enabled = attrs.get("id") == "athos-os-form"
        if not self.enabled:
            return
        if (
            tag == "input"
            and attrs.get("name")
            and attrs.get("type") != "submit"
            and (attrs.get("type") not in ("checkbox", "radio") or "checked" in attrs)
        ):
            self.fields[attrs["name"]] = attrs.get(
                "value", "on" if attrs.get("type") == "checkbox" else ""
            )
        if tag == "select":
            self.select = attrs["name"]
            self.options[self.select] = []
        if tag == "option" and self.select:
            value = attrs.get("value", "")
            self.options[self.select].append(value)
            if "selected" in attrs:
                self.fields[self.select] = value

    def handle_endtag(self, tag):
        if tag == "select":
            self.select = None
        if tag == "form":
            self.enabled = False


VALIDATION_CONTRACT = "zakb-address-v2"
RANGE_VALIDATION_CONTRACT = "zakb-reviewed-ranges-v1"
SUFFIX_VALIDATION_CONTRACT = "zakb-house-suffix-v1"
LOCATION_VALIDATION_CONTRACT = "zakb-reviewed-locations-v1"
# Actual provider confirmations, not a general interpretation of house-number ranges.
# Each calendar remains bound to the single real address submitted in that request.
REVIEWED_HOUSE_RANGES = {
    ("Lampertheim", "Georg-Tyczka-Straße"): {(2, 4)},
    ("Lampertheim", "Habichtsweg"): {(1, 13), (15, 19)},
}

# Reviewed municipality-specific spellings; see docs/quellen-bereinigung-schritt-15-zakb-adressen.md.
STREET_ALIASES = {
    ("Biblis", "Friedensstraße"): "Friedenstraße",
    ("Biblis", "Neuländer Pfad"): "Neuländerpfad",
    ("Bürstadt", "Sofienstraße"): "Sophienstraße",
    ("Bürstadt", "Vinzenzstraße"): "Vincenzstraße",
    # Primary evidence and live confirmations: step 20 investigation.
    ("Bürstadt", "Kirchgasse"): "Kirchgäßchen",
    ("Lampertheim", "Ausserhalb Brunnengewännchen"): "Am Brunnengewännchen",
    ("Lampertheim", "Außerhalb-Brunnengewännchen"): "Am Brunnengewännchen",
    ("Lampertheim", "Wilhelm-von-Ketteler-Straße"): "Wilhelm-v.-Ketteler-Straße",
    # Reviewed exterior addresses; see docs/quellen-bereinigung-schritt-16-zakb-aussenbereiche.md.
    ("Lampertheim", "Wildbahn"): "Außerhalb Wildbahn",
    ("Lampertheim", "Am Küblinger Damm"): "Außerhalb Am Küblinger Damm",
    ("Lampertheim", "Außerhalb Ost"): "Außerhalb-Ost",
}
# Biblis municipal street lists, annexes 1 and 2, resolve these duplicate provider options.
PROVIDER_CITIES = {("Biblis", "Bachgasse"): "Biblis", ("Biblis", "Enggasse"): "Biblis-Nordheim"}


# Site-specific exterior addresses, never a mapping of every house on "Außerhalb".
# Evidence: docs/quellen-bereinigung-schritt-20-zakb-restliche-strassen.md.
REVIEWED_PROVIDER_LOCATIONS = {
    ("Biblis", "Außerhalb", "6"): ("Biblis-Nordheim", "Außerhalb - Zur Rheinfähre"),
    ("Biblis", "Außerhalb (Wattenheim)", "3"): ("Biblis-Wattenheim", "Außerhalb - Birkenhof"),
    ("Biblis", "Außerhalb (Nordheim)", "10"): ("Biblis-Nordheim", "Außerhalb - Luisenhof"),
}


def reviewed_provider_location(address):
    return REVIEWED_PROVIDER_LOCATIONS.get((
        address["municipality"], address["street"],
        house_number_identity(address["house_number"]),
    ))


class AddressNotAccepted(ValueError):
    pass


class CalendarUnavailable(ValueError):
    """The provider response lacks the required selection form."""


class MissingStreet(ValueError):
    pass


def item_failure_retry_delay(exc):
    # Provider street catalogs change infrequently; retrying a known missing
    # street every half hour adds load without improving representative coverage.
    return timedelta(days=7) if isinstance(exc, MissingStreet) else timedelta(minutes=30)


class AmbiguousStreet(ValueError):
    pass


class AddressMismatch(ValueError):
    pass


class ConfirmedAddress(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "span" and dict(attrs).get("id") == "Lageadresse":
            self.capture = True

    def handle_endtag(self, tag):
        if tag == "span":
            self.capture = False

    def handle_data(self, data):
        if self.capture:
            self.parts.append(data)


def street_identity(value):
    """Only orthographic equivalence; never fuzzy-match another street."""
    value = " ".join(unicodedata.normalize("NFKC", value).casefold().split())
    return re.sub(r"str\.$", "strasse", value)


def verify_address(html, address, provider_city):
    parsed = ConfirmedAddress()
    parsed.feed(html)
    text = " ".join(" ".join(parsed.parts).split())
    match = re.fullmatch(r"(.+?)\s+([0-9]+(?:\s*[A-Za-z]|\s*-\s*[0-9]+)?),\s*[0-9]{5}\s+(.+)", text)
    if match and (match[1], match[3]) == (address["street"], provider_city):
        if (house_number_parts(match[2]) is not None
                and house_number_parts(match[2]) == house_number_parts(address["house_number"])):
            return
        bounds = re.fullmatch(r"([0-9]+)\s*-\s*([0-9]+)", match[2])
        number = address["house_number"]
        if bounds and re.fullmatch(r"[1-9][0-9]*", number):
            limits = tuple(map(int, bounds.groups()))
            if (limits in REVIEWED_HOUSE_RANGES.get((provider_city, address["street"]), set())
                    and limits[0] <= int(number) <= limits[1]):
                return
    raise AddressMismatch("Calendar confirmed a different or missing address")


def form(html):
    result = CalendarForm()
    result.feed(html)
    if not result.fields:
        raise ValueError("ZAKB public calendar form changed")
    return result.fields


def parse_ical(body, address):
    calendar = Calendar.from_ical(body)
    events = []
    for event in calendar.walk("VEVENT"):
        if any(k in event for k in ["RRULE", "RDATE", "EXDATE", "RECURRENCE-ID"]):
            raise ValueError(
                "Recurring calendar rules require an explicit expansion adapter"
            )
        day = event.decoded("DTSTART")
        if isinstance(day, datetime):
            day = day.date()
        if not isinstance(day, date):
            raise TypeError("Missing collection date")
        events.append(
            {
                "date": day.isoformat(),
                "fraction": str(event.get("SUMMARY", "")),
                **address,
                "coverage": "representative_address_only",
            }
        )
    return events


def forecast_tours(events, now, start_hour=7, end_hour=17):
    """An explicit model: sampled addresses, nearest-neighbour order, 07–17 local.

    Spatial interpolation is a straight-line approximation, NOT a measured road
    route. Uniform time allocation and ordering are recorded as assumptions.
    """
    grouped = defaultdict(list)
    for event in events:
        day = date.fromisoformat(event["date"])
        if day not in (
            now.astimezone(ZoneInfo("Europe/Berlin")).date(),
            (now + timedelta(days=1)).astimezone(ZoneInfo("Europe/Berlin")).date(),
        ):
            continue
        grouped[(day, event["municipality"], event["fraction"])].append(event)
    tours = []
    for (day, city, fraction), stops in grouped.items():
        unique = {(s["street"], s["house_number"]): s for s in stops}
        remaining = sorted(
            unique.values(), key=lambda s: (s["street"], s["house_number"])
        )
        if len(remaining) < 2:
            continue
        ordered = [remaining.pop(0)]
        while remaining:
            last = ordered[-1]
            index = min(
                range(len(remaining)),
                key=lambda i: (
                    (remaining[i]["latitude"] - last["latitude"]) ** 2
                    + (remaining[i]["longitude"] - last["longitude"]) ** 2
                ),
            )
            ordered.append(remaining.pop(index))
        start = datetime.combine(
            day, time(start_hour), ZoneInfo("Europe/Berlin")
        ).timestamp()
        end = datetime.combine(
            day, time(end_hour), ZoneInfo("Europe/Berlin")
        ).timestamp()
        points = [
            [
                start + (end - start) * i / (len(ordered) - 1),
                s["latitude"],
                s["longitude"],
            ]
            for i, s in enumerate(ordered)
        ]
        trip = (
            "collection-forecast-"
            + hashlib.sha256(f"{city}:{fraction}".encode()).hexdigest()[:16]
        )
        tours.append(
            {
                "trip_id": trip,
                "service_date": day,
                "trajectory": points,
                "metadata": {
                    "line": fraction,
                    "destination": city,
                    "geometry_basis": "stop_to_stop",
                    "coverage": "representative_addresses_only",
                    "route_model": "nearest_neighbour",
                    "time_model": f"uniform_{start_hour:02d}_{end_hour:02d}_Europe/Berlin",
                    "sampled_streets": len(ordered),
                    "entity_type": "collection_forecast_not_identified_truck",
                },
            }
        )
    return tours


def address_key(source, address):
    # Version the parser contract; changing a source URL also invalidates checkpoints.
    contract = (RANGE_VALIDATION_CONTRACT if (address["municipality"], address["street"]) in REVIEWED_HOUSE_RANGES
                else VALIDATION_CONTRACT)
    number = house_number_identity(address["house_number"])
    if house_number_parts(number)[1]:
        contract = SUFFIX_VALIDATION_CONTRACT
    identity = [contract, source["url"], address["municipality"],
                address["street"], number]
    location = reviewed_provider_location(address)
    if location:
        identity = [LOCATION_VALIDATION_CONTRACT, *identity[1:], *location]
    return hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()


async def calendar_for_address(conn, client, source, address, now, locations=None, *, refresh=False):
    key = address_key(source, address)
    cursor = await conn.execute(
        """SELECT p.body,c.payload_sha256,c.fetched_at FROM collection_checkpoints c
        JOIN collected_payloads p ON p.sha256=c.payload_sha256
        WHERE c.source_id=%s AND c.item_key=%s AND c.fetched_at>%s""",
        (source["id"], key, now-timedelta(seconds=source.get("calendar_cache_seconds", source["interval_seconds"]))),
    )
    cached = await cursor.fetchone()
    await conn.commit()
    if cached and not refresh:
        body, digest, fetched = cached
        return parse_ical(bytes(body), address), digest, fetched, True

    async def request(fields=None):
        # Pace every provider request, not just the gap between address workflows.
        await asyncio.sleep(source.get("request_spacing_seconds", 1))
        return await acquire(conn, client, source, form=fields)

    response, _, _ = await request()
    initial = CalendarForm()
    initial.feed(response.text)
    if not initial.options.get("aos[Ort]"):
        raise CalendarUnavailable("Calendar municipality selector missing from response")
    city = address["municipality"]
    cities = [value for value in initial.options.get("aos[Ort]", [])
              if value == city or value.startswith(city + "-")]
    if not cities:
        raise MissingStreet("Municipality not offered by calendar")
    locations = {} if locations is None else locations
    offered = {}
    for provider_city in cities:
        if provider_city not in locations:
            fields = dict(initial.fields)
            fields.update({"aos[Ort]": provider_city, "submitAction": "CITYCHANGED"})
            city_response, _, _ = await request(fields)
            parsed = CalendarForm()
            parsed.feed(city_response.text)
            if parsed.fields.get("aos[Ort]") != provider_city or not parsed.options.get("aos[Strasse]"):
                raise AddressMismatch("Calendar did not confirm selected municipality")
            locations[provider_city] = set(parsed.options["aos[Strasse]"])
            offered[provider_city] = parsed.fields
    expected_city = PROVIDER_CITIES.get((city, address["street"]))
    matches = [(candidate, value) for candidate in cities for value in locations[candidate]
               if street_identity(value) == street_identity(address["street"])]
    location = reviewed_provider_location(address)
    if not matches and location:
        matches = [(candidate, value) for candidate in cities for value in locations[candidate]
                   if candidate == location[0] and street_identity(value) == street_identity(location[1])]
    if not matches and (city, address["street"]) in STREET_ALIASES:
        matches = [(candidate, value) for candidate in cities for value in locations[candidate]
                   if street_identity(value) == street_identity(STREET_ALIASES[(city, address["street"])])]
    if expected_city is not None:
        matches = [(candidate, value) for candidate, value in matches if candidate == expected_city]
    if not matches:
        raise MissingStreet("Street not offered in municipality or districts")
    if len(matches) != 1:
        raise AmbiguousStreet("Street occurs in multiple districts")
    provider_city, provider_street = matches[0]
    if provider_city in offered and provider_city == cities[-1]:
        fields = offered[provider_city]
    else:
        fields = dict(initial.fields)
        fields.update({"aos[Ort]": provider_city, "submitAction": "CITYCHANGED"})
        city_response, _, _ = await request(fields)
        fields = form(city_response.text)
        if fields.get("aos[Ort]") != provider_city:
            raise AddressMismatch("Calendar did not confirm selected municipality")
    number, suffix = house_number_parts(address["house_number"])
    fields.pop("aos[Hausnummernwahl]", None)
    fields.update({"aos[Strasse]": provider_street, "aos[Hausnummer]": number,
                   "aos[Hausnummerzusatz]": suffix,
                   "submitAction": "nextPage"})
    response, _, _ = await request(fields)
    if "filedownload_ICAL" not in response.text:
        raise AddressNotAccepted("Address not accepted by calendar")
    verify_address(response.text, {**address, "street": provider_street}, provider_city)
    fields = form(response.text)
    fields["submitAction"] = "filedownload_ICAL"
    response, digest, _ = await request(fields)
    events = parse_ical(response.content, address)
    fetched = datetime.now(UTC)
    await conn.execute(
        """INSERT INTO collection_checkpoints(source_id,item_key,payload_sha256,fetched_at)
        VALUES (%s,%s,%s,%s) ON CONFLICT(source_id,item_key) DO UPDATE
        SET payload_sha256=EXCLUDED.payload_sha256,fetched_at=EXCLUDED.fetched_at""",
        (source["id"], key, digest, fetched),
    )
    await conn.execute("DELETE FROM collection_item_failures WHERE source_id=%s AND item_key=%s", (source["id"], key))
    await conn.commit()
    return events, digest, fetched, False


async def import_zakb(conn, client, source):
    now = datetime.now(UTC)
    loop = asyncio.get_running_loop()
    deadline = loop.time() + source.get("run_budget_seconds", 900)
    if source.get("address_dataset"):
        cursor = await conn.execute(
            "SELECT data,payload_sha256 FROM collected_datasets WHERE dataset=%s AND expires_at>NOW()",
            (source["address_dataset"],))
        stored = await cursor.fetchone()
        await conn.commit()
        if not stored:
            raise ValueError("Regional address collector has not published a fresh inventory")
        inventory, geo_digest = stored
    else:
        # OSM is collected on the VPS, with the exact query response in the archive.
        city_pattern = "|".join(source["municipalities"])
        south, west, north, east = source["bbox"]
        query = f'[out:json][timeout:90];nwr["addr:city"~"^({city_pattern})$"]["addr:street"]["addr:housenumber"]({south},{west},{north},{east});out center tags;'
        inventory_key = "address-inventory:" + hashlib.sha256((source["address_url"] + query).encode()).hexdigest()
        cursor = await conn.execute(
            """SELECT p.body,c.payload_sha256 FROM collection_checkpoints c
            JOIN collected_payloads p ON p.sha256=c.payload_sha256
            WHERE c.source_id=%s AND c.item_key=%s AND c.fetched_at>%s""",
            (source["id"], inventory_key, now-timedelta(seconds=source.get("calendar_cache_seconds", source["interval_seconds"]))),
        )
        cached_inventory = await cursor.fetchone()
        await conn.commit()
        if cached_inventory:
            raw_inventory, geo_digest = cached_inventory
            inventory = json.loads(bytes(raw_inventory))
        else:
            async with asyncio.timeout(max(1, deadline-loop.time())):
                response, geo_digest, _ = await acquire(
                    conn, client, source, source["address_url"] + "?" + urlencode({"data": query})
                )
            inventory = response.json()
            if not isinstance(inventory.get("elements"), list):
                raise ValueError("Invalid address inventory")
            await conn.execute(
                """INSERT INTO collection_checkpoints(source_id,item_key,payload_sha256,fetched_at)
                VALUES (%s,%s,%s,%s) ON CONFLICT(source_id,item_key) DO UPDATE
                SET payload_sha256=EXCLUDED.payload_sha256,fetched_at=EXCLUDED.fetched_at""",
                (source["id"], inventory_key, geo_digest, datetime.now(UTC)),
            )
            await conn.commit()
    addresses = {}
    candidates = defaultdict(dict)
    for item in inventory["elements"]:
        tags = item["tags"]
        city = tags.get("addr:city")
        street = tags.get("addr:street")
        number = tags.get("addr:housenumber")
        center = item.get("center", item)
        if (
            city not in source["municipalities"]
            or not street
            or not number
            or house_number_parts(number) is None
            or not center.get("lat")
        ):
            continue
        key = (city, street)
        candidate = {
            "municipality": city,
            "street": street,
            "house_number": number,
            "latitude": center["lat"],
            "longitude": center["lon"],
        }
        candidates[key].setdefault(house_number_identity(number), candidate)
        if key not in addresses or house_number_sort(number) < house_number_sort(addresses[key]["house_number"]):
            addresses[key] = candidate
    if not addresses:
        raise ValueError("No representative addresses available")
    # Old checkpoints cannot prove address identity; withdraw their public projections.
    cursor = await conn.execute("SELECT data->>'validation_contract' FROM collected_datasets WHERE dataset='waste/coverage' AND source_id=%s", (source["id"],))
    previous = await cursor.fetchone()
    if previous and previous[0] != VALIDATION_CONTRACT:
        await conn.execute("DELETE FROM collected_datasets WHERE dataset='waste/calendar' AND source_id=%s", (source["id"],))
        await conn.execute("DELETE FROM movement_schedules WHERE source_id=%s", (source["id"],))
        await conn.execute("DELETE FROM movement_latest WHERE basis='schedule_prediction' AND data->>'source_id'=%s", (source["id"],))
    await conn.commit()
    locations = {}
    events = []
    failures = []
    inputs = [geo_digest]
    sampled_at = []
    cursor = await conn.execute(
        "SELECT item_key,retry_after FROM collection_item_failures WHERE source_id=%s", (source["id"],)
    )
    past_failures = dict(await cursor.fetchall())
    deferred = {key for key, retry in past_failures.items() if retry > now}
    await conn.commit()
    coverage = {city: {"sampled_streets": sum(a["municipality"] == city for a in addresses.values()),
                       "attempted_calendars": 0, "successful_calendars": 0,
                       "failed_calendars": 0, "reused_calendars": 0, "deferred_calendars": 0} for city in source["municipalities"]}
    cursor = await conn.execute(
        "SELECT item_key,fetched_at FROM collection_checkpoints WHERE source_id=%s",
        (source["id"],),
    )
    saved = dict(await cursor.fetchall())
    cache_seconds = source.get("calendar_cache_seconds", source["interval_seconds"])
    fresh_keys = {key for key, fetched in saved.items() if fetched > now-timedelta(seconds=cache_seconds)}
    refresh_before = now-timedelta(seconds=source.get("calendar_refresh_seconds", cache_seconds))
    await conn.commit()
    # A previously validated house remains the first renewal candidate after expiry.
    probes = {}
    saved_at = {}
    for key, choices in candidates.items():
        ordered_choices = sorted(choices.values(), key=lambda a: (
            reviewed_provider_location(a) is None,
            address_key(source, a) in past_failures,
            past_failures.get(address_key(source, a), now), house_number_sort(a["house_number"])))
        verified = sorted((a for a in ordered_choices if address_key(source, a) in saved),
                          key=lambda a: saved[address_key(source, a)], reverse=True)
        selected = ([verified[0]] + [a for a in ordered_choices if a != verified[0]]) if verified else ordered_choices
        saved_at[key] = saved.get(address_key(source, selected[0]))
        eligible = [a for a in selected if address_key(source, a) not in deferred]
        probes[key] = eligible[:3] or selected[:1]
        addresses[key] = selected[0] if address_key(source, selected[0]) in fresh_keys else probes[key][0]
    calendars = {}
    refresh_failures = []
    # Publish every still-fresh proof even when its renewal fails or the budget ends.
    for key, address in addresses.items():
        if address_key(source, address) not in fresh_keys:
            continue
        counts = coverage[address["municipality"]]
        try:
            async with asyncio.timeout(10):
                calendars[key] = await calendar_for_address(conn, client, source, address, now, locations)
            counts["attempted_calendars"] += 1
            counts["successful_calendars"] += 1
            counts["reused_calendars"] += 1
        except (httpx.HTTPError, ValueError, TypeError, KeyError, TimeoutError):
            await conn.rollback()
    due = [key for key in addresses if key not in calendars or saved_at[key] <= refresh_before]
    # Expired known proofs precede early renewals; unknown streets follow them.
    # Successful renewals acquire a new timestamp, so the next run advances.
    due.sort(key=lambda key: (saved_at[key] is None, saved_at[key] or now, key))
    for key in due:
        address = probes[key][0]
        counts = coverage[address["municipality"]]
        cached = key in calendars
        if address_key(source, address) in deferred:
            counts["deferred_calendars"] += int(not cached)
            continue
        if loop.time() >= deadline:
            break
        counts["attempted_calendars"] += int(not cached)
        counts["refresh_attempted_calendars"] = counts.get("refresh_attempted_calendars", 0) + int(cached)
        failed_address = address
        try:
            timeout = min(120, deadline-loop.time())
            async with asyncio.timeout(timeout):
                for index, candidate in enumerate(probes[key]):
                    failed_address = candidate
                    try:
                        result = await calendar_for_address(conn, client, source, candidate, now, locations, refresh=True)
                        break
                    except (httpx.HTTPError, ValueError, TypeError, KeyError, TimeoutError) as exc:
                        failed_address = candidate
                        await conn.rollback()
                        await conn.execute(
                            """INSERT INTO collection_item_failures(source_id,item_key,retry_after,error)
                            VALUES (%s,%s,NOW()+%s,%s) ON CONFLICT(source_id,item_key)
                            DO UPDATE SET retry_after=EXCLUDED.retry_after,error=EXCLUDED.error""",
                            (source["id"], address_key(source, candidate), item_failure_retry_delay(exc), type(exc).__name__),
                        )
                        await conn.commit()
                        if not isinstance(exc, (AddressNotAccepted, AddressMismatch)) or index + 1 == len(probes[key]):
                            raise
            calendars[key] = result
            counts["successful_calendars"] += int(not cached)
            counts["reused_calendars"] -= int(cached)
            counts["refreshed_calendars"] = counts.get("refreshed_calendars", 0) + 1
        except (httpx.HTTPError, ValueError, TypeError, KeyError, TimeoutError) as exc:
            await conn.rollback()
            await conn.execute(
                """INSERT INTO collection_item_failures(source_id,item_key,retry_after,error)
                VALUES (%s,%s,NOW()+%s,%s) ON CONFLICT(source_id,item_key)
                DO UPDATE SET retry_after=EXCLUDED.retry_after,error=EXCLUDED.error""",
                (source["id"],address_key(source,failed_address),item_failure_retry_delay(exc),type(exc).__name__),
            )
            await conn.commit()
            failure = {"municipality": address["municipality"], "street": address["street"], "error": type(exc).__name__}
            if cached:
                counts["refresh_failed_calendars"] = counts.get("refresh_failed_calendars", 0) + 1
                refresh_failures.append(failure)
            else:
                counts["failed_calendars"] += 1
                failures.append(failure)
    for calendar_events, digest, fetched, _ in calendars.values():
        events.extend(calendar_events)
        inputs.append(digest)
        sampled_at.append(fetched)
    pending_refresh = sum(saved_at[key] is not None and (key not in calendars or calendars[key][2] <= refresh_before) for key in due)
    remaining = sum(c["sampled_streets"]-c["attempted_calendars"] for c in coverage.values())
    incomplete = bool(failures or refresh_failures) or pending_refresh > 0 or remaining > 0 or any(c["sampled_streets"] == 0 for c in coverage.values())
    # Commit a reproducibility manifest linking every calendar and geometry input.
    manifest = json.dumps(
        {
            "validation_contract": VALIDATION_CONTRACT,
            "reviewed_range_contract": RANGE_VALIDATION_CONTRACT,
            "house_suffix_contract": SUFFIX_VALIDATION_CONTRACT,
            "reviewed_location_contract": LOCATION_VALIDATION_CONTRACT,
            "inputs": inputs,
            "coverage": "representative_addresses_only",
            "failed_streets": failures,
            "refresh_failed_streets": refresh_failures,
            "remaining_refresh_streets": pending_refresh,
            "calendar_cache_seconds": cache_seconds,
            "calendar_refresh_seconds": source.get("calendar_refresh_seconds", cache_seconds),
            "municipalities": coverage,
            "complete_address_coverage": False,
            "remaining_streets": remaining,
            "run_budget_seconds": source.get("run_budget_seconds", 900),
            "status": "partial" if incomplete else "sample_complete",
            "checked_at": now.isoformat(),
        },
        sort_keys=True,
    ).encode()
    digest = hashlib.sha256(manifest).hexdigest()
    async with conn.transaction():
        await conn.execute(
            "INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING",
            (digest, manifest),
        )
        await publish(conn, source, "waste/coverage", json.loads(manifest), digest, now)
        # Keep the previous valid calendar/schedules if no address could be verified.
        if not sampled_at:
            await conn.execute(
                "INSERT INTO collection_attempts(source_id,payload_sha256,status,error) VALUES (%s,%s,'failed','No calendars verified')",
                (source["id"], digest),
            )
        else:
            await publish_calendar(conn, source, events, digest, min(sampled_at), now, incomplete, failures)
    await conn.commit()
    return "failed" if not sampled_at else "partial" if incomplete else "success"


async def publish_calendar(conn, source, events, digest, source_time, now, incomplete, failures):
    await publish(conn, source, "waste/calendar", events, digest, source_time)
    await conn.execute(
        "DELETE FROM movement_schedules WHERE source_id=%s", (source["id"],)
    )
    await conn.execute(
        "DELETE FROM movement_latest WHERE basis='schedule_prediction' AND data->>'source_id'=%s",
        (source["id"],),
    )
    for tour in forecast_tours(events, now):
        points = tour["trajectory"]
        await conn.execute(
            """INSERT INTO movement_schedules(source_id,trip_id,service_date,kind,starts_at,ends_at,
            payload_sha256,fetched_at,trajectory,metadata) VALUES (%s,%s,%s,'waste',%s,%s,%s,%s,%s,%s)""",
            (
                source["id"],
                tour["trip_id"],
                tour["service_date"],
                datetime.fromtimestamp(points[0][0], UTC),
                datetime.fromtimestamp(points[-1][0], UTC),
                digest,
                now,
                Jsonb(points),
                Jsonb(tour["metadata"]),
            ),
        )
    await conn.execute(
        "INSERT INTO collection_attempts(source_id,payload_sha256,status,error) VALUES (%s,%s,%s,%s)",
        (
            source["id"],
            digest,
            "partial" if incomplete else "success",
            (f"{len(failures)} street samples rejected; "
             f"{sum(item['error'] == 'MissingStreet' for item in failures)} streets not offered by provider; "
             "address sample coverage only"),
        ),
    )
