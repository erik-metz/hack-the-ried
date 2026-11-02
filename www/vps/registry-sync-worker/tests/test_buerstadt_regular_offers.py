from pathlib import Path

import httpx
from db_support import DatabaseCase, payload_digest
from regular_offers import (
    buerstadt_lauftreff,
    import_buerstadt_lauftreff,
    import_tv_lauftreff,
)
from test_club_events import SOURCES
from test_regular_offers import BODY as GROSS_BODY

SOURCE = SOURCES["tv-buerstadt-lauftreff"]
BODY = (
    Path(__file__).parent / "fixtures/events/tv-buerstadt-lauftreff.html"
).read_text()


def test_verified_tuesday_only_without_other_occurrences_or_price():
    offers = buerstadt_lauftreff(BODY, SOURCE)
    assert len(offers) == 1
    offer = offers[0]
    assert (offer["weekday"], offer["start_local"], offer["municipality"]) == (
        "Dienstag",
        "18:00",
        "Bürstadt",
    )
    assert "Wasserwerkstraße" in offer["venue_name"]
    assert "Bescheid geben" in offer["description"]
    assert not {"start_time", "end_time", "is_free"} & offer.keys()




class IndependentOfferDatabaseTests(DatabaseCase):
    async def test_two_sources_replay_and_failed_update_preserve_other_source(self):
        def response(request):
            return httpx.Response(
                200, text=BODY if str(request.url) == SOURCE["url"] else GROSS_BODY
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            await import_tv_lauftreff(
                self.conn, client, SOURCES["tv-gross-rohrheim-lauftreff"]
            )
            await import_buerstadt_lauftreff(self.conn, client, SOURCE)
            await import_buerstadt_lauftreff(self.conn, client, SOURCE)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collected_datasets WHERE dataset LIKE 'social/regular-offers/%%'"
            ),
            2,
        )
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 0)
        gross = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset='social/regular-offers/tv-gross-rohrheim-lauftreff'"
        )
        b = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset='social/regular-offers/tv-buerstadt-lauftreff'"
        )
        self.assertEqual(len(b), 1)
        self.assertEqual(
            await self.scalar(
                "SELECT p.sha256 FROM collected_payloads p JOIN collected_datasets d ON d.payload_sha256=p.sha256 WHERE d.dataset='social/regular-offers/tv-buerstadt-lauftreff'"
            ),
            payload_digest(BODY),
        )
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200, text=BODY.replace("Trainingszeiten Lauftreff", "Archiv")
                )
            )
        ) as client:
            with self.assertRaises(ValueError):
                await import_buerstadt_lauftreff(self.conn, client, SOURCE)
        self.assertEqual(
            await self.scalar(
                "SELECT data FROM collected_datasets WHERE dataset='social/regular-offers/tv-gross-rohrheim-lauftreff'"
            ),
            gross,
        )
        self.assertEqual(
            await self.scalar(
                "SELECT data FROM collected_datasets WHERE dataset='social/regular-offers/tv-buerstadt-lauftreff'"
            ),
            b,
        )
