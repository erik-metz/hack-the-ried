from pathlib import Path

import httpx
import pytest
from db_support import DatabaseCase, payload_digest
from regular_offers import import_rompin_stompin, import_tv_lauftreff, rompin_stompin
from test_club_events import SOURCES
from test_regular_offers import BODY as GROSS_BODY

SOURCE = SOURCES["rompin-stompin-regular-offers"]
BODY = (
    Path(__file__).parent / "fixtures/events/rompin-stompin-courses.html"
).read_text()


def test_verified_courses_preserve_town_times_venues_and_unknown_participation():
    offers = rompin_stompin(BODY, SOURCE)
    assert len(offers) == len({o["id"] for o in offers}) == 10
    assert [o["municipality"] for o in offers].count("Biblis") == 4
    assert [o["municipality"] for o in offers].count("Bürstadt") == 6
    assert {
        (o["start_local"], o["end_local"])
        for o in offers
        if o["municipality"] == "Biblis"
    } == {
        ("10:00", "11:00"),
        ("18:00", "19:00"),
        ("19:00", "20:00"),
        ("20:00", "21:00"),
    }
    assert all(o["weekday"] in {"Montag", "Dienstag", "Donnerstag"} for o in offers)
    assert all("Einhausen" not in o["venue_name"] for o in offers)
    assert all(not {"start_time", "end_time", "is_free"} & o.keys() for o in offers)
    assert all("freie Plätze" in o["description"] for o in offers)




def test_duplicate_course_is_rejected():
    with pytest.raises(ValueError):
        rompin_stompin(BODY + BODY, SOURCE)


class RompinOfferDatabaseTests(DatabaseCase):
    async def test_replay_and_failed_update_preserve_other_club(self):
        def response(request):
            if str(request.url) == SOURCE["url"]:
                assert request.headers["user-agent"] == SOURCE["headers"]["User-Agent"]
            return httpx.Response(
                200, text=BODY if str(request.url) == SOURCE["url"] else GROSS_BODY
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            await import_tv_lauftreff(
                self.conn, client, SOURCES["tv-gross-rohrheim-lauftreff"]
            )
            await import_rompin_stompin(self.conn, client, SOURCE)
            await import_rompin_stompin(self.conn, client, SOURCE)
        data = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset='social/regular-offers/rompin-stompin-regular-offers'"
        )
        self.assertEqual(len(data), 10)
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 0)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collected_datasets WHERE dataset LIKE 'social/regular-offers/%%'"
            ),
            2,
        )
        self.assertEqual(
            await self.scalar(
                "SELECT p.sha256 FROM collected_payloads p JOIN collected_datasets d ON d.payload_sha256=p.sha256 WHERE d.dataset='social/regular-offers/rompin-stompin-regular-offers'"
            ),
            payload_digest(BODY),
        )
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200, text=BODY.replace("Unser Kursangebot", "Archiv")
                )
            )
        ) as client:
            with self.assertRaises(ValueError):
                await import_rompin_stompin(self.conn, client, SOURCE)
        self.assertEqual(
            await self.scalar(
                "SELECT data FROM collected_datasets WHERE dataset='social/regular-offers/rompin-stompin-regular-offers'"
            ),
            data,
        )
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collected_datasets WHERE dataset='social/regular-offers/tv-gross-rohrheim-lauftreff'"
            ),
            1,
        )
