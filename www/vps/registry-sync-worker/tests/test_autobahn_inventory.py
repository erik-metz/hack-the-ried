"""Real provider fixtures and failure-safe durable infrastructure publication."""

import copy
import json
import sys
import unittest
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tests"))
from autobahn_inventory import import_autobahn_inventory, parse_inventory
from db_support import DatabaseCase

EVIDENCE = json.loads(
    (
        Path(__file__).resolve().parents[4]
        / "docs/evidence/autobahn-api-2026-10-09/inventory.json"
    ).read_text()
)


def source(road="A67", kind="electric_charging_station"):
    return {
        "id": f"inventory-{road}-{kind}",
        "road": road,
        "kind": kind,
        "url": f"https://verkehr.autobahn.de/o/autobahn/{road}/services/{kind}",
        "bbox": [49.45, 8.25, 49.9, 8.75],
        "max_age_seconds": 259200,
    }


def fixture(scope):
    return {
        scope["kind"]: next(
            e["regional_inventory"]
            for e in EVIDENCE["endpoints"]
            if e["road"] == scope["road"] and e["kind"] == scope["kind"]
        )
    }


class InventoryTests(unittest.TestCase):
    def test_standard_manifest_enables_six_independent_daily_scopes(self):
        from runner import ADAPTERS, sources

        scopes = [
            s
            for s in sources()
            if s["adapter"] == "autobahn-inventory" and s["kind"] != "webcam"
        ]
        self.assertEqual(len(scopes), 6)
        self.assertIs(ADAPTERS["autobahn-inventory"], import_autobahn_inventory)
        self.assertEqual(
            {(s["road"], s["kind"]) for s in scopes},
            {
                (road, kind)
                for road in ["A67", "A5", "A6"]
                for kind in ["electric_charging_station", "parking_lorry"]
            },
        )
        self.assertTrue(
            all(
                s["enabled"]
                and s["group"] == "infrastructure"
                and s["interval_seconds"] == 86400
                for s in scopes
            )
        )

    def test_real_regional_inventory_and_point_counts(self):
        totals = {}
        for kind in ["electric_charging_station", "parking_lorry"]:
            records = [
                r
                for road in ["A67", "A5", "A6"]
                for r in parse_inventory(
                    fixture(source(road, kind)), source(road, kind)
                )
            ]
            totals[kind] = len(records)
            self.assertEqual(len({r["id"] for r in records}), len(records))
            self.assertTrue(all(r["sourceUpdatedAt"] is None for r in records))
        self.assertEqual(totals, {"electric_charging_station": 11, "parking_lorry": 26})
        stations = parse_inventory(fixture(source()), source())
        self.assertEqual(stations[0]["totalPoints"], 2)
        self.assertEqual(stations[0]["maxPointPowerKw"], 300)
        self.assertEqual(len(stations[0]["chargingPoints"][1]["connectorTypes"]), 2)
        self.assertIsNone(stations[0]["availablePoints"])
        self.assertEqual(stations[0]["direction"], "Mannheim")
        parking = source(kind="parking_lorry")
        records = parse_inventory(fixture(parking), parking)
        self.assertTrue(any(r["carCapacity"] == 0 for r in records))
        self.assertTrue(all(r["availableLorrySpaces"] is None for r in records))
        self.assertTrue(all(r["direction"] is None for r in records))

    def test_unknowns_validation_empty_and_duplicates(self):
        scope = source()
        self.assertEqual(parse_inventory({scope["kind"]: []}, scope), [])
        for bad in [{}, {scope["kind"]: None}, {scope["kind"]: [None]}]:
            with self.assertRaises((ValueError, TypeError)):
                parse_inventory(bad, scope)
        item = copy.deepcopy(fixture(scope)[scope["kind"]][0])
        item["description"] = []
        item["isBlocked"] = "unknown"
        records = parse_inventory({scope["kind"]: [item, item]}, scope)
        self.assertEqual(len(records), 1)
        self.assertIsNone(records[0]["totalPoints"])
        self.assertIsNone(records[0]["providerBlocked"])
        other = {**item, "title": "Changed"}
        with self.assertRaises(ValueError):
            parse_inventory({scope["kind"]: [item, other]}, scope)
        item["coordinate"] = {"lat": "nan", "long": 8.5}
        with self.assertRaises(ValueError):
            parse_inventory({scope["kind"]: [item]}, scope)


class InventoryDatabaseTests(DatabaseCase):
    async def test_archive_history_failed_import_and_empty_snapshot(self):
        scope = source()
        body = fixture(scope)

        async def run(payload, code=200):
            async with httpx.AsyncClient(
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(code, json=payload)
                )
            ) as client:
                await import_autobahn_inventory(self.conn, client, scope)

        await run(body)
        dataset = "infrastructure/autobahn/A67/charging"
        saved = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset=%s", (dataset,)
        )
        self.assertEqual(len(saved["records"]), 8)
        self.assertEqual(saved["timestampBasis"], "collector_observed")
        self.assertIsNone(saved["sourceUpdatedAt"])
        archived = await self.scalar("SELECT body FROM collected_payloads LIMIT 1")
        self.assertIsNone(archived)
        self.assertGreater(await self.scalar("SELECT size_bytes FROM collected_payloads LIMIT 1"),0)
        for payload, code, error in [
            ({}, 200, TypeError),
            (body, 503, httpx.HTTPStatusError),
        ]:
            with self.assertRaises(error):
                await run(payload, code)
            self.assertEqual(
                await self.scalar(
                    "SELECT data FROM collected_datasets WHERE dataset=%s", (dataset,)
                ),
                saved,
            )
        # The existing read API exposes this separate provider inventory without
        # replacing BNetzA data or pretending the receipt time is a provider date.
        from contextlib import asynccontextmanager
        from unittest.mock import MagicMock

        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api/v1"))
        from endpoints.collected import dataset_publication
        from fastapi import HTTPException
        from psycopg.rows import dict_row, tuple_row
        from starlette.requests import Request

        self.conn.row_factory = dict_row

        @asynccontextmanager
        async def connection():
            yield self.conn

        pool = MagicMock()
        pool.connection = connection
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [],
                "query_string": b"",
            }
        )
        response = await dataset_publication(dataset, request, pool)
        self.assertEqual(json.loads(response.body), saved)
        self.assertIn("x-inventory-observed-at", response.headers)
        self.assertNotIn("x-source-updated-at", response.headers)
        await self.conn.execute(
            "UPDATE collected_datasets SET expires_at=NOW()-INTERVAL '1 second' WHERE dataset=%s",
            (dataset,),
        )
        with self.assertRaises(HTTPException) as error:
            await dataset_publication(dataset, request, pool)
        self.assertEqual(error.exception.status_code, 503)
        self.conn.row_factory = tuple_row
        await run({scope["kind"]: []})
        self.assertEqual(
            (
                await self.scalar(
                    "SELECT data FROM collected_datasets WHERE dataset=%s", (dataset,)
                )
            )["records"],
            [],
        )
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collected_dataset_versions WHERE dataset=%s",
                (dataset,),
            ),
            0,
        )
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collection_attempts WHERE status='failed'"
            ),
            2,
        )
