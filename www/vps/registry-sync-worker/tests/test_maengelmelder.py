import unittest

from maengelmelder import BOUNDS, parse_geojson


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


if __name__ == "__main__":
    unittest.main()
