"""Contract and invalid-configuration checks without radio hardware or credentials."""
import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class GatewayConfigTests(unittest.TestCase):
    def run_start(self, **overrides):
        env = dict(os.environ, GATEWAY_EUI="0102030405060708",
                   TC_KEY="NNSXS.synthetic-unit-key",
                   TC_URI="wss://eu1.cloud.thethings.network:8887")
        env.update(overrides)
        return subprocess.run(["bash", str(ROOT / "scripts/gateway-start")],
                              env=env, capture_output=True, text=True, check=False)

    def test_invalid_values_fail_before_hardware_or_secret_access(self):
        for values in ({"GATEWAY_EUI": ""}, {"GATEWAY_EUI": "0000000000000000"},
                       {"GATEWAY_EUI": "FFFFFFFFFFFFFFFF"},
                       {"TC_URI": "ws://insecure:8887"},
                       {"RESET_GPIO": "32"}, {"GPIO_CHIP": "../../etc"},
                       {"ANTENNA_GAIN_DBI": "-1"}):
            with self.subTest(values=values):
                result = self.run_start(**values)
                self.assertEqual(result.returncode, 64)
                self.assertIn("Gateway configuration error:", result.stderr)

    def test_missing_or_malformed_keys_fail_without_echoing_the_key(self):
        for key in ("", "private-invalid-value", "NNSXS.first\nsecond",
                    "Authorization: Bearer NNSXS.synthetic-key"):
            with self.subTest(key_type="empty" if not key else "malformed"):
                result = self.run_start(TC_KEY=key)
                self.assertEqual(result.returncode, 64)
                self.assertIn("TC_KEY must contain", result.stderr)
                if key:
                    self.assertNotIn(key, result.stdout + result.stderr)

    def test_compose_passes_key_only_to_gateway_and_scopes_updater(self):
        # CI renders Compose; inspect its normalized contract instead of YAML text.
        if "GATEWAY_COMPOSE_JSON" not in os.environ:
            self.skipTest("run after docker compose config --format json")
        data = json.loads(Path(os.environ["GATEWAY_COMPOSE_JSON"]).read_text())
        station = data["services"]["basicstation"]
        updater = data["services"]["watchtower"]
        self.assertFalse(station.get("ports"))
        self.assertFalse(updater.get("ports"))
        self.assertFalse(station.get("privileged", False))
        self.assertTrue(any(v.startswith("/var/tmp:") for v in station["tmpfs"]))
        self.assertNotEqual(station.get("network_mode"), "host")
        self.assertTrue(station["environment"]["TC_KEY"].startswith("NNSXS."))
        self.assertNotIn("secrets", station)
        self.assertNotIn("TC_KEY", updater["environment"])
        self.assertEqual(station["platform"], "linux/arm64")
        self.assertEqual(updater["environment"]["WATCHTOWER_SCOPE"], "kamue-gateway")
        self.assertEqual(updater["environment"]["WATCHTOWER_MONITOR_ONLY"], "false")
        self.assertEqual(updater["environment"]["WATCHTOWER_CLEANUP"], "false")
        self.assertEqual(updater["labels"]["com.centurylinklabs.watchtower.enable"], "false")
        self.assertNotIn("/var/run/docker.sock", json.dumps(station))


if __name__ == "__main__":
    unittest.main()
