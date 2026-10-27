"""Configuration for the Environment Collector."""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    db: dict[str, str | int]
    poll_seconds: int = 300
    cycle_timeout_seconds: float = 180.0
    state_dir: Path = Path("/data")
    pegelonline_url: str = "https://pegelonline.wsv.de/webservices/rest-api/v2/stations/WORMS.json?includeTimeseries=true&includeCurrentMeasurement=true"
    weather_url: str = "https://api.open-meteo.com/v1/dwd-icon?latitude=49.6425&longitude=8.4552&current=temperature_2m,relative_humidity_2m,precipitation&timezone=UTC"
    radolan_url: str = "https://opendata.dwd.de/weather/radar/radolan/rw/raa01-rw_10000-latest-dwd---bin.hdf5"
    mosmix_url: str = "https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/10729/kml/MOSMIX_L_LATEST_10729.kmz"
    blitzortung_url: str = "https://data.blitzortung.org/Data/Protected/last_strikes.php"
    enable_xweather: bool = False
    xweather_client_id: str = field(default="", repr=False)
    xweather_client_secret: str = field(default="", repr=False)
    enable_radolan: bool = True
    enable_mosmix: bool = True
    enable_blitzortung: bool = True
    blitzortung_radius_km: float = 25.0
    ried_lat: float = 49.6425
    ried_lon: float = 8.4552
    enable_soil: bool = False
    soil_poll_seconds: int = 3600
    soil_url: str = "https://single-runs-api.open-meteo.com/v1/forecast"
    enable_pollen: bool = False
    pollen_poll_seconds: int = 10800
    enable_gbif: bool = False
    gbif_poll_seconds: int = 86400
    enable_discharge: bool = False
    discharge_poll_seconds: int = 86400
    enable_entsoe: bool = False
    entsoe_poll_seconds: int = 3600
    entsoe_token: str = field(default="", repr=False)
    request_timeout: float = 30.0

    @classmethod
    def from_env(cls) -> "Settings":
        db = {
            "host": os.getenv("DB_HOST", "timescaledb"),
            "port": int(os.getenv("DB_PORT", "5432")),
            "dbname": os.getenv("DB_NAME", "mydatabase"),
            "user": os.getenv("DB_USER", "postgres"),
            "password": os.getenv("DB_PASSWORD", ""),
            "connect_timeout": 10,
        }
        poll_seconds = int(os.getenv("ENVIRONMENT_POLL_SECONDS", "300"))
        cycle_timeout_seconds = float(os.getenv("ENVIRONMENT_CYCLE_TIMEOUT_SECONDS", "180"))
        if not 0 < cycle_timeout_seconds <= 3600:
            raise ValueError("ENVIRONMENT_CYCLE_TIMEOUT_SECONDS must be positive and at most 3600")
        state_dir = Path(os.getenv("ENVIRONMENT_STATE_DIR", "/data"))
        enable_radolan = os.getenv("ENABLE_DWD_RADOLAN", "true").lower() in ("1", "true", "yes")
        enable_mosmix = os.getenv("ENABLE_DWD_MOSMIX", "true").lower() in ("1", "true", "yes")
        enable_blitzortung = os.getenv("ENABLE_BLITZORTUNG", "true").lower() in ("1", "true", "yes")
        soil_poll_seconds = int(os.getenv("SOIL_POLL_SECONDS", "3600"))
        if soil_poll_seconds < 3600:
            raise ValueError("SOIL_POLL_SECONDS must be at least 3600")
        pollen_poll_seconds = int(os.getenv("POLLEN_POLL_SECONDS", "10800"))
        if pollen_poll_seconds < 10800:
            raise ValueError("POLLEN_POLL_SECONDS must be at least 10800")
        gbif_poll_seconds = int(os.getenv("GBIF_POLL_SECONDS", "86400"))
        if gbif_poll_seconds < 86400:
            raise ValueError("GBIF_POLL_SECONDS must be at least 86400")
        discharge_poll_seconds = int(os.getenv("DISCHARGE_POLL_SECONDS", "86400"))
        if discharge_poll_seconds < 86400:
            raise ValueError("DISCHARGE_POLL_SECONDS must be at least 86400")
        entsoe_poll_seconds = int(os.getenv("ENTSOE_POLL_SECONDS", "3600"))
        if entsoe_poll_seconds < 3600:
            raise ValueError("ENTSOE_POLL_SECONDS must be at least 3600")
        if poll_seconds <= 0:
            raise ValueError("ENVIRONMENT_POLL_SECONDS must be positive")
        return cls(
            db=db,
            enable_xweather=os.getenv("ENABLE_XWEATHER", "false").lower() in ("1", "true", "yes"),
            xweather_client_id=os.getenv("XWEATHER_CLIENT_ID", "").strip(),
            xweather_client_secret=os.getenv("XWEATHER_CLIENT_SECRET", "").strip(),
            enable_entsoe=os.getenv("ENABLE_ENTSOE", "false").lower() in ("1", "true", "yes"),
            entsoe_poll_seconds=entsoe_poll_seconds,
            entsoe_token=os.getenv("ENTSOE_API_TOKEN", "").strip(),
            enable_discharge=os.getenv("ENABLE_DISCHARGE_FORECAST", "false").lower() in ("1", "true", "yes"),
            discharge_poll_seconds=discharge_poll_seconds,
            enable_gbif=os.getenv("ENABLE_GBIF", "false").lower() in ("1", "true", "yes"),
            gbif_poll_seconds=gbif_poll_seconds,
            enable_pollen=os.getenv("ENABLE_POLLEN_FORECAST", "false").lower() in ("1", "true", "yes"),
            pollen_poll_seconds=pollen_poll_seconds,
            enable_soil=os.getenv("ENABLE_SOIL_FORECAST", "false").lower() in ("1", "true", "yes"),
            soil_poll_seconds=soil_poll_seconds,
            poll_seconds=poll_seconds,
            cycle_timeout_seconds=cycle_timeout_seconds,
            state_dir=state_dir,
            pegelonline_url=os.getenv(
                "PEGELONLINE_URL",
                "https://pegelonline.wsv.de/webservices/rest-api/v2/stations/WORMS.json?includeTimeseries=true&includeCurrentMeasurement=true",
            ),
            weather_url=os.getenv(
                "WEATHER_URL",
                "https://api.open-meteo.com/v1/dwd-icon?latitude=49.6425&longitude=8.4552&current=temperature_2m,relative_humidity_2m,precipitation&timezone=UTC",
            ),
            radolan_url=os.getenv(
                "DWD_RADOLAN_URL",
                "https://opendata.dwd.de/weather/radar/radolan/rw/raa01-rw_10000-latest-dwd---bin.bz2",
            ),
            mosmix_url=os.getenv(
                "DWD_MOSMIX_URL",
                "https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/10729/kml/MOSMIX_L_LATEST_10729.kmz",
            ),
            blitzortung_url=os.getenv(
                "BLITZORTUNG_URL",
                "https://data.blitzortung.org/Data/Protected/last_strikes.php",
            ),
            enable_radolan=enable_radolan,
            enable_mosmix=enable_mosmix,
            enable_blitzortung=enable_blitzortung,
            blitzortung_radius_km=float(os.getenv("BLITZORTUNG_RADIUS_KM", "25.0")),
            ried_lat=float(os.getenv("RIED_LATITUDE", "49.6425")),
            ried_lon=float(os.getenv("RIED_LONGITUDE", "8.4552")),
        )
