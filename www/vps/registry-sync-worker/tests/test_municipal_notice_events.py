"""Official municipal notice: explicit local dates, conservative failure handling."""

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from db_support import DatabaseCase
from municipal_notice_events import import_municipal_notice_events, notice_events
from test_club_events import SOURCES

SOURCE = SOURCES["gross-rohrheim-community-notice-events"]
BODY = (
    Path(__file__).parent / "fixtures/events/gross-rohrheim-community-notice.html"
).read_text()
NOW = datetime(2026, 10, 8, tzinfo=UTC)


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW if tz else NOW.replace(tzinfo=None)


def test_official_notice_preserves_local_dates_without_inventing_end_or_price():
    events = notice_events(BODY, SOURCE, NOW)
    assert [e["title"] for e in events] == [
        "Arbeitsgruppe Senioren",
        "Vereinsfrühschoppen",
    ]
    assert [e["start_time"] for e in events] == [
        "2026-10-29T17:00:00+01:00",
        "2026-11-01T10:30:00+01:00",
    ]
    assert all(
        e["municipality"] == "Groß-Rohrheim"
        and e["end_time"] is None
        and not e["is_free"]
        for e in events
    )
    assert all(e["status"] == "scheduled" and e["category"] == "civic" for e in events)
    assert events == notice_events(BODY, SOURCE, NOW)


@pytest.mark.parametrize(
    "old,new",
    [
        ("Arbeitsgruppen bei der Gemeinde", "Andere Mitteilung"),
        ('itemprop="articleBody"', 'itemprop="other"'),
        ("29.10.2026", "32.10.2026"),
        ("Weitere interessierte Bürger", "Geschlossene Veranstaltung"),
    ],
)
def test_changed_or_unverified_notice_is_rejected(old, new):
    with pytest.raises(ValueError):
        notice_events(BODY.replace(old, new), SOURCE, NOW)


class MunicipalNoticeDatabaseTests(DatabaseCase):
    async def test_archived_import_replays_without_duplicates_and_failure_keeps_good_data(
        self,
    ):
        with patch("municipal_notice_events.datetime", FrozenDateTime):
            async with httpx.AsyncClient(
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(200, text=BODY)
                )
            ) as client:
                await import_municipal_notice_events(self.conn, client, SOURCE)
                await import_municipal_notice_events(self.conn, client, SOURCE)
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 2)
        data = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset='social/events'"
        )
        self.assertEqual(len(data), 2)
        self.assertTrue(
            all(
                e["end_time"] is None
                and e["source_events"][0]["source"] == SOURCE["id"]
                for e in data
            )
        )
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collection_attempts WHERE status='success'"
            ),
            2,
        )
        with patch(
            "municipal_notice_events.acquire",
            AsyncMock(
                return_value=(
                    httpx.Response(
                        200, text=BODY.replace('itemprop="articleBody"', 'itemprop="other"')
                    ),
                    "unused",
                    1,
                )
            ),
        ), self.assertRaises(ValueError):
            await import_municipal_notice_events(self.conn, None, SOURCE)
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 2)
        self.assertEqual(
            await self.scalar(
                "SELECT data FROM collected_datasets WHERE dataset='social/events'"
            ),
            data,
        )
