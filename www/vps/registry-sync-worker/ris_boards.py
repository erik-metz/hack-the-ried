"""Optional RIS::Boards 1.8.2 acquisition and explicit GTFS trip-instance links."""

import hashlib
import json
import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode

from publications import acquire, publish

CONTRACT = "ris-boards-netz-1.8.2"
TRAIN_TYPES = {
    "HIGH_SPEED_TRAIN",
    "INTERCITY_TRAIN",
    "INTER_REGIONAL_TRAIN",
    "REGIONAL_TRAIN",
    "CITY_TRAIN",
}


def aware_time(value):
    if not isinstance(value, str):
        raise TypeError("RIS timestamp missing")
    result = datetime.fromisoformat(value)
    if result.tzinfo is None:
        raise ValueError("RIS timestamp must include timezone")
    return result.astimezone(UTC)


def identifier(value, maximum=128):
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise ValueError("RIS identifier missing or invalid")
    return value


def parse_board(body, event_type, allowed_evas):
    """Consume documented fields only; station names never establish identity."""
    plural = event_type + "s"
    if (
        event_type not in {"departure", "arrival"}
        or not isinstance(body, dict)
        or not isinstance(body.get(plural), list)
    ):
        raise ValueError("RIS board response expected")
    if len(body[plural]) > 20000:
        raise ValueError("RIS board exceeds supported size")
    records, seen = [], set()
    for item in body[plural]:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("station"), dict)
            or not isinstance(item.get("transport"), dict)
        ):
            raise TypeError("RIS board event incomplete")
        station, transport = item["station"], item["transport"]
        eva = identifier(station.get("evaNumber"))
        if eva not in allowed_evas:
            raise ValueError("RIS station outside explicit request")
        journey = identifier(item.get("journeyID"), 82)
        if transport.get("journeyID") != journey:
            raise ValueError("RIS transport journey identity mismatch")
        event = identifier(item.get(event_type + "ID"), 12)
        key = (journey, event, eva, event_type)
        if key in seen:
            raise ValueError("Duplicate RIS board event")
        seen.add(key)
        scheduled, best = (
            aware_time(item.get("timeSchedule")),
            aware_time(item.get("time")),
        )
        basis = item.get("timeType")
        if (
            basis not in {"SCHEDULE", "PREVIEW", "REAL"}
            or type(item.get("canceled")) is not bool
        ):
            raise ValueError("Invalid RIS time/cancellation basis")
        if basis == "SCHEDULE" and scheduled != best:
            raise ValueError("RIS schedule-only time conflicts with schedule")
        if transport.get("type") not in TRAIN_TYPES:
            continue
        direction = transport.get(
            "destination" if event_type == "departure" else "origin", {}
        )
        description = transport.get("journeyDescription")
        if not isinstance(description, str) or not isinstance(
            item.get("platform"), str
        ):
            raise TypeError("RIS public description/platform missing")
        records.append(
            {
                "journey_id": journey,
                "event_id": event,
                "event_type": event_type,
                "eva_number": eva,
                "scheduled_at": scheduled.isoformat(),
                "time": best.isoformat(),
                "time_basis": basis,
                "cancelled": item["canceled"],
                "delay_seconds": int((best - scheduled).total_seconds())
                if basis != "SCHEDULE"
                else None,
                "platform": item["platform"],
                "platform_schedule": item.get("platformSchedule"),
                "description": description,
                "category": transport.get("category"),
                "train_number": transport.get("number"),
                "line": transport.get("line"),
                "direction": direction.get("name")
                if isinstance(direction, dict)
                else None,
                "dfid": transport.get("dfid"),
                "dtid": transport.get("dtid"),
                "gtfs_link": {"status": "unmapped"},
            }
        )
    return records


def load_crosswalk(path=None):
    path = path if path is not None else os.getenv("RIS_TRIP_CROSSWALK_FILE")
    if not path:
        return {}, None
    file = Path(path)
    if file.stat().st_size > 2_000_000:
        raise ValueError("RIS crosswalk exceeds supported size")
    raw = file.read_bytes()
    body = json.loads(raw)
    if (
        not isinstance(body, dict)
        or body.get("version") != 1
        or not isinstance(body.get("links"), list)
        or len(body["links"]) > 5000
    ):
        raise ValueError("RIS crosswalk version 1 expected")
    links, journeys, trips = {}, {}, {}
    for item in body["links"]:
        if not isinstance(item, dict):
            raise TypeError("RIS crosswalk entry invalid")
        for field in [
            "journey_id",
            "event_id",
            "eva_number",
            "schedule_source",
            "trip_id",
            "stop_id",
            "evidence",
        ]:
            identifier(item.get(field), 2048 if field == "evidence" else 128)
        if (
            item.get("event_type") not in {"arrival", "departure"}
            or type(item.get("stop_sequence")) is not int
            or item["stop_sequence"] < 0
        ):
            raise ValueError("RIS crosswalk stop invalid")
        day = date.fromisoformat(item["service_date"])
        if day.isoformat() != item["service_date"]:
            raise ValueError("RIS service date must use YYYY-MM-DD")
        aware_time(item["scheduled_at"])
        key = (
            item["journey_id"],
            item["event_id"],
            item["eva_number"],
            item["event_type"],
        )
        target = (item["schedule_source"], item["trip_id"], day)
        if (
            key in links
            or (
                item["journey_id"] in journeys
                and journeys[item["journey_id"]] != target
            )
            or (target in trips and trips[target] != item["journey_id"])
        ):
            raise ValueError("Duplicate or ambiguous RIS trip-instance crosswalk")
        links[key] = item
        journeys[item["journey_id"]], trips[target] = target, item["journey_id"]
    return links, hashlib.sha256(raw).hexdigest()


