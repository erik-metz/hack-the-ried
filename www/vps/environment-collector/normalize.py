import bz2
import io
import json
import math
import re
import struct
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo


@dataclass
class NormalizedGauge:
    id: str
    name: str
    water_body: str
    level_m: float
    status: str
    source_station_id: str
    measured_at: datetime
    latitude: float | None = None
    longitude: float | None = None


@dataclass
class NormalizedWeather:
    sensor_id: str
    temperature: float | None
    humidity: float | None
    precipitation: float | None
    timestamp: datetime
    latitude: float | None = None
    longitude: float | None = None


@dataclass
class NormalizedRadar:
    sensor_id: str
    precipitation_mm: float
    timestamp: datetime
    latitude: float
    longitude: float


@dataclass
class NormalizedForecast:
    station_id: str
    timestamp: datetime
    temperature_c: float | None = None
    dew_point_c: float | None = None
    wind_speed_ms: float | None = None
    precipitation_prob: float | None = None
    precipitation_mm: float | None = None


@dataclass
class NormalizedLightning:
    zone_id: str
    timestamp: datetime
    strikes_count: int
    distance_min_km: float | None
    peak_current_max_ka: float | None
    center_lat: float
    center_lon: float
    radius_km: float
    raw_strikes: list[dict[str, Any]]
    source: str = "blitzortung"
    period_seconds: int = 900


class NormalizedEnvironment(tuple):
    """Backwards-compatible tuple that unpacks as (gauges, weather_list)
    while also exposing .radar, .forecasts, and .lightning."""

    def __new__(cls, gauges, weather_list, radar=None, forecasts=None, lightning=None):
        return super().__new__(cls, (gauges, weather_list))

    def __init__(self, gauges, weather_list, radar=None, forecasts=None, lightning=None):
        self.gauges = gauges
        self.weather_list = weather_list
        self.radar: list[NormalizedRadar] = radar or []
        self.forecasts: list[NormalizedForecast] = forecasts or []
        self.lightning: NormalizedLightning | None = lightning


def parse_radolan_rw(raw_bytes: bytes, target_lat: float, target_lon: float) -> NormalizedRadar | None:
    """Parse DWD RADOLAN RW binary composite (optionally bz2-compressed)."""
    if not raw_bytes:
        return None
    if raw_bytes.startswith(b"\x89HDF\r\n\x1a\n"):
        return parse_radolan_hdf5(raw_bytes, target_lat, target_lon)
    if raw_bytes[:3] == b"BZh":
        try:
            data = bz2.decompress(raw_bytes)
        except (EOFError, OSError, ValueError):
            return None
    else:
        data = raw_bytes

    etx_idx = data.find(b"\x03")
    if etx_idx == -1:
        return None

    header_str = data[:etx_idx].decode("latin1", errors="ignore")
    if not header_str.startswith("RW") or not re.search(r"GP\s+900x\s*900(?:\s|[A-Z]|$)", header_str):
        return None
    precision = re.search(r"PR\s+E([+-]\d+)", header_str)
    if precision is None:
        return None
    try:
        day = int(header_str[2:4])
        hour = int(header_str[4:6])
        minute = int(header_str[6:8])
        month = int(header_str[13:15])
        year = 2000 + int(header_str[15:17])
        dt = datetime(year, month, day, hour, minute, tzinfo=UTC)
    except (ValueError, IndexError):
        return None

    # DWD polar stereographic projection (standard 900x900 national grid)
    phi_0 = math.radians(60.0)
    lambda_0 = math.radians(10.0)
    phi = math.radians(target_lat)
    lam = math.radians(target_lon)
    m = (1.0 + math.sin(phi_0)) / (1.0 + math.sin(phi))
    x = 6370.04 * m * math.cos(phi) * math.sin(lam - lambda_0)
    y = -6370.04 * m * math.cos(phi) * math.cos(lam - lambda_0)

    # South-West origin offsets for national 900x900 grid
    col = round(x - (-523.4622))
    row = round(y - (-4658.6447))

    if not (0 <= col < 900 and 0 <= row < 900):
        return None

    # Binary values are 16-bit unsigned ints (little endian), row 0 is at south
    binary_start = etx_idx + 1
    offset = binary_start + (row * 900 + col) * 2
    if offset + 2 > len(data):
        return None

    raw_val = struct.unpack("<H", data[offset : offset + 2])[0]
    # Bits 13–16 are flags, not precipitation. Missing/clutter/negative
    # pixels must not become a fabricated dry observation.
    if raw_val & 0xE000:
        return None
    precip_mm = round((raw_val & 0x0FFF) * 10 ** int(precision.group(1)), 3)

    return NormalizedRadar(
        sensor_id="weather-radolan-ried",
        precipitation_mm=precip_mm,
        timestamp=dt,
        latitude=target_lat,
        longitude=target_lon,
    )


