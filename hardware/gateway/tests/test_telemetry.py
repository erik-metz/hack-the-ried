import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "gateway_collector", ROOT / "telemetry/collector.py"
)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
spec = importlib.util.spec_from_file_location(
    "gateway_radio", ROOT / "bridge/radio_stats.py"
)
radio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(radio)


class TelemetryTests(unittest.TestCase):
    def test_outbox_survives_restart_and_only_acknowledged_rows_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.db"
            box = collector.Outbox(path)
            for i in range(3):
                box.append({"sample_id": str(i)}, {"sequence": i}, 100 + i)
            self.assertEqual([s["sample_id"] for s in box.batch()], ["2", "0", "1"])
            box.ack(["1"])
            box.db.close()
            box = collector.Outbox(path)
            self.assertEqual(box.get("checkpoint")["sequence"], 2)
            self.assertEqual({s["sample_id"] for s in box.batch()}, {"0", "2"})

    def test_radio_completed_minutes_and_replay_independence(self):
        stats = radio.RadioStats()
        stats.since = 1
        for value in (-100, -110):
            stats.add(
                {"Freq": 867100000, "DR": 4, "upinfo": {"rssi": value, "snr": -1}}, 61
            )
        self.assertEqual(stats.status(70)["minutes"], {})
        bucket = stats.status(121)["minutes"]["1"]
        self.assertEqual(
            bucket["rx_rssi"], {"count": 2, "sum": -210, "min": -110, "max": -100}
        )
        self.assertEqual(bucket["rx_packets"], {"867100000:4": 2})
        self.assertEqual(stats.status(61 + 121 * 60)["minutes"], {})

    def test_stale_health_does_not_report_healthy(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "health.json"
            path.write_text(json.dumps({"at": 10, "radio_ready": True}))
            box = collector.Outbox(Path(directory) / "q.db")
            with patch.object(
                collector,
                "read",
                side_effect=lambda p: (
                    "00000000-0000-0000-0000-000000000001"
                    if str(p).endswith("boot_id")
                    else Path(p).read_text()
                ),
            ):
                obj = collector.Collector({"health_file": str(path)}, box)
            self.assertEqual(obj.health(100), ({}, 90))

    def test_first_install_is_not_a_pi_reboot(self):
        with tempfile.TemporaryDirectory() as directory:
            box = collector.Outbox(Path(directory) / "q.db")
            with patch.object(collector, "read", return_value="new-boot"):
                first = collector.Collector({}, box)
                self.assertEqual(first.events, [])
                with box.db:
                    box.set("checkpoint", {"boot": "old-boot"})
                reboot = collector.Collector({}, box)
                self.assertEqual([e["kind"] for e in reboot.events], ["boot"])

    def test_bounded_queue_reports_loss(self):
        with tempfile.TemporaryDirectory() as directory:
            box = collector.Outbox(Path(directory) / "q.db")
            box.append({"sample_id": "old"}, {}, 1)
            box.append({"sample_id": "new"}, {}, 31 * 86400)
            self.assertEqual(box.get("dropped"), 1)
            self.assertEqual([s["sample_id"] for s in box.batch()], ["new"])
