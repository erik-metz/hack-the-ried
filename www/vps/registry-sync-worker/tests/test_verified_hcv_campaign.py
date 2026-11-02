from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from db_support import DatabaseCase, payload_digest
from test_club_events import SOURCES
from verified_hcv_campaign import campaign_asset, campaign_events, import_hcv_campaign

FIXTURES = Path(__file__).parent / "fixtures/events"
HTML = (FIXTURES / "hcv-campaign-shell.html").read_text()
SCRIPT = (FIXTURES / "hcv-campaign-fragment.js").read_text()
SOURCE = SOURCES["hcv-buerstadt-campaign"]
NOW = datetime(2026, 10, 9, tzinfo=UTC)


def test_six_reviewed_dates_preserve_distinct_hours_and_unknown_duration():
    events = campaign_events(SCRIPT, SOURCE, NOW)
    assert len(events) == 8
    assert [e["start_time"] for e in events[2:]] == [
        "2026-11-07T18:00:00+01:00", "2027-01-08T19:31:00+01:00",
        "2027-01-09T19:11:00+01:00", "2027-01-15T19:31:00+01:00",
        "2027-01-16T19:11:00+01:00", "2027-02-05T00:00:00+01:00",
    ]
    assert all(e["end_time"] is None for e in events[2:7])
    assert events[-1]["end_time"] == "2027-02-05T23:59:59+01:00"
    assert "Beginn unbekannt" in events[-1]["description"]
    assert all(e["municipality"] == "Bürstadt" and not e["is_free"] for e in events)
    assert all("Teilnahmebedingungen" in e["description"] for e in events)
    assert not any("Familienabend" in e["title"] or "Kampagnenabschluss" in e["title"] for e in events)
    assert all(e["status"] == "past" for e in campaign_events(SCRIPT, SOURCE, datetime(2028, 1, 1, tzinfo=UTC)))






def test_unrelated_script_changes_do_not_modify_reviewed_events():
    assert campaign_events("/* new UI */" + SCRIPT + ";otherCode()", SOURCE, NOW) == campaign_events(SCRIPT, SOURCE, NOW)


@pytest.mark.parametrize("src", ["https://evil.example/assets/index-abc.js", "//evil.example/a.js", "/assets/other.js", "/assets/index-abc.js?token=x"])
def test_untrusted_asset_urls_are_rejected(src):
    with pytest.raises(ValueError):
        campaign_asset('<script type="module" src="' + src + '"></script>', SOURCE["url"])


def test_only_one_same_origin_module_is_accepted():
    assert campaign_asset(HTML, SOURCE["url"]) == "https://hcv-buerstadt.de/assets/index-BfWpZkku.js"
    with pytest.raises(ValueError):
        campaign_asset(HTML + HTML, SOURCE["url"])


class CampaignDatabaseTests(DatabaseCase):
    async def test_repeated_import_archives_both_originals_and_keeps_last_good_data(self):
        script = SCRIPT
        def respond(request):
            return httpx.Response(200, text=HTML if str(request.url) == SOURCE["url"] else script)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            for _ in range(2):
                await import_hcv_campaign(self.conn, client, SOURCE)
            self.assertEqual(await self.scalar("SELECT count(*) FROM cultural_events"), 8)
            data = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='social/events'")
            self.assertEqual(len(data), 8)
            bodies = await self.conn.execute("SELECT sha256 FROM collected_payloads")
            archived = [row[0] for row in await bodies.fetchall()]
            self.assertIn(payload_digest(HTML), archived)
            self.assertIn(payload_digest(SCRIPT), archived)
            script = SCRIPT.replace("19:31", "25:31")
            with self.assertRaises(ValueError):
                await import_hcv_campaign(self.conn, client, SOURCE)
            self.assertEqual(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='social/events'"), data)
