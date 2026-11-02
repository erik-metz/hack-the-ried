"""Original TC74 invitation/poster and safe failure before publication."""

from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from db_support import DatabaseCase
from test_club_events import SOURCES
from verified_club_notice import import_verified_club_notice, verified_event

SOURCE = SOURCES["tc74-saisonabschluss-2026"]
FIXTURES = Path(__file__).parent / "fixtures/events"
BODY = (FIXTURES / "tc74-saisonabschluss.html").read_text()
POSTER = (FIXTURES / "tc74-saisonabschluss.jpg").read_bytes()
VENUE = (FIXTURES / "tc74-venue.html").read_text()
NOW = datetime(2026, 10, 8, tzinfo=UTC)


def test_actual_notice_and_original_poster_preserve_verified_programme():
    event = verified_event(BODY, POSTER, VENUE, SOURCE, NOW)
    assert event["start_time"] == "2026-10-11T10:00:00+02:00"
    assert event["end_time"] is None and not event["is_free"]
    assert "12:30" in event["description"] and "Hüpfburg" in event["description"]
    assert (
        event["municipality"] == "Groß-Rohrheim"
        and event["street_address"] == "An der Fohlenweide"
    )
    assert event["status"] == "scheduled"
    assert (
        verified_event(BODY, POSTER, VENUE, SOURCE, datetime(2026, 10, 12, tzinfo=UTC))[
            "status"
        ]
        == "past"
    )


@pytest.mark.parametrize(
    "html,poster,venue",
    [
        (BODY.replace("11.10.2026", "18.10.2026"), POSTER, VENUE),
        (BODY.replace("herzlich willkommen", "nicht eingeladen"), POSTER, VENUE),
        (BODY.replace('itemprop="image"', 'itemprop="other"'), POSTER, VENUE),
        (BODY, POSTER + b"changed", VENUE),
        (BODY, POSTER, VENUE.replace("68649 Gross-Rohrheim", "64283 Darmstadt")),
    ],
)
def test_changed_notice_poster_or_venue_requires_new_verification(html, poster, venue):
    with pytest.raises(ValueError):
        verified_event(html, poster, venue, SOURCE, NOW)


class VerifiedClubNoticeDatabaseTests(DatabaseCase):
    async def test_archived_originals_and_mapping_replay_without_duplicates(self):
        def response(request):
            if str(request.url) == SOURCE["url"]:
                return httpx.Response(200, text=BODY)
            if str(request.url) == SOURCE["poster_url"]:
                return httpx.Response(
                    200, content=POSTER, headers={"content-type": "image/jpeg"}
                )
            assert str(request.url) == SOURCE["venue_url"]
            return httpx.Response(200, text=VENUE)

        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            await import_verified_club_notice(self.conn, client, SOURCE)
            await import_verified_club_notice(self.conn, client, SOURCE)
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 1)
        self.assertEqual(
            await self.scalar("SELECT count(*) FROM collected_payloads"), 4
        )
        data = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset='social/events'"
        )
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["source_events"][0]["source"], SOURCE["id"])
        self.assertEqual(await self.scalar('SELECT count(*) FROM collected_payloads WHERE body IS NOT NULL'),0)
        self.assertEqual(len(data),1)

        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collection_attempts WHERE status='success'"
            ),
            6,
        )

        def changed(request):
            if str(request.url) == SOURCE["poster_url"]:
                return httpx.Response(200, content=POSTER + b"changed")
            return response(request)

        async with httpx.AsyncClient(transport=httpx.MockTransport(changed)) as client:
            with self.assertRaises(ValueError):
                await import_verified_club_notice(self.conn, client, SOURCE)
        self.assertEqual(
            await self.scalar(
                "SELECT data FROM collected_datasets WHERE dataset='social/events'"
            ),
            data,
        )
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 1)
