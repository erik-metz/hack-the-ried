#!/usr/bin/env python3
"""Host telemetry with durable outbox. Standard library only; never controls radio."""

import argparse
import concurrent.futures
import fcntl
import json
import os
import shutil
import sqlite3
import subprocess
import time
import urllib.request
import uuid
from pathlib import Path

STATES = (
    "radio_ready",
    "station_connected",
    "lns_connected",
    "undervoltage",
    "throttled",
)


def command(*args):
    try:
        return subprocess.check_output(
            args, timeout=3, stderr=subprocess.DEVNULL, text=True
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return None


def read(path):
    return Path(path).read_text().strip()


def crc(data):
    value = 0xFF
    for byte in data:
        value ^= byte
        for _ in range(8):
            value = ((value << 1) ^ 0x31 if value & 0x80 else value << 1) & 0xFF
    return value


def sht41(device):
    # SHT41-AD1B, 3.3 V, I2C address 0x44. Linux i2c-dev ABI.
    with open(device, "r+b", buffering=0) as bus:
        fcntl.ioctl(bus.fileno(), 0x0703, 0x44)
        bus.write(b"\xfd")
        time.sleep(0.01)
        data = bus.read(6)
    if len(data) != 6 or crc(data[:2]) != data[2] or crc(data[3:5]) != data[5]:
        raise ValueError("SHT41 CRC")
    return -45 + 175 * int.from_bytes(data[:2], "big") / 65535, max(
        0, min(100, -6 + 125 * int.from_bytes(data[3:5], "big") / 65535)
    )


class Outbox:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,at REAL,body TEXT);
            CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT);""")

    def get(self, key, default=None):
        row = self.db.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key, value):
        self.db.execute(
            "INSERT OR REPLACE INTO state VALUES(?,?)", (key, json.dumps(value))
        )

    def append(self, sample, checkpoint, now):
        with self.db:
            self.db.execute(
                "INSERT INTO outbox VALUES(?,?,?)",
                (sample["sample_id"], now, json.dumps(sample)),
            )
            self.set("checkpoint", checkpoint)
            # Bound logical bytes and count. SQLite reuses freed pages.
            dropped = self.db.execute(
                "DELETE FROM outbox WHERE at<?", (now - 30 * 86400,)
            ).rowcount
            size, count = self.db.execute(
                "SELECT coalesce(sum(length(body)),0),count(*) FROM outbox"
            ).fetchone()
            while size > 96 * 1024 * 1024 or count > 43200:
                row = self.db.execute(
                    "SELECT id,length(body) FROM outbox ORDER BY at LIMIT 1"
                ).fetchone()
                self.db.execute("DELETE FROM outbox WHERE id=?", (row[0],))
                size -= row[1]
                count -= 1
                dropped += 1
            if dropped:
                self.set("dropped", self.get("dropped", 0) + dropped)

    def batch(self):
        # Current sample first, then oldest backlog; never starve current status.
        newest = self.db.execute(
            "SELECT id,body FROM outbox ORDER BY at DESC LIMIT 1"
        ).fetchall()
        old = self.db.execute(
            "SELECT id,body FROM outbox WHERE id<>? ORDER BY at LIMIT 9",
            (newest[0][0] if newest else "",),
        ).fetchall()
        return [json.loads(body) for _, body in newest + old]

    def ack(self, ids):
        with self.db:
            self.db.executemany("DELETE FROM outbox WHERE id=?", [(i,) for i in ids])


class Collector:
    def __init__(self, config, outbox):
        self.config = config
        self.outbox = outbox
        self.boot = read("/proc/sys/kernel/random/boot_id")
        self.cpu = None
        self.checkpoint = outbox.get("checkpoint", {})
        self.sequence = self.checkpoint.get("sequence", 0)
        self.previous_states = self.checkpoint.get("states", {})
        self.events = []
        if self.checkpoint.get("boot") != self.boot:
            self.event("boot", {"boot_id": self.boot})
        self.duration = {s: [0.0, 0.0] for s in STATES}
        self.last_tick = None
        self.last_values = {}

    def event(self, kind, details):
        self.events.append(
            {
                "event_id": str(uuid.uuid4()),
                "observed_at": iso(time.time()),
                "kind": kind,
                "details": details,
            }
        )

    def health(self, now):
        try:
            data = json.loads(read(self.config["health_file"]))
            age = now - data["at"]
            return (data if 0 <= age <= 20 else {}), max(0, age)
        except (OSError, ValueError, KeyError, TypeError):
            return {}, None

    def tick(self, now):
        health, age = self.health(now)
        flags = command("vcgencmd", "get_throttled")
        try:
            flags = int(flags.split("=")[1], 16)
        except (ValueError, AttributeError, IndexError):
            flags = None
        states = {
            s: float(health[s]) if isinstance(health.get(s), bool) else None
            for s in STATES[:3]
        }
        states.update(
            undervoltage=None if flags is None else float(bool(flags & 1)),
            throttled=None if flags is None else float(bool(flags & 4)),
        )
        elapsed = min(10, max(0, now - self.last_tick)) if self.last_tick else 0
        for state, value in states.items():
            # Credit elapsed time only if both observations are known and agree.
            if value is not None and self.last_values.get(state) == value:
                self.duration[state][0] += elapsed
                self.duration[state][1] += elapsed * value
            if state in self.previous_states and self.previous_states[state] != value:
                self.event(
                    state, {"previous": self.previous_states[state], "current": value}
                )
            self.previous_states[state] = value
        self.last_tick = now
        self.last_values = states
        return health, age, flags, states

    def sample(self, now):
        health, age, flags, states = self.tick(now)
        values = dict(
            states,
            health_age=age,
            throttled_history=flags,
            uptime=float(read("/proc/uptime").split()[0]),
            disk_free=shutil.disk_usage("/").free,
            telemetry_pending=self.outbox.db.execute(
                "SELECT count(*) FROM outbox"
            ).fetchone()[0],
            telemetry_dropped=self.outbox.get("dropped", 0),
        )
        try:
            values["cpu_temperature"] = (
                int(read("/sys/class/thermal/thermal_zone0/temp")) / 1000
            )
        except (OSError, ValueError):
            values["cpu_temperature"] = None
        memory = dict(line.split(":", 1) for line in read("/proc/meminfo").splitlines())
        values["memory_available"] = int(memory["MemAvailable"].split()[0]) * 1024
        cpu = [int(n) for n in read("/proc/stat").splitlines()[0].split()[1:9]]
        total = sum(cpu)
        idle = cpu[3] + cpu[4]
        values["cpu_usage"] = (
            100 * (1 - (idle - self.cpu[1]) / (total - self.cpu[0]))
            if self.cpu and total > self.cpu[0]
            else None
        )
        self.cpu = (total, idle)
        values["last_rx_age"] = (
            max(0, now - health["last_rx"]) if health.get("last_rx") else None
        )
        spool = health.get("spool", {})
        for field, key in [
            ("pending", "pending"),
            ("unknown", "acceptance_unknown"),
            ("rows", "rows"),
            ("bytes", "bytes"),
        ]:
            values["spool_" + field] = spool.get(key)
        sensor_error = False
        values["enclosure_temperature"] = values["enclosure_humidity"] = None
        if self.config.get("sht41_device"):
            try:
                values["enclosure_temperature"], values["enclosure_humidity"] = sht41(
                    self.config["sht41_device"]
                )
            except (OSError, ValueError):
                sensor_error = True
        if sensor_error != self.checkpoint.get("sensor_error", False):
            self.event("sensor_error", {"active": sensor_error})
        counters = spool.get("counters", {})
        old = self.checkpoint.get("journal", {})
        same = health.get("boot") == self.checkpoint.get("bridge_boot")
        for field, key in [
            ("journal_expired", "expired"),
            ("journal_overflow", "overflow_dropped"),
        ]:
            value = counters.get(key, 0) if health else None
            values[field] = (
                max(0, value - old.get(key, value))
                if value is not None and same
                else None
            )
        readings = [{"metric": k, "value": v} for k, v in values.items()]
        for state, (known, up) in self.duration.items():
            readings.extend(
                [
                    {
                        "metric": "state_known_seconds",
                        "value": min(60, known),
                        "dimensions": {"state": state},
                    },
                    {
                        "metric": "state_up_seconds",
                        "value": min(60, up),
                        "dimensions": {"state": state},
                    },
                ]
            )
        radio = health.get("radio_stats", {})
        # The previous completed minute is an interval ending at observed_at.
        bucket = radio.get("minutes", {}).get(str(int(now // 60) - 1))
        if bucket is not None:
            for key, value in bucket.get("rx_packets", {}).items():
                frequency, rate = key.split(":")
                readings.append(
                    {
                        "metric": "rx_packets",
                        "value": value,
                        "dimensions": {"frequency_hz": frequency, "data_rate": rate},
                    }
                )
            for metric in ("rx_rssi", "rx_snr"):
                for stat, value in bucket.get(metric, {}).items():
                    readings.append(
                        {"metric": metric, "statistic": stat, "value": value}
                    )
        if radio and radio.get("since", now) > now - 60:
            pass  # First partial interval is deliberately not invented as zero.
        elif radio and bucket is None:
            readings.append({"metric": "rx_packets", "value": 0})
        dropped = self.outbox.get("dropped", 0)
        if dropped > self.checkpoint.get("dropped", 0):
            self.event(
                "data_gap",
                {"dropped_samples": dropped - self.checkpoint.get("dropped", 0)},
            )
        self.sequence += 1
        sample = {
            "sample_id": str(uuid.uuid4()),
            "boot_id": self.boot,
            "sequence": self.sequence,
            "observed_at": iso(int(now // 60) * 60),
            "readings": readings,
            "events": self.events[:100],
        }
        checkpoint = {
            "boot": self.boot,
            "sequence": self.sequence,
            "states": self.previous_states,
            "journal": counters,
            "bridge_boot": health.get("boot"),
            "radio": radio,
            "sensor_error": sensor_error,
            "minute": int(now // 60),
            "dropped": dropped,
        }
        self.outbox.append(sample, checkpoint, now)
        self.events = self.events[100:]
        self.checkpoint = checkpoint
        self.duration = {s: [0.0, 0.0] for s in STATES}
        return sample


def iso(stamp):
    from datetime import UTC, datetime

    return datetime.fromtimestamp(stamp, UTC).isoformat()


def send(config, samples):
    if not samples:
        return []
    url = (
        config["api_url"].rstrip("/")
        + "/gateways/"
        + config["gateway_id"]
        + "/telemetry/batch"
    )
    if not url.startswith("https://"):
        raise ValueError("HTTPS required")
    request = urllib.request.Request(
        url,
        data=json.dumps({"version": 1, "samples": samples}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + config["token"],
        },
        method="POST",
    )

    # Do not follow redirects with the gateway credential.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
        result = json.load(response)
    accepted = result.get("accepted", [])
    expected = {s["sample_id"] for s in samples}
    if not set(accepted) <= expected:
        raise ValueError("Unexpected acknowledgement")
    return accepted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="/etc/kamue-gateway-telemetry.json")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(read(args.config))
    directory = Path(config.get("state_directory", "/var/lib/kamue-gateway-telemetry"))
    directory.mkdir(parents=True, exist_ok=True)
    lock = open(directory / "collector.lock", "w")  # noqa: SIM115 -- held for the daemon lifetime
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    outbox = Outbox(directory / "outbox.sqlite3")
    collector = Collector(config, outbox)
    last_minute = collector.checkpoint.get("minute")
    future = None
    retry_at = 0
    delay = 1
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        while True:
            now = time.time()
            if now < 1700000000:
                time.sleep(10)
                continue
            minute = int(now // 60)
            if minute != last_minute and now % 60 >= 8:
                collector.sample(now)
                last_minute = minute
            else:
                collector.tick(now)
            if future and future.done():
                try:
                    outbox.ack(future.result())
                    delay = 1
                except (OSError, ValueError, TimeoutError) as exc:
                    print("Telemetry upload failed: " + type(exc).__name__, flush=True)
                    delay = min(300, delay * 2)
                future = None
                retry_at = now + delay
            if future is None and now >= retry_at:
                samples = outbox.batch()
                if samples:
                    future = executor.submit(send, config, samples)
            if args.once:
                if future:
                    outbox.ack(future.result())
                break
            time.sleep(10)


if __name__ == "__main__":
    main()
