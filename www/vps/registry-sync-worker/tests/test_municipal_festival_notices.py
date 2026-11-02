from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from adapters import sync_cultural_events_to_db_and_publish
from db_support import DatabaseCase, payload_digest
from long_term_events import import_long_term_events
from municipal_festival_notices import (
    import_municipal_festival_notice,
    municipal_festival_notice,
)
from test_club_events import SOURCES
from test_long_term_events import BODY as GROSS_BODY

NOW = datetime(2026, 10, 9, tzinfo=UTC)
FIXTURES = Path(__file__).parent / "fixtures/events"
CASES = [
    ("wanderung", "2027-04-25", "2027-04-25", "Gemarkung"),
    ("spargelfest", "2027-06-11", "2027-06-13", "Innenstadtfest"),
    ("howwemer", "2027-09-10", "2027-09-14", "Gartenstraße"),
    ("kerwe", "2027-09-11", "2027-09-13", "Römerstraße"),
]


def source_for(key):
    return SOURCES["lampertheim-" + key + "-festival-notice"]


def body_for(key):
    return (FIXTURES / ("lampertheim-" + key + "-2027.html")).read_text()


@pytest.mark.parametrize("key,first,last,venue", CASES)
def test_published_dates_preserve_all_days_and_unknown_hours(key, first, last, venue):
    event = municipal_festival_notice(body_for(key), source_for(key), NOW)
    assert event["start_time"] == first + "T00:00:00+02:00"
    assert event["end_time"] == last + "T23:59:59+02:00"
    assert event["municipality"] == "Lampertheim" and not event["is_free"]
    assert (
        "Tagesgrenzen" in event["description"]
        and "Eintrittspreise" in event["description"]
    )
    assert event["event_url"] == source_for(key)["url"]
    assert not {"ticket_url", "street_address", "postal_code"} & event.keys()
    assert event["status"] == "scheduled"
    assert (
        municipal_festival_notice(
            body_for(key), source_for(key), datetime(2028, 1, 1, tzinfo=UTC)
        )["status"]
        == "past"
    )






class MunicipalFestivalDatabaseTests(DatabaseCase):
    async def test_replay_preserves_other_town_deduplicates_and_archives_all_originals(
        self,
    ):
        bodies = {source_for(key)["url"]: body_for(key) for key, *_ in CASES}
        bodies[SOURCES["gross-rohrheim-long-term-events"]["url"]] = GROSS_BODY
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, text=bodies[str(request.url)])
            )
        ) as client:
            await import_long_term_events(
                self.conn, client, SOURCES["gross-rohrheim-long-term-events"]
            )
            for _ in range(2):
                for key, *_ in CASES:
                    await import_municipal_festival_notice(
                        self.conn, client, source_for(key)
                    )
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 6)
        source = source_for("wanderung")
        event = municipal_festival_notice(body_for("wanderung"), source, NOW)
        digest = await self.scalar(
            "SELECT payload_sha256 FROM collection_attempts WHERE source_id=%s ORDER BY id DESC LIMIT 1",
            (source["id"],),
        )
        duplicate = event | {
            "id": "existing-municipal-wanderung",
            "source": "existing-municipal",
        }
        async with self.conn.transaction():
            await sync_cultural_events_to_db_and_publish(
                self.conn, source, [duplicate], digest, datetime.now(UTC)
            )
        data = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset='social/events'"
        )
        self.assertEqual(len(data), 6)
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 7)
        merged = next(e for e in data if e["title"] == "Spargelwanderung")
        self.assertEqual(len(merged["source_events"]), 2)
        self.assertEqual(
            {e["source"] for e in merged["source_events"]},
            {source["id"], "existing-municipal"},
        )
        for key, *_ in CASES:
            archived = await self.scalar(
                "SELECT p.sha256 FROM collected_payloads p JOIN collection_attempts a ON a.payload_sha256=p.sha256 WHERE a.source_id=%s ORDER BY a.id DESC LIMIT 1",
                (source_for(key)["id"],),
            )
            self.assertEqual(archived, payload_digest(body_for(key)))
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200, text=body_for("kerwe").replace("<h1>", "<h2>").replace("</h1>", "</h2>")
                )
            )
        ) as client:
            with self.assertRaises(ValueError):
                await import_municipal_festival_notice(
                    self.conn, client, source_for("kerwe")
                )
        self.assertEqual(
            await self.scalar(
                "SELECT data FROM collected_datasets WHERE dataset='social/events'"
            ),
            data,
        )
