"""Discovery archives metadata only; synthetic candidates are not verified media."""

import copy
import json
import sys
import unittest
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tests"))
from autobahn_inventory import import_autobahn_inventory, parse_inventory
from db_support import DatabaseCase

SCOPE = {
    "id": "test-webcam-discovery",
    "road": "A67",
    "kind": "webcam",
    "url": "https://verkehr.autobahn.de/o/autobahn/A67/services/webcam",
    "bbox": [49.45, 8.25, 49.9, 8.75],
    "max_age_seconds": 259200,
}
CAMERA = {
    "identifier": "synthetic-camera",
    "coordinate": {"lat": "49.64", "long": "8.55"},
    "title": "A67 | Testkamera",
    "subtitle": "Blickrichtung Nord",
    "operator": "Test",
    "imageurl": "https://example.org/camera.jpg?version=1",
    "linkurl": "https://example.org/player.html",
    "isBlocked": "false",
    "future": False,
    "description": [],
}


class WebcamTests(unittest.TestCase):
    def test_manifest_and_real_empty_evidence(self):
        from runner import sources

        scopes = [
            s
            for s in sources()
            if s["adapter"] == "autobahn-inventory" and s["kind"] == "webcam"
        ]
        self.assertEqual({s["road"] for s in scopes}, {"A67", "A5", "A6"})
        self.assertEqual(len(scopes), 3)
        self.assertTrue(
            all(s["enabled"] and s["interval_seconds"] == 86400 for s in scopes)
        )
        evidence = json.loads(
            (
                Path(__file__).resolve().parents[4]
                / "docs/evidence/autobahn-api-2026-10-09/inventory.json"
            ).read_text()
        )
        for scope in scopes:
            entry = next(
                e
                for e in evidence["endpoints"]
                if e["kind"] == "webcam" and e["road"] == scope["road"]
            )
            self.assertEqual(entry["total"], 0)
            self.assertEqual(parse_inventory({"webcam": []}, scope), [])

    def test_candidates_and_uncertainty(self):
        r = parse_inventory({"webcam": [CAMERA]}, SCOPE)[0]
        self.assertEqual(r["imageUrl"], CAMERA["imageurl"])
        self.assertEqual(r["viewDirection"], "Blickrichtung Nord")
        self.assertEqual(r["imageUrlHint"], "snapshot_candidate")
        self.assertEqual(r["linkUrlHint"], "player_page_candidate")
        self.assertEqual(r["probeStatus"], "needs_probe")
        self.assertFalse(r["mediaVerified"])
        self.assertIsNone(r["captureTime"])
        self.assertIsNone(r["updateIntervalSeconds"])
        self.assertEqual(r["archiveStatus"], "not_started")
        self.assertEqual(r["raw"], CAMERA)
        for url, hint in [
            ("https://example.org/live.m3u8", "stream_or_video_candidate"),
            ("https://example.org/image", "unknown"),
        ]:
            r = parse_inventory({"webcam": [{**CAMERA, "imageurl": url}]}, SCOPE)[0]
            self.assertEqual(r["imageUrlHint"], hint)
        for url in [
            None,
            "javascript:alert(1)",
            "https://user:secret@example.org/a.jpg",
        ]:
            r = parse_inventory(
                {"webcam": [{**CAMERA, "imageurl": url, "linkurl": None}]}, SCOPE
            )[0]
            self.assertIsNone(r["imageUrl"])
            self.assertEqual(r["probeStatus"], "no_media_reference")
        r = parse_inventory({"webcam": [{**CAMERA, "isBlocked": "true"}]}, SCOPE)[0]
        self.assertEqual(r["probeStatus"], "blocked_or_future")
        outside = {
            **CAMERA,
            "coordinate": {"type": "Point", "coordinates": [6.86, 50.98]},
        }
        self.assertEqual(parse_inventory({"webcam": [outside]}, SCOPE), [])
        with self.assertRaises(TypeError):
            parse_inventory({}, SCOPE)
        malformed = copy.deepcopy(CAMERA)
        malformed["coordinate"]["lat"] = "nan"
        with self.assertRaises(ValueError):
            parse_inventory({"webcam": [malformed]}, SCOPE)


class WebcamDatabaseTests(DatabaseCase):
    async def test_discovery_lifecycle_never_requests_images(self):
        requests = []

        async def run(body, status=200):
            def reply(request):
                requests.append(str(request.url))
                return httpx.Response(status, json=body)

            async with httpx.AsyncClient(
                transport=httpx.MockTransport(reply)
            ) as client:
                await import_autobahn_inventory(self.conn, client, SCOPE)

        dataset = "infrastructure/autobahn/A67/webcams"
        await run({"webcam": []})
        data = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset=%s", (dataset,)
        )
        self.assertEqual(data["discoveryStatus"], "no_regional_cameras")
        self.assertEqual(data["probeRequiredCount"], 0)
        await run({"webcam": [CAMERA]})
        saved = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset=%s", (dataset,)
        )
        self.assertEqual(saved["discoveryStatus"], "candidates_found")
        self.assertEqual(saved["probeRequiredCount"], 1)
        for body, status, error in [
            ({}, 200, TypeError),
            ({"webcam": []}, 503, httpx.HTTPStatusError),
        ]:
            with self.assertRaises(error):
                await run(body, status)
            self.assertEqual(
                await self.scalar(
                    "SELECT data FROM collected_datasets WHERE dataset=%s", (dataset,)
                ),
                saved,
            )
        await run({"webcam": []})
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
        self.assertEqual(requests, [SCOPE["url"]] * 5)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collection_attempts WHERE status='failed'"
            ),
            2,
        )