def parse_radolan_hdf5(raw_bytes: bytes, target_lat: float, target_lon: float) -> NormalizedRadar | None:
    """Read the current DWD ODIM_H5 RW composite at the Ried coordinate."""
    try:
        import h5py
        import numpy as np
        from pyproj import CRS, Transformer

        with h5py.File(io.BytesIO(raw_bytes), "r") as radar:
            if radar.attrs.get("Conventions") != "ODIM_H5/V2_3":
                return None
            data = radar["dataset1/data1/data"]
            metadata = radar["dataset1/data1/what"].attrs
            composite = radar["dataset1/what"].attrs
            where = radar["where"].attrs
            if metadata.get("quantity") != "ACRR":
                return None
            values = np.asarray(data)
            rows, columns = values.shape
            if rows != int(where["ysize"]) or columns != int(where["xsize"]):
                return None
            projection = CRS.from_user_input(where["projdef"].decode() if isinstance(where["projdef"], bytes) else where["projdef"])
            transformer = Transformer.from_crs("EPSG:4326", projection, always_xy=True)
            x, y = transformer.transform(target_lon, target_lat)
            ul_x, ul_y = transformer.transform(float(where["UL_lon"]), float(where["UL_lat"]))
            col = int(round((x - ul_x) / float(where["xscale"])))
            row = int(round((ul_y - y) / float(where["yscale"])))
            if not (0 <= col < columns and 0 <= row < rows):
                return None
            raw = int(values[row, col])
            nodata = int(metadata["nodata"])
            undetect = int(metadata["undetect"])
            if raw == nodata:
                return None
            amount = 0.0 if raw == undetect else raw * float(metadata["gain"]) + float(metadata["offset"])
            if not math.isfinite(amount) or amount < 0:
                return None
            date = composite["enddate"]
            time = composite["endtime"]
            if isinstance(date, bytes):
                date = date.decode()
            if isinstance(time, bytes):
                time = time.decode()
            timestamp = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S").replace(tzinfo=UTC)
            return NormalizedRadar("weather-radolan-ried", round(amount, 3), timestamp, target_lat, target_lon)
    except (ImportError, OSError, KeyError, TypeError, ValueError, OverflowError):
        return None


