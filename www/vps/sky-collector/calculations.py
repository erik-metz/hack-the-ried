"""Astronomical calculations for a fixed reference point in the Hessian Ried."""

from datetime import UTC, datetime

import astronomy as astro

# Regional reference near the geographic center of the Ried, not a live map center.
LATITUDE = 49.62
LONGITUDE = 8.46
ENTITY_ID = "region:hessisches-ried"
SOURCE_ID = "astronomy-engine:hessisches-ried-v1"


def phase_name(angle: float) -> str:
    angle = angle % 360
    if angle < 22.5 or angle >= 337.5:
        return "Neumond"
    if angle < 67.5:
        return "Zunehmende Sichel"
    if angle < 112.5:
        return "Erstes Viertel"
    if angle < 157.5:
        return "Zunehmender Mond"
    if angle < 202.5:
        return "Vollmond"
    if angle < 247.5:
        return "Abnehmender Mond"
    if angle < 292.5:
        return "Letztes Viertel"
    return "Abnehmende Sichel"


def calculate(at: datetime | None = None) -> dict:
    at = at or datetime.now(UTC)
    if at.tzinfo is None:
        raise ValueError("Calculation timestamp must include a timezone")
    utc = at.astimezone(UTC)
    moment = astro.Time.Make(
        utc.year, utc.month, utc.day, utc.hour, utc.minute,
        utc.second + utc.microsecond / 1_000_000,
    )
    observer = astro.Observer(LATITUDE, LONGITUDE, 100)
    sun_equator = astro.Equator(astro.Body.Sun, moment, observer, True, True)
    moon_equator = astro.Equator(astro.Body.Moon, moment, observer, True, True)
    sun = astro.Horizon(moment, observer, sun_equator.ra, sun_equator.dec, astro.Refraction.Normal)
    moon = astro.Horizon(moment, observer, moon_equator.ra, moon_equator.dec, astro.Refraction.Normal)
    phase = astro.MoonPhase(moment)
    illumination = astro.Illumination(astro.Body.Moon, moment).phase_fraction
    return {
        "observed_at": at.astimezone(UTC),
        "readings": {
            "sun_azimuth": (sun.azimuth, "deg"),
            "sun_altitude": (sun.altitude, "deg"),
            "moon_azimuth": (moon.azimuth, "deg"),
            "moon_altitude": (moon.altitude, "deg"),
            "moon_illumination": (illumination * 100, "%"),
            "moon_phase_angle": (phase, "deg"),
        },
        "phase_name": phase_name(phase),
    }
