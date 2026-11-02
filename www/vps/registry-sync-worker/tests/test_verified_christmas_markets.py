from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from db_support import DatabaseCase, payload_digest
from test_club_events import SOURCES
from verified_christmas_markets import (
    SOURCE_ID,
    christmas_markets,
    import_christmas_markets,
)

HTML = (Path(__file__).parent / "fixtures/events/lampertheim-district-christmas.html").read_text()
SOURCE = SOURCES[SOURCE_ID]
NOW = datetime(2026, 10, 9, tzinfo=UTC)


def test_daily_openings_do_not_include_overnight_closure():
    all_events = christmas_markets(HTML, SOURCE, NOW)
    events = [e for e in all_events if 'kernstadt-' not in e['id'] and 'neuschloss-' not in e['id']]
    assert [(e['start_time'], e['end_time']) for e in events] == [
        ('2026-12-05T16:00:00+01:00', '2026-12-05T21:00:00+01:00'),
        ('2026-12-06T15:00:00+01:00', '2026-12-06T19:00:00+01:00'),
        ('2026-12-12T15:00:00+01:00', '2026-12-12T21:00:00+01:00'),
    ]
    assert len({e['id'] for e in all_events}) == 9
    assert [e['id'] for e in events] == [SOURCE_ID+'-'+d for d in ('2026-12-05','2026-12-06','2026-12-12')]
    assert all(e['municipality'] == 'Lampertheim' and not e['is_free'] for e in events)
    assert [e['venue_name'] for e in events] == [
        'Rund ums Bürgerhaus Hofheim, Lampertheim-Hofheim',
        'Rund ums Bürgerhaus Hofheim, Lampertheim-Hofheim',
        'Rund ums Bürgerhaus Hüttenfeld, Lampertheim-Hüttenfeld',
    ]
    assert all(e['status'] == 'past' for e in christmas_markets(HTML, SOURCE, datetime(2027, 1, 1, tzinfo=UTC)))




def test_missing_duplicate_and_unexpected_sources_are_rejected():
    for html in ('', HTML + HTML):
        with pytest.raises(ValueError):
            christmas_markets(html, SOURCE, NOW)
    source = deepcopy(SOURCE)
    source['url'] = 'https://example.com/'
    with pytest.raises(ValueError):
        christmas_markets(HTML, source, NOW)


def test_unrelated_market_changes_do_not_import_other_markets():
    assert christmas_markets(HTML.replace('<p>Footer</p>', '<p>Neuer Footer</p>'), SOURCE, NOW) == christmas_markets(HTML, SOURCE, NOW)


class ChristmasDatabaseTests(DatabaseCase):
    async def test_repeated_import_is_idempotent_and_changed_original_keeps_last_good(self):
        html = HTML
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, text=html))) as client:
            for _ in range(2):
                await import_christmas_markets(self.conn, client, SOURCE)
            self.assertEqual(await self.scalar('SELECT count(*) FROM cultural_events'), 9)
            data = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='social/events'")
            self.assertEqual(len(data), 9)
            self.assertEqual(await self.scalar('SELECT count(*) FROM collection_attempts WHERE status=\'success\''), 2)
            self.assertEqual(await self.scalar('SELECT sha256 FROM collected_payloads LIMIT 1'), payload_digest(HTML))
            html = HTML.replace('Öffnungszeiten 2026:', 'Öffnungszeiten:')
            with self.assertRaises(ValueError):
                await import_christmas_markets(self.conn, client, SOURCE)
            self.assertEqual(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='social/events'"), data)


def test_main_market_and_schlosshof_have_exact_daily_windows_and_places():
    events = christmas_markets(HTML, SOURCE, NOW)
    main = [e for e in events if 'kernstadt-' in e['id']]
    castle = [e for e in events if 'neuschloss-' in e['id']]
    assert [(e['start_time'], e['end_time']) for e in main] == [
        ('2026-12-03T17:00:00+01:00', '2026-12-03T22:00:00+01:00'),
        ('2026-12-04T17:00:00+01:00', '2026-12-04T22:00:00+01:00'),
        ('2026-12-05T14:00:00+01:00', '2026-12-05T22:00:00+01:00'),
        ('2026-12-06T14:00:00+01:00', '2026-12-06T20:00:00+01:00'),
    ]
    assert [(e['start_time'], e['end_time']) for e in castle] == [
        ('2026-11-28T15:00:00+01:00', '2026-11-28T22:00:00+01:00'),
        ('2026-11-29T13:00:00+01:00', '2026-11-29T19:00:00+01:00'),
    ]
    assert all('Schillerplatz und Kaiserstraße ab Hausnummer 21' in e['venue_name'] for e in main)
    assert all('Schloßhof Neuschloß' in e['venue_name'] for e in castle)
