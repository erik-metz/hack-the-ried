import os
import sys
import unittest
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GPS_ENCRYPTION_KEY", "11" * 32)
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tests"))
from db_support import DatabaseCase
from endpoints.gps_tracker import _inspect_gateways, get_gps_tracker_points
from gps_crypto import decrypt_gps_data, encrypt_gps_data, get_encryption_key
from psycopg.rows import dict_row


class GpsCryptoTests(unittest.TestCase):
    def test_encrypt_decrypt_roundtrip(self):
        coords = {
            "latitude": 49.6834123,
            "longitude": 8.4521234,
            "altitude": 95,
            "satellites": 8,
        }
        encrypted = encrypt_gps_data(coords)
        self.assertIsInstance(encrypted, bytes)
        self.assertGreater(len(encrypted), 30)

        # Ensure no plaintext coordinates exist in the ciphertext
        self.assertNotIn(b"49.6834", encrypted)
        self.assertNotIn(b"8.4521", encrypted)

        decrypted = decrypt_gps_data(encrypted)
        self.assertEqual(decrypted["latitude"], coords["latitude"])
        self.assertEqual(decrypted["longitude"], coords["longitude"])
        self.assertEqual(decrypted["altitude"], coords["altitude"])
        self.assertEqual(decrypted["satellites"], coords["satellites"])

    def test_decrypt_invalid_payload_fails(self):
        with self.assertRaises(ValueError):
            decrypt_gps_data(b"too_short")

    @patch.dict("os.environ", {"GPS_ENCRYPTION_KEY": ""})
    def test_missing_key_is_rejected(self):
        with self.assertRaises(RuntimeError):
            get_encryption_key()

    @patch.dict("os.environ", {"GPS_ENCRYPTION_KEY": "not-a-valid-key"})
    def test_malformed_key_is_rejected(self):
        with self.assertRaises(RuntimeError):
            get_encryption_key()


class GatewayInspectionTests(unittest.TestCase):
    @patch.dict("os.environ", {"OWN_GATEWAY_ID": "kamue-gateway", "OWN_GATEWAY_EUI": "98FE54FFFE63713B"})
    def test_detects_own_gateway_by_id_and_eui(self):
        rx_metadata = [
            {
                "gateway_ids": {"gateway_id": "public-mannheim-gw-01", "eui": "1122334455667788"},
                "rssi": -110,
                "snr": -4.5,
            },
            {
                "gateway_ids": {"gateway_id": "kamue-gateway", "eui": "98FE54FFFE63713B"},
                "rssi": -78,
                "snr": 9.25,
            },
        ]
        stats = _inspect_gateways(rx_metadata)
        self.assertTrue(stats["received_by_own_gateway"])
        self.assertEqual(stats["own_gateway_rssi"], -78)
        self.assertEqual(stats["own_gateway_snr"], 9.25)
        self.assertEqual(stats["best_gateway_id"], "kamue-gateway")
        self.assertEqual(stats["best_gateway_rssi"], -78)
        self.assertEqual(stats["gateway_count"], 2)

    @patch.dict("os.environ", {"OWN_GATEWAY_ID": "kamue-gateway", "OWN_GATEWAY_EUI": "98FE54FFFE63713B"})
    def test_foreign_gateways_only(self):
        rx_metadata = [
            {
                "gateway_ids": {"gateway_id": "ttn-heidelberg-north", "eui": "AABBCCDDEEFF0011"},
                "rssi": -105,
                "snr": -2.0,
            },
            {
                "gateway_ids": {"gateway_id": "ttn-darmstadt-south", "eui": "2233445566778899"},
                "rssi": -98,
                "snr": 3.5,
            },
        ]
        stats = _inspect_gateways(rx_metadata)
        self.assertFalse(stats["received_by_own_gateway"])
        self.assertIsNone(stats["own_gateway_rssi"])
        self.assertIsNone(stats["own_gateway_snr"])
        self.assertEqual(stats["best_gateway_id"], "ttn-darmstadt-south")
        self.assertEqual(stats["best_gateway_rssi"], -98)
        self.assertEqual(stats["best_gateway_snr"], 3.5)
        self.assertEqual(stats["gateway_count"], 2)


class GpsHistoryTests(DatabaseCase):
    async def test_latest_points_are_selected_before_chronological_route_order(self):
        start = datetime(2026, 11, 10, tzinfo=UTC)
        encrypted = encrypt_gps_data({"latitude": 49.68, "longitude": 8.45})
        # A later inserted point with an older timestamp must not displace a trip.
        for event, device, minute, own in [
            ('home', 'tracker', 0, True),
            ('trip-a', 'tracker', 1, False),
            ('trip-b', 'tracker', 2, True),
            ('other', 'other', 3, True),
            ('backfill', 'tracker', -1, True),
        ]:
            await self.conn.execute(
                """INSERT INTO gps_tracker_points
                (device_id,uplink_event_id,recorded_at,received_at,slot_index,
                 has_fix,received_by_own_gateway,encrypted_payload)
                VALUES (%s,%s,%s,%s,0,TRUE,%s,%s)""",
                (device, event, start + timedelta(minutes=minute), start, own, encrypted),
            )
        self.conn.row_factory = dict_row
        connection = self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                yield connection

        async def read(**filters):
            return await get_gps_tracker_points(
                **{'device_id': None, 'since': None, 'only_own_gateway': False,
                   'limit': 2, 'pool': Pool(), **filters}
            )

        result = await read(device_id='tracker')
        self.assertEqual(
            [datetime.fromisoformat(p['recorded_at']) for p in result['points']],
            [start + timedelta(minutes=m) for m in (1, 2)],
        )
        self.assertEqual(result['count'], 2)
        self.assertFalse(result['points'][0]['received_by_own_gateway'])
        self.assertEqual(result['points'][0]['latitude'], 49.68)
        own = await read(device_id='tracker', only_own_gateway=True)
        self.assertEqual([datetime.fromisoformat(p['recorded_at']) for p in own['points']],
                         [start, start + timedelta(minutes=2)])
        recent = await read(device_id='tracker', since=start + timedelta(minutes=2))
        self.assertEqual(recent['count'], 1)
        all_devices = await read()
        self.assertEqual([p['device_id'] for p in all_devices['points']], ['tracker', 'other'])


if __name__ == "__main__":
    unittest.main()
