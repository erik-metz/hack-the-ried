from pathlib import Path

import httpx
import pytest
from db_support import DatabaseCase, payload_digest
from regular_offers import import_tv_lauftreff, import_tvl_triathlon, tvl_triathlon
from test_club_events import SOURCES
from test_regular_offers import BODY as RUNNING_BODY

SOURCE = SOURCES["tvl-triathlon-regular-offers"]
BODY = (Path(__file__).parent / "fixtures/events/tvl-triathlon.html").read_text()


def test_dynamic_training_includes_published_rad_offer_and_retains_conditions():
    offers = tvl_triathlon(BODY, SOURCE)
    assert len(offers) == 4
    assert any(o["weekday"] == "Sonntag" and o["start_local"] == "10:00" for o in offers)
    assert all(o["municipality"] == "Lampertheim" for o in offers)
    assert any("Oktober - März" in o["description"] for o in offers)
    assert not any("Schwimm" in o["title"] for o in offers)
    assert not any({"start_time", "end_time", "is_free"} & o.keys() for o in offers)


def test_duplicate_schedule_is_rejected():
    with pytest.raises(ValueError):
        tvl_triathlon(BODY + BODY, SOURCE)


class TvlOfferDatabaseTests(DatabaseCase):
    async def test_replay_and_failed_update_preserve_other_clubs_and_archive_source(
        self,
    ):
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    text=BODY if str(request.url) == SOURCE["url"] else RUNNING_BODY,
                )
            )
        ) as client:
            await import_tv_lauftreff(
                self.conn, client, SOURCES["tv-gross-rohrheim-lauftreff"]
            )
            await import_tvl_triathlon(self.conn, client, SOURCE)
            await import_tvl_triathlon(self.conn, client, SOURCE)
        query = "SELECT data FROM collected_datasets WHERE dataset='social/regular-offers/tvl-triathlon-regular-offers'"
        data = await self.scalar(query)
        self.assertEqual(len(data), 4)
        self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 0)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collected_datasets WHERE dataset LIKE 'social/regular-offers/%%'"
            ),
            2,
        )
        self.assertEqual(
            await self.scalar(
                "SELECT p.sha256 FROM collected_payloads p JOIN collected_datasets d ON d.payload_sha256=p.sha256 WHERE d.dataset='social/regular-offers/tvl-triathlon-regular-offers'"
            ),
            payload_digest(BODY),
        )
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200, text=BODY.replace("Trainingszeiten - TVL Triathlon", "Archiv")
                )
            )
        ) as client:
            with self.assertRaises(ValueError):
                await import_tvl_triathlon(self.conn, client, SOURCE)
        self.assertEqual(await self.scalar(query), data)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collected_datasets WHERE dataset='social/regular-offers/tv-gross-rohrheim-lauftreff'"
            ),
            1,
        )
