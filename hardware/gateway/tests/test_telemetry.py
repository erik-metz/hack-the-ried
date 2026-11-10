import importlib.util
import io
import json
import tempfile
import unittest
import urllib.error
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


class UploadRecoveryTests(unittest.TestCase):
    @staticmethod
    def error(status):
        return urllib.error.HTTPError(
            "https://backend.test/telemetry/batch",
            status,
            "rejected",
            {},
            io.BytesIO(b'{"detail":"Minute already accepted with another identity"}'),
        )

    def test_conflicting_backlog_isolated_and_preserved_while_new_samples_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.db"
            box = collector.Outbox(path)
            samples = [
                {"sample_id": name, "readings": [{"value": value}]}
                for name, value in [
                    ("conflict", 41),
                    ("old-valid", 42),
                    ("current", 43),
                ]
            ]
            now = collector.time.time()
            for index, sample in enumerate(samples):
                box.append(sample, {"sequence": index}, now - 120 + index * 60)
            calls = []

            def upload(config, batch):
                calls.append([item["sample_id"] for item in batch])
                if any(item["sample_id"] == "conflict" for item in batch):
                    raise self.error(409)
                return [item["sample_id"] for item in batch]

            with patch.object(collector, "send", side_effect=upload):
                accepted, rejected = collector.deliver({}, box.batch())
            self.assertEqual(accepted, ["current", "old-valid"])
            self.assertEqual(calls[0], ["current", "conflict", "old-valid"])
            self.assertEqual(rejected[0]["status"], 409)
            box.complete(accepted, rejected)
            self.assertEqual(box.batch(), [])
            box.db.close()
            box = collector.Outbox(path)
            body, status, reason = box.db.execute(
                "SELECT body,status,reason FROM quarantine"
            ).fetchone()
            self.assertEqual(json.loads(body), samples[0])
            self.assertEqual(status, 409)
            self.assertIn("Minute already accepted", reason)
            self.assertEqual(box.get("dropped", 0), 0)
            self.assertEqual(box.get("checkpoint")["sequence"], 2)
            box.db.close()

    def test_invalid_single_sample_can_be_quarantined_but_transient_errors_retry(self):
        for status in (409, 422):
            with (
                self.subTest(status=status),
                patch.object(
                    collector,
                    "send",
                    side_effect=self.error(status),
                ),
            ):
                accepted, rejected = collector.deliver({}, [{"sample_id": "bad"}])
                self.assertEqual(accepted, [])
                self.assertEqual(rejected[0]["sample_id"], "bad")
        for status in (301, 401, 403, 408, 413, 429, 500, 503):
            with (
                self.subTest(status=status),
                patch.object(
                    collector,
                    "send",
                    side_effect=self.error(status),
                ),
                self.assertRaises(urllib.error.HTTPError),
            ):
                collector.deliver({}, [{"sample_id": "keep"}])

    def test_network_failure_after_partial_upload_keeps_entire_local_batch_for_retry(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            box = collector.Outbox(Path(directory) / "queue.db")
            now = collector.time.time()
            for index in range(2):
                box.append({"sample_id": str(index)}, {}, now + index)
            with (
                patch.object(
                    collector,
                    "send",
                    side_effect=[self.error(409), ["1"], TimeoutError()],
                ),
                self.assertRaises(TimeoutError),
            ):
                collector.deliver({}, box.batch())
            self.assertEqual({item["sample_id"] for item in box.batch()}, {"0", "1"})
            self.assertEqual(
                box.db.execute("SELECT count(*) FROM quarantine").fetchone()[0], 0
            )
            box.db.close()

    def test_failed_quarantine_write_cannot_remove_pending_sample(self):
        with tempfile.TemporaryDirectory() as directory:
            box = collector.Outbox(Path(directory) / "queue.db")
            box.append({"sample_id": "keep"}, {}, collector.time.time())
            box.db.execute(
                "CREATE TRIGGER reject_quarantine BEFORE INSERT ON quarantine BEGIN SELECT RAISE(ABORT, 'disk failure'); END"
            )
            with self.assertRaises(collector.sqlite3.IntegrityError):
                box.complete(
                    [], [{"sample_id": "keep", "status": 409, "reason": "conflict"}]
                )
            self.assertEqual(box.batch(), [{"sample_id": "keep"}])
            box.db.close()

    def test_quarantine_obeys_retention_and_reports_loss(self):
        with tempfile.TemporaryDirectory() as directory:
            box = collector.Outbox(Path(directory) / "queue.db")
            box.append({"sample_id": "conflict"}, {}, collector.time.time())
            box.complete(
                [], [{"sample_id": "conflict", "status": 409, "reason": "conflict"}]
            )
            box.append({"sample_id": "current"}, {}, collector.time.time() + 31 * 86400)
            self.assertEqual(
                box.db.execute("SELECT count(*) FROM quarantine").fetchone()[0], 0
            )
            self.assertEqual(box.get("dropped"), 1)
            box.db.close()