def parse_mosmix(raw_bytes: bytes, station_id: str = "10729") -> list[NormalizedForecast]:
    """Parse DWD MOSMIX point forecasts from KMZ/KML."""
    if not raw_bytes:
        return []
    if raw_bytes[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(raw_bytes)) as z:
                names = [n for n in z.namelist() if n.endswith(".kml")]
                if not names:
                    return []
                kml_bytes = z.read(names[0])
        except (zipfile.BadZipFile, OSError, ValueError):
            return []
    else:
        kml_bytes = raw_bytes

    try:
        root = ET.fromstring(kml_bytes)
    except (ET.ParseError, ValueError):
        return []

    timesteps_raw = [elem.text.strip() for elem in root.findall(".//{*}TimeStep") if elem.text]
    if not timesteps_raw:
        return []

    elements: dict[str, list[str]] = {}
    for fc in root.findall(".//{*}Forecast"):
        name = fc.get("{https://opendata.dwd.de/weather/lib/pointforecast_dwd_extension_V1_0.xsd}elementName") or fc.get("elementName")
        val_node = fc.find("{*}value")
        if name and val_node is not None and val_node.text:
            elements[name] = val_node.text.strip().split()

    forecasts: list[NormalizedForecast] = []
    # Capture up to 24 hourly steps
    count = min(len(timesteps_raw), 24)
    for i in range(count):
        ts_str = timesteps_raw[i]
        try:
            ts = datetime.fromisoformat(ts_str)
        except (ValueError, IndexError):
            continue

        temp_c = None
        if "TTT" in elements and i < len(elements["TTT"]):
            val_str = elements["TTT"][i]
            if val_str not in ("-", "nil"):
                try:
                    temp_c = round(float(val_str) - 273.15, 1)
                except ValueError:
                    pass

        dew_c = None
        if "Td" in elements and i < len(elements["Td"]):
            val_str = elements["Td"][i]
            if val_str not in ("-", "nil"):
                try:
                    dew_c = round(float(val_str) - 273.15, 1)
                except ValueError:
                    pass

        wind_ms = None
        if "FF" in elements and i < len(elements["FF"]):
            val_str = elements["FF"][i]
            if val_str not in ("-", "nil"):
                try:
                    wind_ms = round(float(val_str), 1)
                except ValueError:
                    pass

        prob = None
        if "R101" in elements and i < len(elements["R101"]):
            val_str = elements["R101"][i]
            if val_str not in ("-", "nil"):
                try:
                    prob = round(float(val_str), 1)
                except ValueError:
                    pass

        precip_mm = None
        if "RR1c" in elements and i < len(elements["RR1c"]):
            val_str = elements["RR1c"][i]
            if val_str not in ("-", "nil"):
                try:
                    precip_mm = max(0.0, round(float(val_str), 1))
                except ValueError:
                    pass

        forecasts.append(
            NormalizedForecast(
                station_id=f"dwd-mosmix-{station_id}",
                timestamp=ts,
                temperature_c=temp_c,
                dew_point_c=dew_c,
                wind_speed_ms=wind_ms,
                precipitation_prob=prob,
                precipitation_mm=precip_mm,
            )
        )
    return forecasts


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def parse_blitzortung(
    raw_data: Any,
    center_lat: float = 49.6425,
    center_lon: float = 8.4552,
    radius_km: float = 25.0,
    now: datetime | None = None,
    max_age_seconds: float | None = None,
) -> NormalizedLightning:
    now_utc = now or datetime.now(UTC)
    zone_id = f"lightning-zone-ried-{int(radius_km)}km"
    if not raw_data:
        return NormalizedLightning(
            zone_id=zone_id,
            timestamp=now_utc,
            strikes_count=0,
            distance_min_km=None,
            peak_current_max_ka=None,
            center_lat=center_lat,
            center_lon=center_lon,
            radius_km=radius_km,
            raw_strikes=[],
        )

    parsed_items: list[dict[str, Any]] = []
    if isinstance(raw_data, (bytes, bytearray)):
        raw_text = raw_data.decode("utf-8", errors="ignore").strip()
    elif isinstance(raw_data, str):
        raw_text = raw_data.strip()
    elif isinstance(raw_data, list):
        parsed_items = [item for item in raw_data if isinstance(item, dict)]
        raw_text = ""
    elif isinstance(raw_data, dict):
        raw_items = raw_data.get("strokes") or raw_data.get("strikes") or [raw_data]
        parsed_items = [item for item in raw_items if isinstance(item, dict)]
        raw_text = ""
    else:
        raw_text = ""

    if raw_text:
        try:
            loaded = json.loads(raw_text)
            if isinstance(loaded, list):
                parsed_items = [item for item in loaded if isinstance(item, dict)]
            elif isinstance(loaded, dict):
                raw_items = loaded.get("strokes") or loaded.get("strikes") or [loaded]
                parsed_items = [item for item in raw_items if isinstance(item, dict)]
        except json.JSONDecodeError:
            for line in raw_text.splitlines():
                line = line.strip()
                if not line or not line.startswith("{"):
                    continue
                try:
                    item = json.loads(line)
                    if isinstance(item, dict):
                        parsed_items.append(item)
                except json.JSONDecodeError:
                    continue

    matching: list[dict[str, Any]] = []
    distances: list[float] = []
    currents: list[float] = []
    strike_times: list[datetime] = []

    for item in parsed_items:
        try:
            lat = float(item["lat"])
            lon = float(item["lon"])
        except (KeyError, ValueError, TypeError):
            continue

        d = haversine_distance_km(lat, lon, center_lat, center_lon)
        if d > radius_km:
            continue

        strike_dt = now_utc
        t_val = item.get("time")
        if t_val is not None:
            try:
                if isinstance(t_val, (int, float)):
                    if t_val > 1e15:
                        sec = t_val / 1e9
                    elif t_val > 1e11:
                        sec = t_val / 1e3
                    else:
                        sec = float(t_val)
                    strike_dt = datetime.fromtimestamp(sec, UTC)
                else:
                    strike_dt = datetime.fromisoformat(str(t_val))
                if max_age_seconds is not None:
                    age = (now_utc - strike_dt).total_seconds()
                    if age > max_age_seconds or age < -60.0:
                        continue
            except (ValueError, OSError, OverflowError):
                pass

        matching.append(item)
        strike_times.append(strike_dt)
        distances.append(d)
        curr_val = (
            item.get("current")
            or item.get("peak_current")
            or item.get("mcg")
            or item.get("scs")
        )
        if curr_val is not None:
            try:
                currents.append(abs(float(curr_val)))
            except (ValueError, TypeError):
                pass

    latest_time = max(strike_times, default=now_utc)
    return NormalizedLightning(
        zone_id=zone_id,
        timestamp=latest_time,
        strikes_count=len(matching),
        distance_min_km=round(min(distances), 2) if distances else None,
        peak_current_max_ka=round(max(currents), 1) if currents else None,
        center_lat=center_lat,
        center_lon=center_lon,
        radius_km=radius_km,
        raw_strikes=matching,
    )


