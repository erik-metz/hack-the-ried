import unittest
from unittest.mock import AsyncMock, MagicMock

from endpoints.archives import list_archives


class ArchiveCatalogueTests(unittest.IsolatedAsyncioTestCase):
    async def test_catalogue_hides_storage_keys_and_checks_current_visibility(self):
        file = {
            "filename": "month.zip", "url": "https://example.com/month.zip",
            "size_bytes": 123, "reading_count": 6001, "sha256": "a" * 64,
            "key": "private-storage-key",
        }
        row = {
            "month": "2025-01", "format_version": 2, "generated_at": "2025-02-01T00:00:00Z",
            "is_complete": True, "reading_count": 6001, "size_bytes": 123,
            "files": [file],
        }
        cursor = MagicMock()
        cursor.fetchall = AsyncMock(return_value=[row])
        connection = MagicMock()
        connection.execute = AsyncMock(return_value=cursor)
        pool = MagicMock()
        pool.connection.return_value.__aenter__.return_value = connection
        result = await list_archives(pool)
        self.assertNotIn("key", result[0]["files"][0])
        self.assertEqual(result[0]["files"][0]["format"], "csv")
        self.assertEqual(result[0]["reading_count"], 6001)
        sql = connection.execute.call_args.args[0]
        self.assertIn("NOT s.is_hidden", sql)
        self.assertIn("unnest(a.station_ids)", sql)
        self.assertIn("unnest(a.entity_ids)", sql)
        self.assertIn("NOT e.is_hidden", sql)
        self.assertIn("legacy_deleted", sql)
        self.assertEqual(result[0]["format_version"], 2)


if __name__ == "__main__":
    unittest.main()
