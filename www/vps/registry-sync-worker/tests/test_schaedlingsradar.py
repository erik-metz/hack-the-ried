import asyncio
import hashlib
import json
import unittest
from datetime import datetime

from schadlingsradar import (
    BASE_URL,
    DATASET,
    RIED_POSTCODES,
    import_schaedlingsradar,
    parse_aggregate,
)


class SchadlingsradarTests(unittest.TestCase):
    def test_source_is_scheduled_daily(self):
        from pathlib import Path

        manifest = json.loads((Path(__file__).parents[1] / "sources.json").read_text())
        source = next(item for item in manifest["sources"] if item["id"] == "schadlingsradar-ried")
        self.assertEqual(source["interval_seconds"], 24 * 60 * 60)
        self.assertEqual(source["max_age_seconds"], 2 * 24 * 60 * 60)

    def test_added_bergstrasse_postcodes_are_covered(self):
        self.assertEqual(
            {item["postcode"] for item in RIED_POSTCODES},
            {"68623", "68642", "68647", "68649", "64560", "64579", "64584", "64589",
             "64653", "64683", "64625", "64646"},
        )
        self.assertEqual(
            {item["name"] for item in RIED_POSTCODES if item["postcode"] in {"64653", "64683", "64625", "64646"}},
            {"Lorsch", "Einhausen", "Bensheim", "Heppenheim"},
        )

    def test_parse_keeps_only_validated_period_counts(self):
        parsed = parse_aggregate(
            {
                "generated": "2026-10-27T14:30:01+01:00",
                "demo": False,
                "name": "68642 Bürstadt",
                "arten": {
                    "ratten": {
                        "d7": 1,
                        "d30": 3,
                        "d90": 5,
                        "d365": 8,
                        "dalle": 9,
                        "tage": [0, 1],
                        "text": "discard this",
                    },
                    "unknown": {"d30": 999},
                },
            },
            "68642",
        )
        self.assertEqual(parsed["generated"], datetime.fromisoformat("2026-10-27T14:30:01+01:00"))
        self.assertEqual(parsed["reports"], {"ratten": {"d7": 1, "d30": 3, "d90": 5, "d365": 8, "dalle": 9}})

    def test_rejects_demo_data_wrong_postcode_and_invalid_counts(self):
        base = {"generated": "2026-10-27T14:30:01+01:00", "demo": False, "name": "68642 Bürstadt", "arten": {}}
        for payload in (
            {**base, "demo": True},
            {**base, "name": "68623 Lampertheim"},
            {**base, "arten": {"ratten": {"d30": -1}}},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_aggregate(payload, "68642")

    def test_import_publishes_plz_aggregates_without_unneeded_provider_fields(self):
        class Response:
            def __init__(self, postcode):
                self.postcode = postcode

            def json(self):
                return {
                    "generated": "2026-10-27T14:30:01+01:00",
                    "demo": False,
                    "name": f"{self.postcode['postcode']} {self.postcode['name']}",
                    "arten": {"ratten": {"d7": 1, "d30": 2, "d90": 3, "d365": 4, "dalle": 5, "tage": [1, 2]}},
                }

            def raise_for_status(self):
                return None

        class Client:
            async def get(self, url):
                postcode = url.removeprefix(BASE_URL).removesuffix(".json")
                match = next(item for item in RIED_POSTCODES if item["postcode"] == postcode)
                return Response(match)

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
        source = {"id": "schadlingsradar-ried", "url": BASE_URL, "max_age_seconds": 3600}
        result = asyncio.run(import_schaedlingsradar(conn, Client(), source))
        payload_query, payload_params = next(
            (query, params) for query, params in conn.calls if "INSERT INTO collected_payloads" in query
        )
        self.assertEqual(payload_params[0], hashlib.sha256(payload_params[1]).hexdigest())
        published = json.loads(payload_params[1])
        self.assertEqual(published["type"], "FeatureCollection")
        self.assertEqual(len(published["features"]), len(RIED_POSTCODES))
        self.assertEqual(published["features"][1]["properties"]["reports"]["ratten"]["d30"], 2)
        self.assertNotIn(b'"tage"', payload_params[1])
        self.assertIn("INSERT INTO collected_dataset_versions", " ".join(query for query, _ in conn.calls))
        self.assertTrue(
            any(
                "INSERT INTO collected_datasets" in query and params[0] == DATASET
                for query, params in conn.calls
            )
        )
        self.assertIn("application/geo+json", payload_query)
        self.assertEqual(result, "success")


if __name__ == "__main__":
    unittest.main()
