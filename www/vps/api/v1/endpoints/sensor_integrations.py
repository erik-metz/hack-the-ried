"""Inbound integrations for community sensor networks."""

import hashlib
import json
import math
import os
import re
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import psycopg_pool
from dependencies import get_db_pool
from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

router = APIRouter(prefix="/integrations/sensor", tags=["Sensor integrations"])
basic_auth = HTTPBasic(auto_error=False)
DEVICE_ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$")
METRIC_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
UNIT_PATTERN = re.compile(r"^[^\s\x00-\x1f]{1,32}$")
FIRMWARE_VERSION_PATTERN = re.compile(r"^[1-9]\d{0,2}$")
MAX_MEASUREMENTS = 41


def _authenticate(credentials: HTTPBasicCredentials | None) -> None:
    username = os.getenv("TTN_WEBHOOK_USERNAME", "")
    password = os.getenv("TTN_WEBHOOK_PASSWORD", "")
    if not username or not password:
        raise HTTPException(503, "TTN webhook credentials are not configured")
    supplied_username = credentials.username if credentials else ""
    supplied_password = credentials.password if credentials else ""
    username_ok = secrets.compare_digest(supplied_username, username)
    password_ok = secrets.compare_digest(supplied_password, password)
    if not (username_ok and password_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


def _event_time(uplink: dict[str, Any], body: dict[str, Any]) -> datetime:
    value = uplink.get("received_at") or body.get("received_at")
    if not isinstance(value, str):
        raise HTTPException(422, "Uplink received_at timestamp is required")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(422, "Uplink received_at must be ISO-8601") from exc
    if parsed.tzinfo is None:
        raise HTTPException(422, "Uplink received_at must include a timezone")
    return parsed.astimezone(UTC)


def _measurements(decoded: Any) -> list[dict[str, Any]]:
    if not isinstance(decoded, dict) or not isinstance(decoded.get("measurements"), list):
        raise HTTPException(422, "decoded_payload.measurements must be an array")
    measurements = decoded["measurements"]
    if not measurements or len(measurements) > MAX_MEASUREMENTS:
        raise HTTPException(422, f"Provide between 1 and {MAX_MEASUREMENTS} measurements")
    result = []
    seen = set()
    for item in measurements:
        if not isinstance(item, dict):
            raise HTTPException(422, "Each measurement must be an object")
        metric, value, unit = item.get("metric"), item.get("value"), item.get("unit")
        if not isinstance(metric, str) or not METRIC_PATTERN.fullmatch(metric):
            raise HTTPException(422, "Measurement metric has an invalid name")
        if metric in seen:
            raise HTTPException(422, f"Duplicate measurement metric: {metric}")
        if (isinstance(value, bool) or not isinstance(value, (int, float))
                or not math.isfinite(value)):
            raise HTTPException(422, f"Measurement {metric} must have a finite numeric value")
        if not isinstance(unit, str) or not UNIT_PATTERN.fullmatch(unit):
            raise HTTPException(422, f"Measurement {metric} must include a valid unit")
        result.append({"metric": metric, "value": float(value), "unit": unit})
        seen.add(metric)
    return result


def _window_statistics(decoded: Any) -> tuple[int, list[dict[str, Any]]] | None:
    if not isinstance(decoded, dict) or "window_statistics" not in decoded:
        return None
    seconds = decoded.get("window_seconds")
    if isinstance(seconds, bool) or not isinstance(seconds, int) or not 1 <= seconds <= 16777215:
        raise HTTPException(422, "decoded_payload.window_seconds must be an unsigned 24-bit duration")
    values = decoded.get("window_statistics")
    if not isinstance(values, list) or not values or len(values) > MAX_MEASUREMENTS:
        raise HTTPException(422, "decoded_payload.window_statistics must contain 1 to 41 entries")
    result = []
    seen = set()
    for item in values:
        if not isinstance(item, dict):
            raise HTTPException(422, "Each window statistic must be an object")
        metric, unit = item.get("metric"), item.get("unit")
        if not isinstance(metric, str) or not METRIC_PATTERN.fullmatch(metric):
            raise HTTPException(422, "Window statistic metric has an invalid name")
        if metric in seen:
            raise HTTPException(422, f"Duplicate window statistic metric: {metric}")
        if not isinstance(unit, str) or not UNIT_PATTERN.fullmatch(unit):
            raise HTTPException(422, f"Window statistic {metric} must include a valid unit")
        row = {"metric": metric, "unit": unit}
        for field in ("min_value", "mean_value", "max_value"):
            value = item.get(field)
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, (int, float))
                or not math.isfinite(value)
            ):
                raise HTTPException(422, f"Window statistic {metric}.{field} must be finite or null")
            row[field] = float(value) if value is not None else None
        if row["mean_value"] is None:
            raise HTTPException(422, f"Window statistic {metric} must include a mean")
        if (row["min_value"] is not None and row["min_value"] > row["mean_value"]
                or row["max_value"] is not None and row["max_value"] < row["mean_value"]):
            raise HTTPException(422, f"Window statistic {metric} has an inconsistent range")
        count = item.get("sample_count")
        if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= 16777215:
            raise HTTPException(422, f"Window statistic {metric}.sample_count must be an unsigned 24-bit integer")
        row["sample_count"] = count
        result.append(row)
        seen.add(metric)
    measurement_means = {item["metric"]: (item["value"], item["unit"])
                         for item in _measurements(decoded)}
    if set(measurement_means) != seen:
        raise HTTPException(422, "Window statistics must match decoded measurements")
    for row in result:
        mean, unit = measurement_means[row["metric"]]
        if unit != row["unit"] or not math.isclose(mean, row["mean_value"], rel_tol=1e-9, abs_tol=1e-9):
            raise HTTPException(422, f"Window mean for {row['metric']} must match its measurement")
    return seconds, result