def normalize(payload: dict[str, Any], settings) -> NormalizedEnvironment:
    gauges: list[NormalizedGauge] = []
    weather_list: list[NormalizedWeather] = []
    radar_list: list[NormalizedRadar] = []
    forecast_list: list[NormalizedForecast] = []

    # 1. Parse Pegelonline
    pegel = payload.get("pegel")
    if pegel and isinstance(pegel, dict):
        series = next(
            (t for t in pegel.get("timeseries", []) if t.get("shortname") == "W"), pegel
        )
        curr = series.get("currentMeasurement")
        if curr and "value" in curr:
            cm_val = float(curr["value"])
            m_val = round(cm_val / 100.0, 2)
            status = "unknown"

            gauges.append(
                NormalizedGauge(
                    id="pegel-rhein-worms",
                    name=pegel.get("longname", "WORMS"),
                    water_body=pegel.get("water", {}).get("longname", ""),
                    level_m=m_val,
                    status=status,
                    source_station_id=pegel.get("number", "WORMS"),
                    measured_at=datetime.fromisoformat(curr["timestamp"]),
                    latitude=pegel.get("latitude"),
                    longitude=pegel.get("longitude"),
                )
            )

    # 2. Parse Weather
    weather = payload.get("weather")
    if weather and isinstance(weather, dict):
        current = weather.get("current")
        if current:
            weather_list.append(
                NormalizedWeather(
                    sensor_id="weather-dwd-ried",
                    latitude=weather.get("latitude"),
                    longitude=weather.get("longitude"),
                    temperature=current.get("temperature_2m"),
                    humidity=current.get("relative_humidity_2m"),
                    precipitation=current.get("precipitation"),
                    timestamp=datetime.fromisoformat(current["time"]).replace(
                        tzinfo=ZoneInfo(weather.get("timezone", "UTC"))
                    ),
                )
            )

    # 3. Parse DWD RADOLAN
    radolan_raw = payload.get("radolan")
    if radolan_raw and isinstance(radolan_raw, (bytes, bytearray)):
        target_lat = getattr(settings, "ried_lat", 49.6425)
        target_lon = getattr(settings, "ried_lon", 8.4552)
        radar_point = parse_radolan_rw(bytes(radolan_raw), target_lat, target_lon)
        if radar_point:
            radar_list.append(radar_point)

    # 4. Parse DWD MOSMIX
    mosmix_raw = payload.get("mosmix")
    if mosmix_raw and isinstance(mosmix_raw, (bytes, bytearray)):
        forecast_list = parse_mosmix(bytes(mosmix_raw), station_id="10729")

    # 5. Parse Blitzortung
    blitz_raw = payload.get("blitzortung")
    target_lat = getattr(settings, "ried_lat", 49.6425)
    target_lon = getattr(settings, "ried_lon", 8.4552)
    radius_km = getattr(settings, "blitzortung_radius_km", 25.0)
    lightning_item = (parse_blitzortung(blitz_raw, target_lat, target_lon, radius_km)
                      if "blitzortung" in payload else None)

    if 'xweather' in payload:
        from xweather import normalize_lightning
        lightning_item = normalize_lightning(payload['xweather'], payload['xweather_window_end'],
                                            target_lat, target_lon, radius_km)

    return NormalizedEnvironment(
        gauges, weather_list, radar_list, forecast_list, lightning_item
    )

