"""Reviewed sites preserve the real house, municipality and original geometry."""
import hashlib
import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs

import httpx
import pytest
from zakb import (
    REVIEWED_PROVIDER_LOCATIONS,
    AddressMismatch,
    MissingStreet,
    address_key,
    calendar_for_address,
    reviewed_provider_location,
)


def test_missing_street_failure_gets_long_catalog_retry_window():
    from datetime import timedelta
    from zakb import item_failure_retry_delay

    assert item_failure_retry_delay(MissingStreet("not listed")) == timedelta(days=7)
    assert item_failure_retry_delay(ValueError("temporary parse issue")) == timedelta(minutes=30)


@pytest.mark.parametrize('key,destination', list(REVIEWED_PROVIDER_LOCATIONS.items()))
@pytest.mark.parametrize('substituted,direct', [(False, False), (True, False), (False, True)])
@pytest.mark.asyncio
async def test_site_mapping_requires_exact_confirmation_and_prefers_direct(key, destination, substituted, direct):
    city, street, number = key
    provider_city, provider_street = (city, street) if direct else destination
    address = {'municipality': city, 'street': street, 'house_number': number, 'latitude': 49.6, 'longitude': 8.4}
    cursor = MagicMock(); cursor.fetchone = AsyncMock(return_value=None)
    conn = MagicMock()
    async def execute(query, params=None):
        cursor.fetchone.return_value = None if query.lstrip().startswith('SELECT') else (1,)
        return cursor
    conn.execute = AsyncMock(side_effect=execute); conn.commit = AsyncMock()
    selected = city
    downloads = []

    def provider(request):
        nonlocal selected
        fields = parse_qs(request.content.decode())
        action = fields.get('submitAction', [''])[0]
        if action == 'CITYCHANGED':
            selected = fields['aos[Ort]'][0]
        if action == 'nextPage':
            assert selected == provider_city
            assert fields['aos[Strasse]'] == [provider_street]
            assert fields['aos[Hausnummer]'] == [number]
            confirmation_number = '999' if substituted else number
            return httpx.Response(200, text=f'<span id="Lageadresse">{provider_street} {confirmation_number}, 68647 {selected}</span><form id="athos-os-form"><input name="pageName" value="Terminliste">filedownload_ICAL</form>')
        if action == 'filedownload_ICAL':
            downloads.append(True)
            return httpx.Response(200, content=b'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:site\r\nDTSTART;VALUE=DATE:20261010\r\nSUMMARY:Bio\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n')
        cities = list(dict.fromkeys([city, destination[0]]))
        options = ''.join(f'<option value="{c}" {"selected" if c == selected else ""}></option>' for c in cities)
        name = provider_street if selected == provider_city else 'Andere Straße'
        return httpx.Response(200, text=f'<form id="athos-os-form"><input name="pageName" value="Lageadresse"><select name="aos[Ort]">{options}</select><select name="aos[Strasse]"><option value="{name}"></option></select></form>')

    source = {'id': 'test', 'url': 'https://example.org/calendar', 'interval_seconds': 86400, 'request_spacing_seconds': 0}
    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        if substituted:
            with pytest.raises(AddressMismatch):
                await calendar_for_address(conn, client, source, address, datetime.now(UTC))
            assert not downloads
        else:
            events, _, _, _ = await calendar_for_address(conn, client, source, address, datetime.now(UTC))
            assert downloads == [True]
            assert all(events[0][k] == v for k, v in address.items())


@pytest.mark.parametrize('city,street,number', [
    ('Biblis', 'Außerhalb', '7'), ('Biblis', 'Außerhalb', '6A'),
    ('Bürstadt', 'Außerhalb', '6'), ('Biblis', 'Außerhalb (Nordheim)', '10A'),
    ('Biblis', 'Am Wadowski See', '1'), ('Biblis', 'Berliner Weg', '1B'),
])
def test_unreviewed_addresses_keep_original_checkpoint_contract(city, street, number):
    address = {'municipality': city, 'street': street, 'house_number': number}
    assert reviewed_provider_location(address) is None
    contract = 'zakb-house-suffix-v1' if number[-1].isalpha() else 'zakb-address-v2'
    identity = [contract, 'https://example.org/calendar', city, street, number]
    assert address_key({'url': identity[1]}, address) == hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()


@pytest.mark.asyncio
async def test_renamed_duplicate_house_numbers_are_not_an_alias():
    conn = MagicMock(); cursor = MagicMock(); cursor.fetchone = AsyncMock(return_value=None)
    async def execute(query, params=None):
        cursor.fetchone.return_value = None if query.lstrip().startswith('SELECT') else (1,)
        return cursor
    conn.execute = AsyncMock(side_effect=execute); conn.commit = AsyncMock()
    def provider(request):
        assert parse_qs(request.content.decode()).get('submitAction') != ['nextPage']
        return httpx.Response(200, text='<form id="athos-os-form"><input name="pageName" value="Lageadresse"><select name="aos[Ort]"><option selected value="Biblis"></option></select><select name="aos[Strasse]"><option value="Im Rohrbusch"></option></select></form>')
    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        with pytest.raises(MissingStreet):
            await calendar_for_address(conn, client, {'id': 'test', 'url': 'https://example.org/calendar', 'interval_seconds': 86400, 'request_spacing_seconds': 0}, {'municipality': 'Biblis', 'street': 'Am Wadowski See', 'house_number': '1'}, datetime.now(UTC))