def _sound_events(decoded: Any) -> list[dict[str, Any]]:
    if not isinstance(decoded, dict) or "sound_events" not in decoded:
        return []
    events = decoded.get("sound_events")
    if not isinstance(events, list):
        raise HTTPException(422, "decoded_payload.sound_events must be an array")
    if len(events) > 50:
        raise HTTPException(422, "decoded_payload.sound_events contains too many entries")
    result = []
    seen = set()
    for item in events:
        if not isinstance(item, dict):
            raise HTTPException(422, "Each sound event must be an object")
        class_name = item.get("class")
        count = item.get("count")
        max_score = item.get("max_score")
        if not isinstance(class_name, str) or not METRIC_PATTERN.fullmatch(class_name):
            raise HTTPException(422, "Sound event class has an invalid name")
        if class_name in seen:
            raise HTTPException(422, f"Duplicate sound event class: {class_name}")
        seen.add(class_name)
        if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= 65535:
            raise HTTPException(422, "Sound event count must be an unsigned integer")
        if max_score is not None and (
            isinstance(max_score, bool) or not isinstance(max_score, (int, float))
            or not 0.0 <= max_score <= 1.0
        ):
            raise HTTPException(422, "Sound event max_score must be between 0.0 and 1.0")
        result.append({
            "class": class_name,
            "class_id": item.get("class_id"),
            "count": count,
            "max_score": float(max_score) if max_score is not None else None,
        })
    return result


def _ttn_coordinates(uplink: dict[str, Any]) -> tuple[float, float] | None:
    locations = uplink.get("locations")
    if not isinstance(locations, dict):
        return None
    # Prefer a manually configured registry location over less authoritative sources.
    candidates = [locations.get("user"), *(
        value for key, value in locations.items() if key != "user"
    )]
    for location in candidates:
        if not isinstance(location, dict):
            continue
        latitude, longitude = location.get("latitude"), location.get("longitude")
        if (isinstance(latitude, bool) or not isinstance(latitude, (int, float))
                or isinstance(longitude, bool) or not isinstance(longitude, (int, float))
                or not math.isfinite(latitude) or not math.isfinite(longitude)
                or not -90 <= latitude <= 90 or not -180 <= longitude <= 180):
            continue
        return float(latitude), float(longitude)
    return None


def _event_identity(application_id: str, device_id: str, uplink: dict[str, Any],
                    received_at: datetime, correlations: Any) -> tuple[str, str, list[str]]:
    if (not isinstance(correlations, list)
            or any(not isinstance(value, str) for value in correlations)):
        raise HTTPException(422, "correlation_ids must be an array of strings")
    correlations = correlations[:100]
    event_correlation = next((value for value in correlations if value.startswith("as:up:")), None)
    raw_payload = uplink.get("frm_payload", "")
    if not isinstance(raw_payload, str):
        raise HTTPException(422, "frm_payload must be a base64 string")
    event_material = {
        "application_id": application_id,
        "device_id": device_id,
        "received_at": received_at.isoformat(),
        "f_cnt": uplink.get("f_cnt"),
        "f_port": uplink.get("f_port"),
        "frm_payload": raw_payload,
        "decoded_payload": uplink.get("decoded_payload"),
    }
    try:
        canonical = json.dumps(event_material, sort_keys=True, separators=(",", ":"),
                               ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "Uplink payload must contain JSON-safe values") from exc
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    return event_correlation or digest, digest, correlations


