"""Bounded exact completed-minute radio summaries; never retains payloads."""

import math


class RadioStats:
    def __init__(self):
        self.minutes = {}

    def add(self, message, now):
        minute = int(now // 60)
        self.minutes = {k: v for k, v in self.minutes.items() if int(k) >= minute - 120}
        bucket = self.minutes.setdefault(str(minute), {"rx_packets": {}})
        frequency, rate = message.get("Freq"), message.get("DR")
        if (
            isinstance(frequency, int)
            and isinstance(rate, int)
            and 0 <= frequency <= 1000000000
            and 0 <= rate <= 15
        ):
            key = f"{frequency}:{rate}"
            bucket["rx_packets"][key] = bucket["rx_packets"].get(key, 0) + 1
        for field, metric in [("rssi", "rx_rssi"), ("snr", "rx_snr")]:
            value = message.get("upinfo", {}).get(field)
            if isinstance(value, (float, int)) and math.isfinite(value):
                stats = bucket.setdefault(
                    metric, {"count": 0, "sum": 0, "min": value, "max": value}
                )
                stats["count"] += 1
                stats["sum"] += value
                stats["min"] = min(stats["min"], value)
                stats["max"] = max(stats["max"], value)

    def status(self, now):
        minute = int(now // 60)
        return {
            "minutes": {
                k: v for k, v in self.minutes.items() if minute - 120 <= int(k) < minute
            },
            "since": getattr(self, "since", now),
        }
