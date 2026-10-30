import unittest
from contextlib import asynccontextmanager
from datetime import date

from endpoints.qr_scans import QrScanEvent, daily_scans, record_scan
from pydantic import ValidationError


class FakeConnection:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.query = None
        self.params = None

    async def execute(self, query, params=None):
        self.query, self.params = query, params
        return self

    async def fetchall(self):
        return self.rows


class FakePool:
    def __init__(self, connection):
        self.connection_instance = connection

    @asynccontextmanager
    async def connection(self):
        yield self.connection_instance


class QrScanTests(unittest.IsolatedAsyncioTestCase):
    async def test_record_persists_only_supported_campaign_fields(self):
        connection = FakeConnection()
        payload = QrScanEvent(
            qr_id="2",
            referrer_host="example.org",
            user_agent="Browser",
            campaign={"utm_source": "flyer", "email": "private@example.org"},
        )
        result = await record_scan(payload, "admin", FakePool(connection))
        self.assertEqual(result, {"recorded": True})
        self.assertIn("INSERT INTO qr_scan_events", connection.query)
        self.assertEqual(connection.params[0:3], ("2", "example.org", "Browser"))
        self.assertEqual(connection.params[3].obj, {"utm_source": "flyer"})

    async def test_qr_ids_outside_printed_set_are_rejected(self):
        with self.assertRaises(ValidationError):
            QrScanEvent(qr_id="999")

    async def test_public_aggregate_contains_only_day_code_and_count(self):
        connection = FakeConnection([{"day": date(2026, 10, 30), "qr_id": "1", "scans": 4}])
        result = await daily_scans(FakePool(connection), days=30)
        self.assertEqual(result, [{"day": "2026-10-30", "qr_id": "1", "scans": 4}])
        self.assertEqual(connection.params, (30,))
        self.assertIn("GROUP BY 1, qr_id", connection.query)


if __name__ == "__main__":
    unittest.main()
