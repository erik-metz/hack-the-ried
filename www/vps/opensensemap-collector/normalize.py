"""Normalization and filtering for openSenseMap / senseBox sensor data."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from config import Settings


@dataclass(frozen=True)
class OpenSenseMeasurement:
    metric: str
    value: float
    unit: str
    observed_at: datetime
    sensor_id: str
    sensor_title: str
    sensor_type: str | None


@dataclass(frozen=True)
class OpenSenseBoxObservation:
    box_id: str
    sensor_id: str
    name: str
    friendly_name: str
    model: str
    exposure: str
    latitude: float
    longitude: float
    updated_at: datetime
    measurements: list[OpenSenseMeasurement]
    description: str


def parse_timestamp(value: Any) -> datetime:
    if not value or not isinstance(value, str):
        return datetime.now(UTC)
    try:
        cleaned = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except (ValueError, TypeError):
        return datetime.now(UTC)


def map_phenomenon(title: str, unit: str, raw_val: float) -> tuple[str, float, str] | None:
    t = title.strip().lower()
    t_clean = t.lstrip("#").strip()

    # Temperature
    if t_clean in ("wassertemperatur", "water temperature", "water_temp"):
        if -10.0 <= raw_val <= 50.0:
            return "water_temperature", round(raw_val, 2), "°C"
        return None
    if t_clean in ("bodentemperatur", "soil temperature", "soil_temp"):
        if -30.0 <= raw_val <= 60.0:
            return "soil_temperature", round(raw_val, 2), "°C"
        return None
    if any(k in t_clean for k in ("temperatur", "temperature")) or t_clean == "temp":
        if -50.0 <= raw_val <= 60.0:
            return "temperature", round(raw_val, 2), "°C"
        return None

    # Humidity
    if any(k in t_clean for k in ("luftfeuchte", "feuchte", "humidity", "feuchtigkeit")):
        if 0.0 <= raw_val <= 100.0:
            return "relative_humidity", round(raw_val, 1), "%"
        return None

    # Pressure
    if any(k in t_clean for k in ("luftdruck", "pressure", "druck", "presure")):
        val = raw_val
        # openSenseMap sensors often report in Pa (e.g. 101325) instead of hPa (1013.25)
        if val > 2000.0:
            val = val / 100.0
        if 600.0 <= val <= 1200.0:
            return "pressure", round(val, 2), "hPa"
        return None

    # Particulate Matter (PM)
    if t_clean in ("pm10", "finedust pm10") or "pm10" in t_clean:
        if 0.0 <= raw_val <= 1000.0:
            return "PM10", round(raw_val, 2), "µg/m³"
        return None
    if t_clean in ("pm2.5", "pm2,5", "pm25", "finedust pm2.5") or "pm2.5" in t_clean or "pm2,5" in t_clean:
        if 0.0 <= raw_val <= 1000.0:
            return "PM25", round(raw_val, 2), "µg/m³"
        return None
    if t_clean in ("pm1", "finedust pm1"):
        if 0.0 <= raw_val <= 1000.0:
            return "PM1", round(raw_val, 2), "µg/m³"
        return None
    if t_clean in ("pm4", "finedust pm4"):
        if 0.0 <= raw_val <= 1000.0:
            return "PM4", round(raw_val, 2), "µg/m³"
        return None

    # Illuminance / Light
    if any(k in t_clean for k in ("beleuchtungsstärke", "beleuchtungstärke", "helligkeit", "sichtbares licht")) or t_clean in ("light", "lx"):
        if raw_val >= 0.0:
            return "illuminance", round(raw_val, 1), "lx"
        return None

    # UV Intensity / UV Index
    if "uv" in t_clean:
        if any(u in unit.lower() for u in ("uw", "μw", "mw")):
            if raw_val >= 0.0:
                return "uv_intensity", round(raw_val, 2), "μW/cm²"
        else:
            if 0.0 <= raw_val <= 25.0:
                return "uv_index", round(raw_val, 1), "index"
        return None

    # Sound / Noise
    if any(k in t_clean for k in ("lautstärke", "lauststärke", "noise")):
        if 0.0 <= raw_val <= 150.0:
            return "noise", round(raw_val, 1), "dB(A)"
        return None

    # CO2
    if t_clean in ("co2", "co₂", "co2 equivalent"):
        if 0.0 <= raw_val <= 10000.0:
            return "co2", round(raw_val, 1), "ppm"
        return None

    # Precipitation / Rain
    if any(k in t_clean for k in ("niederschlag", "regen", "rain", "precipitation")):
        if raw_val >= 0.0:
            return "precipitation", round(raw_val, 2), "mm"
        return None

    return None


def normalize(
    boxes_json: list[dict] | dict, settings: Settings, max_age_days: int = 30
) -> tuple[list[OpenSenseBoxObservation], int]:
    boxes = boxes_json if isinstance(boxes_json, list) else boxes_json.get("boxes", [])
    accepted: list[OpenSenseBoxObservation] = []
    skipped = 0
    now = datetime.now(UTC)

    for box in boxes:
        if not isinstance(box, dict):
            skipped += 1
            continue

        box_id = str(box.get("_id") or "").strip()
        if not box_id:
            skipped += 1
            continue

        # Extract coordinates
        loc = box.get("currentLocation") or {}
        coords = loc.get("coordinates")
        if not coords or len(coords) < 2:
            skipped += 1
            continue

        try:
            lon = float(coords[0])
            lat = float(coords[1])
        except (ValueError, TypeError):
            skipped += 1
            continue

        # Geographic bounds check
        if not (settings.min_lat <= lat <= settings.max_lat and settings.min_lon <= lon <= settings.max_lon):
            skipped += 1
            continue

        name = str(box.get("name") or box_id).strip()
        model = str(box.get("model") or "custom").strip()
        exposure = str(box.get("exposure") or "outdoor").strip().lower()
        friendly_name = f"senseBox: {name}"
        updated_at = parse_timestamp(box.get("updatedAt"))

        measurements: list[OpenSenseMeasurement] = []
        raw_sensors = box.get("sensors") or []

        for s in raw_sensors:
            if not isinstance(s, dict):
                continue
            sub_id = str(s.get("_id") or "").strip()
            if not sub_id:
                continue
            title = str(s.get("title") or "").strip()
            unit = str(s.get("unit") or "").strip()
            sensor_type = s.get("sensorType")
            if sensor_type and isinstance(sensor_type, str):
                sensor_type = sensor_type.strip()
            else:
                sensor_type = None

            lm = s.get("lastMeasurement")
            if not lm or not isinstance(lm, dict):
                continue

            raw_val_str = lm.get("value")
            if raw_val_str is None:
                continue

            try:
                raw_val = float(str(raw_val_str).replace(",", "."))
            except (ValueError, TypeError):
                continue

            mapped = map_phenomenon(title, unit, raw_val)
            if not mapped:
                continue

            metric, val, mapped_unit = mapped
            obs_time = parse_timestamp(lm.get("createdAt"))

            # Filter out stale measurements older than max_age_days or in future (> 2h)
            age_seconds = (now - obs_time).total_seconds()
            if age_seconds > max_age_days * 86400 or age_seconds < -7200:
                continue

            measurements.append(
                OpenSenseMeasurement(
                    metric=metric,
                    value=val,
                    unit=mapped_unit,
                    observed_at=obs_time,
                    sensor_id=sub_id,
                    sensor_title=title,
                    sensor_type=sensor_type,
                )
            )

        sensor_id = f"osem-{box_id}"
        desc = (
            f"openSenseMap / senseBox Station '{name}' (Modell: {model}, {exposure}) "
            f"· Quelle: openSenseMap / senseBox (https://opensensemap.org/explore/{box_id})"
        )

        observation = OpenSenseBoxObservation(
            box_id=box_id,
            sensor_id=sensor_id,
            name=name,
            friendly_name=friendly_name,
            model=model,
            exposure=exposure,
            latitude=lat,
            longitude=lon,
            updated_at=updated_at,
            measurements=measurements,
            description=desc,
        )
        accepted.append(observation)

    return accepted, skipped
