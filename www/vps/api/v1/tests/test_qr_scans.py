import unittest
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime

from endpoints.qr_scans import QrScanEvent, daily_scans, list_scans, record_scan
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

    async def test_all_ten_printed_qr_ids_are_accepted(self):
        for qr_id in map(str, range(1, 11)):
            with self.subTest(qr_id=qr_id):
                self.assertEqual(QrScanEvent(qr_id=qr_id).qr_id, qr_id)

    async def test_qr_ids_outside_printed_set_are_rejected(self):
        for qr_id in ("0", "11", "999", "01", "1\n", "10\n"):
            with self.subTest(qr_id=qr_id), self.assertRaises(ValidationError):
                QrScanEvent(qr_id=qr_id)

    async def test_public_aggregate_contains_only_day_code_and_count(self):
        connection = FakeConnection([{"day": date(2026, 10, 30), "qr_id": "1", "scans": 4}])
        result = await daily_scans(FakePool(connection), days=30)
        self.assertEqual(result, [{"day": "2026-10-30", "qr_id": "1", "scans": 4}])
        self.assertEqual(connection.params, (30,))
        self.assertIn("GROUP BY 1, qr_id", connection.query)

    async def test_admin_history_includes_old_events_without_date_cutoff(self):
        old = datetime(2020, 1, 1, tzinfo=UTC)
        connection = FakeConnection([{
            "id": 9007199254740993, "qr_id": "1", "scanned_at": old,
            "referrer_host": None, "user_agent": None, "campaign": {},
        }])
        result = await list_scans("admin", FakePool(connection), before=None, qr_id=None, days=0, limit=100)
        self.assertNotIn("WHERE", connection.query)
        self.assertIn("ORDER BY id DESC LIMIT %s", connection.query)
        self.assertEqual(connection.params, (101,))
        self.assertEqual(result["items"][0]["id"], "9007199254740993")
        self.assertEqual(result["items"][0]["scanned_at"], old.isoformat())
        self.assertIsNone(result["next_cursor"])

    async def test_admin_history_pages_with_filters_and_lookahead(self):
        connection = FakeConnection([
            {"id": value, "qr_id": "2", "scanned_at": datetime.now(UTC),
             "referrer_host": None, "user_agent": None, "campaign": {}}
            for value in [8, 7, 6]
        ])
        result = await list_scans("admin", FakePool(connection), before=9, qr_id="2", days=90, limit=2)
        self.assertEqual(connection.params, (9, "2", 90, 3))
        self.assertIn("id < %s AND qr_id = %s AND scanned_at >=", connection.query)
        self.assertEqual([item["id"] for item in result["items"]], ["8", "7"])
        self.assertEqual(result["next_cursor"], "7")

    async def test_admin_history_empty_page(self):
        result = await list_scans("admin", FakePool(FakeConnection()), before=1, qr_id=None, days=0, limit=100)
        self.assertEqual(result, {"items": [], "next_cursor": None})

    def test_admin_history_requires_admin_credentials_and_valid_filters(self):
        import os
        from unittest.mock import patch

        from dependencies import get_db_pool
        from endpoints.qr_scans import router
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db_pool] = lambda: FakePool(FakeConnection())
        with patch.dict(os.environ, {"ADMIN_API_KEY": "admin-test", "API_KEY": "ingest-test"}):
            client = TestClient(app)
            self.assertIn(client.get("/admin/qr/scans").status_code, (401, 403))
            self.assertEqual(client.get("/admin/qr/scans", headers={"Authorization": "Bearer ingest-test"}).status_code, 401)
            headers = {"Authorization": "Bearer admin-test"}
            for query in ("before=0", "before=9223372036854775808", "qr_id=11", "days=-1", "limit=101"):
                self.assertEqual(client.get("/admin/qr/scans?" + query, headers=headers).status_code, 422)
            self.assertEqual(client.get("/admin/qr/scans", headers=headers).json(), {"items": [], "next_cursor": None})


if __name__ == "__main__":
    unittest.main()
