"""Versioned, bounded gateway measurements; units never come from the caller."""

from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# unit, lower bound, upper bound, hourly operation
METRICS = {
    "cpu_temperature": ("°C", -40, 150, "gauge"),
    "enclosure_temperature": ("°C", -40, 125, "gauge"),
    "enclosure_humidity": ("%", 0, 100, "gauge"),
    "cpu_usage": ("%", 0, 100, "gauge"),
    "memory_available": ("bytes", 0, 2**50, "gauge"),
    "disk_free": ("bytes", 0, 2**60, "gauge"),
    "uptime": ("s", 0, 2**40, "gauge"),
    "health_age": ("s", 0, 2**40, "gauge"),
    "last_rx_age": ("s", 0, 2**40, "gauge"),
    "radio_ready": ("boolean", 0, 1, "state"),
    "station_connected": ("boolean", 0, 1, "state"),
    "lns_connected": ("boolean", 0, 1, "state"),
    "undervoltage": ("boolean", 0, 1, "state"),
    "throttled": ("boolean", 0, 1, "state"),
    "throttled_history": ("bitmask", 0, 2**32, "gauge"),
    "spool_pending": ("count", 0, 1e9, "gauge"),
    "spool_unknown": ("count", 0, 1e9, "gauge"),
    "spool_rows": ("count", 0, 1e9, "gauge"),
    "spool_bytes": ("bytes", 0, 2**50, "gauge"),
    "telemetry_pending": ("count", 0, 1e9, "gauge"),
    "telemetry_dropped": ("count", 0, 1e12, "counter"),
    "journal_expired": ("count", 0, 1e9, "total"),
    "journal_overflow": ("count", 0, 1e9, "total"),
    "rx_packets": ("count", 0, 1e9, "total"),
    "rx_rssi": ("dBm", -200, 50, "distribution"),
    "rx_snr": ("dB", -50, 50, "distribution"),
    "state_known_seconds": ("s", 0, 60, "total"),
    "state_up_seconds": ("s", 0, 60, "total"),
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Reading(StrictModel):
    metric: str
    value: float | None
    statistic: Literal["value", "min", "max", "sum", "count"] = "value"
    dimensions: dict[str, str] = Field(default_factory=dict, max_length=2)

    @model_validator(mode="after")
    def validate_metric(self):
        if self.metric not in METRICS:
            raise ValueError("Unknown gateway metric")
        _, low, high, operation = METRICS[self.metric]
        allowed = (
            {"value"} if operation != "distribution" else {"min", "max", "sum", "count"}
        )
        if self.statistic not in allowed:
            raise ValueError("Invalid statistic")
        if self.dimensions:
            if self.metric == "rx_packets":
                if set(self.dimensions) - {"frequency_hz", "data_rate"}:
                    raise ValueError("Invalid radio dimensions")
                for key, value in self.dimensions.items():
                    if not value.isdecimal() or not (
                        0 <= int(value) <= (15 if key == "data_rate" else 1000000000)
                    ):
                        raise ValueError("Invalid radio dimension")
            elif self.metric in ("state_known_seconds", "state_up_seconds"):
                if set(self.dimensions) != {"state"} or self.dimensions[
                    "state"
                ] not in (
                    "radio_ready",
                    "station_connected",
                    "lns_connected",
                    "undervoltage",
                    "throttled",
                ):
                    raise ValueError("Invalid state dimension")
            else:
                raise ValueError("Dimensions not supported")
        elif self.metric in ("state_known_seconds", "state_up_seconds"):
            raise ValueError("State dimension required")
        if self.value is not None:
            if self.statistic == "count":
                if not 0 <= self.value <= 1e9 or not self.value.is_integer():
                    raise ValueError("Invalid count")
            elif self.statistic == "sum":
                if not low * 1e9 <= self.value <= high * 1e9:
                    raise ValueError("Invalid sum")
            elif not low <= self.value <= high:
                raise ValueError("Out of bounds")
        return self


class Event(StrictModel):
    event_id: UUID
    observed_at: datetime
    kind: Literal[
        "boot",
        "radio_ready",
        "station_connected",
        "lns_connected",
        "undervoltage",
        "throttled",
        "data_gap",
        "sensor_error",
    ]
    details: dict[str, str | bool | int | None] = Field(
        default_factory=dict, max_length=5
    )

    @field_validator("details")
    @classmethod
    def bounded_details(cls, value):
        if any(
            len(k) > 40 or isinstance(v, str) and len(v) > 160 for k, v in value.items()
        ):
            raise ValueError("Event details too large")
        return value


class Sample(StrictModel):
    sample_id: UUID
    boot_id: UUID
    sequence: int = Field(ge=0, le=2**63 - 1)
    observed_at: datetime
    readings: list[Reading] = Field(min_length=1, max_length=150)
    events: list[Event] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_sample(self):
        now = datetime.now(UTC)
        for stamp in [self.observed_at, *(e.observed_at for e in self.events)]:
            if stamp.tzinfo is None or not now - timedelta(
                days=35
            ) <= stamp <= now + timedelta(minutes=2):
                raise ValueError("Timestamp outside supported upload window")
        if self.observed_at.second or self.observed_at.microsecond:
            raise ValueError("Minute-aligned timestamps required")
        keys = [
            (r.metric, r.statistic, tuple(sorted(r.dimensions.items())))
            for r in self.readings
        ]
        if len(set(keys)) != len(keys):
            raise ValueError("Duplicate metric")
        return self


class Batch(StrictModel):
    version: Literal[1]
    samples: list[Sample] = Field(min_length=1, max_length=30)