async def _write_canonical_readings(conn, *, sensor_id: str, device_id: str,
                                    application_id: str, event_id: str,
                                    observed_at: datetime, collected_at: datetime,
                                    measurements: list[dict[str, Any]],
                                    window: tuple[int, list[dict[str, Any]]] | None,
                                    sound_events: list[dict[str, Any]] | None = None,
                                    backfill: bool = False,
                                    window_start: datetime | None = None) -> None:
    """Write TTN observations to the authoritative entities/definitions/readings model."""
    entity_id = f"sensor:{sensor_id}"
    await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata,is_hidden)
        VALUES (%s,%s,'sensor',%s::jsonb,TRUE)
        ON CONFLICT (id) DO UPDATE SET
            metadata=entities.metadata || EXCLUDED.metadata, updated_at=NOW()""",
        (entity_id, device_id, json.dumps({"ttn_application_id": application_id,
                                          "ttn_device_id": device_id,
                                          "legacy_sensor_id": sensor_id})))
    stats = {item["metric"]: item for item in window[1]} if window else {}
    window_start = (window_start or observed_at - timedelta(seconds=window[0])) if window else None
    for measurement in measurements:
        metric, unit = measurement["metric"], measurement["unit"]
        statistic = stats.get(metric)
        records = []
        if statistic is None:
            records.append(({}, measurement["value"], None, None, "instantaneous", None))
        else:
            for name, field in (("min", "min_value"), ("mean", "mean_value"), ("max", "max_value")):
                value = statistic[field]
                if value is not None:
                    records.append(({"statistic": name}, value, window_start, observed_at,
                                    "interval_statistic", statistic["sample_count"]))
        for dimensions, value, period_start, period_end, semantics, sample_count in records:
            provenance = {"protocol": "ttn", "application_id": application_id,
                          "device_id": device_id, "event_id": event_id,
                          "statistic": dimensions.get("statistic", "instantaneous")}
            if sample_count is not None:
                provenance["sample_count"] = sample_count
            if window:
                provenance["window_seconds"] = window[0]
            await conn.execute("""SELECT write_measurement(
                %s,%s,%s,%s,'observed',%s::jsonb,%s,%s,%s,%s::jsonb,
                'valid',%s,%s,%s,%s)""",
                (entity_id, metric, unit, f"ttn:{application_id}",
                 json.dumps(dimensions), observed_at, Decimal(str(value)), collected_at,
                 json.dumps(provenance), period_start, period_end, semantics, backfill))
    if sound_events:
        for event in sound_events:
            dimensions = {"class": event["class"], "taxonomy": "esc50_v1"}
            provenance = {
                "protocol": "ttn",
                "application_id": application_id,
                "device_id": device_id,
                "event_id": event_id,
                "statistic": "interval_count",
            }
            if event.get("max_score") is not None:
                provenance["max_score"] = event["max_score"]
            if event.get("class_id") is not None:
                provenance["class_id"] = event["class_id"]
            if window:
                provenance["window_seconds"] = window[0]
            await conn.execute("""SELECT write_measurement(
                %s,%s,%s,%s,'observed',%s::jsonb,%s,%s,%s,%s::jsonb,
                'valid',%s,%s,%s,%s)""",
                (entity_id, "sound_event_count", "count", f"ttn:{application_id}",
                 json.dumps(dimensions), observed_at, Decimal(str(event["count"])), collected_at,
                 json.dumps(provenance), window_start, observed_at, "interval_statistic", backfill))


@router.post("/uplink", status_code=status.HTTP_200_OK,
             summary="Receive an authenticated The Things Stack sensor uplink")
async def receive_sensor_uplink(
    body: dict[str, Any],
    credentials: HTTPBasicCredentials | None = Security(basic_auth),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    _authenticate(credentials)
    ids = body.get("end_device_ids")
    if not isinstance(ids, dict) or not isinstance(ids.get("application_ids"), dict):
        raise HTTPException(422, "end_device_ids and application_ids are required")
    application_id = ids["application_ids"].get("application_id")
    device_id = ids.get("device_id")
    expected_application = os.getenv("TTN_APPLICATION_ID", "").strip()
    if not expected_application:
        raise HTTPException(503, "TTN application is not configured")
    if application_id != expected_application:
        raise HTTPException(403, "Uplink belongs to an unconfigured TTN application")
    if not isinstance(device_id, str) or not DEVICE_ID_PATTERN.fullmatch(device_id):
        raise HTTPException(422, "TTN device_id must be a lowercase slug of at most 60 characters")
    uplink = body.get("uplink_message")
    if not isinstance(uplink, dict):
        raise HTTPException(422, "uplink_message is required")
    decoded_measurements = _measurements(uplink.get("decoded_payload"))
    decoded_payload = uplink.get("decoded_payload")
    window = _window_statistics(decoded_payload)
    sound_events = _sound_events(decoded_payload)
    firmware_version = decoded_payload.get("firmware_version") if isinstance(decoded_payload, dict) else None
    if firmware_version is not None and (
        isinstance(firmware_version, bool)
        or not isinstance(firmware_version, int)
        or not FIRMWARE_VERSION_PATTERN.fullmatch(str(firmware_version))
    ):
        raise HTTPException(422, "decoded_payload.firmware_version must be an integer from 1 to 999")
    coordinates = _ttn_coordinates(uplink)
    observed_at = _event_time(uplink, body)
    event_id, payload_hash, correlations = _event_identity(
        application_id, device_id, uplink, observed_at, body.get("correlation_ids", [])
    )
    f_port = uplink.get("f_port")
    f_cnt = uplink.get("f_cnt")
    if (f_port is not None and (isinstance(f_port, bool) or not isinstance(f_port, int)
                                or not 0 <= f_port <= 255)):
        raise HTTPException(422, "f_port must be an integer from 0 to 255")
    if (f_cnt is not None and (isinstance(f_cnt, bool) or not isinstance(f_cnt, int)
                               or not 0 <= f_cnt <= 2**32 - 1)):
        raise HTTPException(422, "f_cnt must be an unsigned 32-bit integer")
    sensor_id = f"ttn-{device_id}"

    async with pool.connection() as conn, conn.transaction():
        inserted = await (await conn.execute("""INSERT INTO ttn_uplink_events
            (application_id,event_id,device_id,received_at,f_port,f_cnt,
             payload_sha256,correlation_ids)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
            ON CONFLICT (application_id,event_id) DO NOTHING RETURNING event_id""",
            (application_id, event_id, device_id, observed_at, f_port, f_cnt, payload_hash,
             json.dumps(correlations)))).fetchone()
        if inserted is None:
            previous = await (await conn.execute("""SELECT payload_sha256 FROM ttn_uplink_events
                WHERE application_id=%s AND event_id=%s""", (application_id, event_id))).fetchone()
            if previous["payload_sha256"] != payload_hash:
                raise HTTPException(
                    409, "TTN event identity was reused with different payload data"
                )
            return {"status": "duplicate", "event_id": event_id, "inserted_count": 0}

        # New devices remain hidden until an administrator verifies their identity and metadata.
        latitude, longitude = coordinates if coordinates is not None else (None, None)
        await conn.execute("""INSERT INTO sensor_metadata
            (id,friendly_name,is_hidden,description,firmware_version,latitude,longitude)
            VALUES (%s,%s,TRUE,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET firmware_version=COALESCE(EXCLUDED.firmware_version, sensor_metadata.firmware_version),
                latitude=COALESCE(EXCLUDED.latitude,sensor_metadata.latitude),
                longitude=COALESCE(EXCLUDED.longitude,sensor_metadata.longitude),
                updated_at=CASE WHEN EXCLUDED.firmware_version IS NOT NULL OR EXCLUDED.latitude IS NOT NULL
                    THEN NOW() ELSE sensor_metadata.updated_at END""",
            (sensor_id, device_id, f"The Things Stack device {device_id}",
             firmware_version, latitude, longitude))
        # Canonical readings are authoritative. Legacy writes below remain temporarily
        # for existing consumers until their read paths complete the cutover.
        await _write_canonical_readings(
            conn, sensor_id=sensor_id, device_id=device_id,
            application_id=application_id, event_id=event_id,
            observed_at=observed_at, collected_at=datetime.now(UTC),
            measurements=decoded_measurements, window=window,
            sound_events=sound_events)
        async with conn.cursor() as cur:
            await cur.executemany("""INSERT INTO sensor_data(timestamp,sensor_id,value,unit,metric)
                VALUES (%s,%s,%s,%s,%s)""",
                [(observed_at, sensor_id, item["value"], item["unit"], item["metric"])
                 for item in decoded_measurements])
    return {"status": "accepted", "event_id": event_id,
            "sensor_id": sensor_id, "inserted_count": len(decoded_measurements)}
