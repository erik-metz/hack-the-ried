"""Exercise provider acquisition through publication with real foreign keys."""

import hashlib
from unittest.mock import patch

import httpx
from club_events import import_club_events
from db_support import DatabaseCase
from test_club_events import SOURCES, FixedClock, fixture


class ClubEventDatabaseTests(DatabaseCase):
    async def check_import(self, source_id, responses, count):
        source = SOURCES[source_id]

        def response(request):
            name = responses[(request.method, request.url.path)]
            return httpx.Response(200, text=fixture(name))

        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            with patch("club_events.datetime", FixedClock):
                await import_club_events(self.conn, client, source)
                await import_club_events(self.conn, client, source)
        self.assertEqual(
            await self.scalar("SELECT count(*) FROM cultural_events"), count
        )
        data = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset='social/events'"
        )
        self.assertEqual(len(data), count)
        self.assertTrue(all(event["source"] == source_id for event in data))
        row = await (
            await self.conn.execute(
                """SELECT p.sha256, p.body FROM collected_datasets d
            JOIN collected_payloads p ON p.sha256=d.payload_sha256
            WHERE d.dataset='social/events'"""
            )
        ).fetchone()
        self.assertIsNone(row[1])
        for name in responses.values():
            digest=hashlib.sha256(fixture(name).encode()).hexdigest()
            self.assertEqual(await self.scalar('SELECT count(*) FROM collected_payloads WHERE sha256=%s AND body IS NULL',(digest,)),1)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collection_attempts WHERE status <> 'success'"
            ),
            0,
        )
        self.assertEqual(
            await self.scalar("SELECT count(*) FROM collected_dataset_versions"), 1
        )

    async def test_single_page_calendar_archives_publication_bundle(self):
        await self.check_import(
            "tv-buerstadt-events", {("GET", "/798-2/"): "tv.html"}, 25
        )

    async def test_multi_page_calendar_keeps_all_payloads_and_replays_without_duplicates(
        self,
    ):
        responses = {("GET", "/"): "sgh-kerwe.html"}
        for path in ("/kerwe/", "/kerwelauf/", "/kinderfasching/", "/maifest/", "/ostereierschiessen/", "/nikolausschiessen/", "/oktoberfest/", "/events-summernight/"):
            name = "lauf" if path == "/kerwelauf/" else path.strip("/")
            responses[("GET", path)] = f"sgh-{name}.html"
        await self.check_import("sg-huettenfeld-events", responses, 11)

    async def test_dynamic_calendar_publishes_rendered_events_with_real_foreign_keys(
        self,
    ):
        await self.check_import(
            "tv-hofheim-events",
            {
                ("GET", "/termine/"): "hofheim-request.html",
                ("POST", "/wp-admin/admin-ajax.php"): "hofheim-calendar.html",
            },
            4,
        )