def match_schedule(event, link, schedule):
    """Validate explicit stop identity and schedule time; never derive service date."""
    if aware_time(event["scheduled_at"]) != aware_time(link["scheduled_at"]):
        return {"status": "schedule_mismatch"}
    if not schedule:
        return {"status": "schedule_missing"}
    kind, metadata = schedule
    stops = [
        s
        for s in metadata.get("stop_times", [])
        if s["stop_id"] == link["stop_id"] and s["sequence"] == link["stop_sequence"]
    ]
    if (
        kind != "train"
        or len(stops) != 1
        or stops[0].get(event["event_type"])
        != aware_time(event["scheduled_at"]).timestamp()
    ):
        return {"status": "schedule_mismatch"}
    return {
        "status": "matched",
        "schedule_source": link["schedule_source"],
        "trip_id": link["trip_id"],
        "service_date": link["service_date"],
        "stop_id": link["stop_id"],
        "stop_sequence": link["stop_sequence"],
        "basis": "explicit_crosswalk_and_exact_schedule",
    }


async def import_ris_boards(conn, client, source):
    if (
        source.get("contract") != CONTRACT
        or source.get("contract_confirmed") is not True
    ):
        raise ValueError(
            "Subscribed RIS Boards contract must be confirmed before activation"
        )
    evas = source.get("eva_numbers", [])
    if (
        not evas
        or len(evas) > 32
        or len(set(evas)) != len(evas)
        or any(not isinstance(eva, str) or not eva.isdigit() for eva in evas)
    ):
        raise ValueError("RIS Boards requires 1..32 explicit EVA numbers")
    crosswalk, crosswalk_digest = load_crosswalk()
    fetched = datetime.now(UTC)
    start, end = fetched - timedelta(minutes=5), fetched + timedelta(minutes=60)
    records, receipts = [], []
    for index in range(0, len(evas), 10):
        batch = evas[index : index + 10]
        for event_type in ("departure", "arrival"):
            query = urlencode(
                {
                    "timeStart": start.isoformat(),
                    "timeEnd": end.isoformat(),
                    "includeStationGroup": "false",
                    "includeMessagesDisruptions": "false",
                    "sortBy": "TIME",
                }
            )
            url = (
                source["url"].rstrip("/")
                + "/public/"
                + event_type
                + "s/"
                + ",".join(batch)
                + "?"
                + query
            )
            response, digest, attempt = await acquire(conn, client, source, url)
            records.extend(parse_board(response.json(), event_type, set(batch)))
            receipts.append((digest, attempt))
    if datetime.now(UTC) - fetched > timedelta(
        seconds=source.get("max_age_seconds", 180)
    ):
        raise ValueError("RIS acquisition window expired")
    cache = {}
    for event in records:
        key = (
            event["journey_id"],
            event["event_id"],
            event["eva_number"],
            event["event_type"],
        )
        link = crosswalk.get(key)
        if not link:
            continue
        target = (
            link["schedule_source"],
            link["trip_id"],
            date.fromisoformat(link["service_date"]),
        )
        if target not in cache:
            cursor = await conn.execute(
                """SELECT kind,metadata FROM movement_schedules
                WHERE source_id=%s AND trip_id=%s AND service_date=%s AND fetched_at > NOW() - INTERVAL '48 hours'""",
                target,
            )
            cache[target] = await cursor.fetchone()
        event["gtfs_link"] = match_schedule(event, link, cache[target])
    await conn.commit()
    bundle = json.dumps(
        {
            "payload_sha256s": [digest for digest, _ in receipts],
            "crosswalk_sha256": crosswalk_digest,
            "crosswalk": list(crosswalk.values()),
        },
        sort_keys=True,
    ).encode()
    combined_digest = hashlib.sha256(bundle).hexdigest()
    async with conn.transaction():
        await conn.execute(
            """INSERT INTO collected_payloads(sha256,size_bytes,content_type)
            VALUES (%s,%s,%s) ON CONFLICT DO NOTHING""",
            (combined_digest, len(bundle), "application/json"),
        )
        await publish(
            conn,
            source,
            "transport/bahn/boards",
            {
                "events": records,
                "timestamp_basis": "fetched",
                "contract": CONTRACT,
                "window_start": start.isoformat(),
                "window_end": end.isoformat(),
                "eva_numbers": evas,
                "payload_sha256s": [digest for digest, _ in receipts],
                "crosswalk_sha256": crosswalk_digest,
                "attribution": "Deutsche Bahn",
                "license": "subscription_terms",
            },
            combined_digest,
            fetched,
        )
        for _, attempt in receipts:
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
    await conn.commit()
