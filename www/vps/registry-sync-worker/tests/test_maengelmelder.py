import asyncio
import hashlib
import unittest

from maengelmelder import API_URL, BOUNDS, import_maengelmelder, parse_geojson


class MaengelmelderTests(unittest.TestCase):
    def test_parse_keeps_minimal_fields_and_filters_to_ried(self):
        payload = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": 123,
                    "geometry": {"type": "Point", "coordinates": [8.45, 49.64]},
                    "properties": {
                        "created": "2026-10-27", "type": "Beleuchtung", "state": "open",
                        "description": "unwanted text", "address": "private address",
                    },
                },
                {
                    "type": "Feature", "id": 456,
                    "geometry": {"type": "Point", "coordinates": [8.9, 49.64]},
                    "properties": {"type": "Müll"},
                },
            ],
        }
        records = parse_geojson(payload, BOUNDS[0])
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], "123")
        self.assertEqual(records[0]["category"], "Beleuchtung")
        self.assertNotIn("description", records[0])
        self.assertNotIn("address", records[0])

    def test_rejects_unexpected_response_shape(self):
        with self.assertRaises(ValueError):
            parse_geojson({"type": "FeatureCollection", "features": "bad"}, BOUNDS[0])

    def test_rejects_response_exceeding_provider_page_limit(self):
        with self.assertRaises(ValueError):
            parse_geojson({"type": "FeatureCollection", "features": [None] * 201}, BOUNDS[0])

    def test_import_archives_only_sanitized_payload_and_links_it_before_publish(self):
        class Response:
            def json(self):
                return {
                    "type": "FeatureCollection",
                    "features": [{
                        "type": "Feature",
                        "id": 123,
                        "geometry": {"type": "Point", "coordinates": [8.45, 49.64]},
                        "properties": {
                            "created": "2026-10-27", "type": "Beleuchtung",
                            "state": "open", "description": "private report text",
                            "address": "private street address",
                        },
                    }],
                }

            def raise_for_status(self):
                return None

        class Client:
            async def get(self, url, params):
                assert url == API_URL
                return Response()

        class Transaction:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return False

        class Connection:
            def __init__(self):
                self.calls = []

            def transaction(self):
                return Transaction()

            async def execute(self, query, params=()):
                self.calls.append((query, params))

        conn = Connection()
        result = asyncio.run(import_maengelmelder(
            conn, Client(), {"id": "maengelmelder-ried", "url": API_URL, "max_age_seconds": 3600}
        ))

        payload_query, payload_params = next(
            (query, params) for query, params in conn.calls if "INSERT INTO collected_payloads" in query
        )
        safe_payload = payload_params[1]
        self.assertEqual(payload_params[0], hashlib.sha256(safe_payload).hexdigest())
        self.assertNotIn(b"private report text", safe_payload)
        self.assertNotIn(b"private street address", safe_payload)
        self.assertIn("INSERT INTO collection_attempts", " ".join(q for q, _ in conn.calls))
        self.assertIn("INSERT INTO collected_dataset_versions", " ".join(q for q, _ in conn.calls))
        self.assertTrue(any("INSERT INTO collected_datasets" in q for q, _ in conn.calls))
        self.assertIn("application/geo+json", payload_query)
        self.assertEqual(result, "success (1 reports)")


if __name__ == "__main__":
    unittest.main()
