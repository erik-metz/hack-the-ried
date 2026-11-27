"""ZAKB preselects next year's calendar in late autumn; the current year must still be read."""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs

import httpx
import pytest
from zakb import calendar_for_address, calendar_periods

NOW = datetime(2026, 11, 27, 9, tzinfo=UTC)


def test_periods_from_current_year_only():
    offered = ['Jahresübersicht 2025', 'Jahresübersicht 2026', 'Jahresübersicht 2027', 'Jahresübersicht 2027']
    assert calendar_periods(offered, NOW) == ['Jahresübersicht 2026', 'Jahresübersicht 2027']
    assert calendar_periods([], NOW) == [None]
    assert calendar_periods(['Jahresübersicht 2025'], NOW) == [None]


def ical(day, fraction='Restabfallbehaelter'):
    return (f'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:{day}\r\nDTSTART;VALUE=DATE:{day}\r\n'
            f'SUMMARY:{fraction}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n').encode()


@pytest.mark.asyncio
async def test_every_offered_year_is_downloaded_and_merged():
    conn = MagicMock()
    cursor = MagicMock(); cursor.fetchone = AsyncMock(return_value=None)
    async def execute(query, params=None):
        cursor.fetchone.return_value = None if query.lstrip().startswith('SELECT') else (1,)
        return cursor
    conn.execute = AsyncMock(side_effect=execute); conn.commit = AsyncMock()
    selected, downloads = None, []
    radios = ''.join(f'<input type="radio" name="aos[Zeitraum]" value="Jahresübersicht {y}" {"checked" if y == 2027 else ""}>'
                     for y in (2026, 2027))

    def provider(request):
        nonlocal selected
        fields = parse_qs(request.content.decode())
        action = fields.get('submitAction', [''])[0]
        if action == 'nextPage':
            selected = fields['aos[Zeitraum]'][0]
            return httpx.Response(200, text='<span id="Lageadresse">Weidenweg 6, 68642 Bürstadt</span><form id="athos-os-form"><input name="pageName" value="Terminliste">filedownload_ICAL</form>')
        if action == 'filedownload_ICAL':
            downloads.append(selected)
            return httpx.Response(200, content=ical('20261208') if selected.endswith('2026') else ical('20270104'))
        return httpx.Response(200, text=f'<form id="athos-os-form"><select name="aos[Ort]"><option value="Bürstadt" selected></option></select><select name="aos[Strasse]"><option value="Weidenweg"></option></select>{radios}</form>')

    source = {'id': 'test', 'url': 'https://example.org/calendar', 'interval_seconds': 86400, 'request_spacing_seconds': 0}
    address = {'municipality': 'Bürstadt', 'street': 'Weidenweg', 'house_number': '6'}
    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        events, digest, _, cached = await calendar_for_address(conn, client, source, address, NOW)
    assert downloads == ['Jahresübersicht 2026', 'Jahresübersicht 2027']
    assert [e['date'] for e in events] == ['2026-12-08', '2027-01-04']
    assert not cached and len(digest) == 64
