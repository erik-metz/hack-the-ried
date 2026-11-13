"""Acquisition resume behavior against disposable PostgreSQL schemas."""
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tests"))
from db_support import DatabaseCase
from map_tiles import import_wms
from zakb import address_key, calendar_for_address, import_zakb

ICAL = b'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test\r\nDTSTART;VALUE=DATE:20260925\r\nSUMMARY:Bioabfall\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
FORM = '<form id="athos-os-form"><input name="pageName" value="Lageadresse">filedownload_ICAL</form>'
ADDRESS = {'municipality':'Biblis','street':'Teststraße','house_number':'1','latitude':49.6,'longitude':8.4}
SOURCE = {'id':'zakb-test','url':'https://example.org/calendar','interval_seconds':86400,
          'request_spacing_seconds':0,'municipalities':['Biblis','Bürstadt'],
          'address_url':'https://example.org/addresses','bbox':[49.55,8.3,49.8,8.65]}


def response(request):
    if request.url.path == '/addresses':
        return httpx.Response(200,json={'elements':[{'lat':49.6,'lon':8.4,'tags':{
            'addr:city':'Biblis','addr:street':'Teststraße','addr:housenumber':'1'}}]})
    fields = parse_qs(request.content.decode())
    if fields.get('submitAction') == ['filedownload_ICAL']:
        return httpx.Response(200, content=ICAL)
    if fields.get('submitAction') == ['nextPage']:
        street = fields['aos[Strasse]'][0]
        return httpx.Response(200, text=FORM + f'<span id="Lageadresse">{street} {fields["aos[Hausnummer]"][0]}, 68647 Biblis</span>')
    return httpx.Response(200, text='<form id="athos-os-form"><input name="pageName" value="Lageadresse"><select name="aos[Ort]"><option selected value="Biblis">Biblis</option></select><select name="aos[Strasse]">' + ''.join(f'<option value="{s}">{s}</option>' for s in ['Teststraße','First','Second']) + '</select></form>')


class ResumeTests(DatabaseCase):
    async def test_calendar_uses_published_inventory_without_overpass(self):
        from publications import publish
        inventory = {'elements': [{'lat':49.6,'lon':8.4,'tags':{
            'addr:city':'Biblis','addr:street':'Teststraße','addr:housenumber':'1'}}]}
        digest = 'a' * 64
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,'test','application/json')", (digest,))
        await publish(self.conn, SOURCE, 'waste/address-inventory', inventory, digest, datetime.now(UTC))
        calls = []
        def calendar_only(request):
            calls.append(request.url.path)
            self.assertEqual(request.url.path, '/calendar')
            return response(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(calendar_only)) as client:
            await import_zakb(self.conn, client, {**SOURCE, 'address_dataset':'waste/address-inventory'})
        self.assertTrue(calls)
        self.assertIsNotNone(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'"))
        await self.conn.execute("UPDATE collected_datasets SET expires_at=NOW()-INTERVAL '1 hour' WHERE dataset='waste/address-inventory'")
        async with httpx.AsyncClient(transport=httpx.MockTransport(calendar_only)) as client:
            with self.assertRaisesRegex(ValueError, 'fresh inventory'):
                await import_zakb(self.conn, client, {**SOURCE, 'address_dataset':'waste/address-inventory'})

    async def test_address_checkpoint_survives_restart_but_expires(self):
        requests = []
        def provider(request):
            requests.append(request)
            return response(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            now = datetime.now(UTC)
            events, digest, fetched, reused = await calendar_for_address(self.conn,client,SOURCE,ADDRESS,now)
            self.assertFalse(reused)
            self.assertEqual(len(requests),4)
            again = await calendar_for_address(self.conn,client,SOURCE,ADDRESS,datetime.now(UTC))
            self.assertTrue(again[3])
            self.assertEqual(again[:3],(events,digest,fetched))
            self.assertEqual(len(requests),4)
            await self.conn.execute("UPDATE collection_checkpoints SET fetched_at=%s",(now-timedelta(days=2),))
            self.assertFalse((await calendar_for_address(self.conn,client,SOURCE,ADDRESS,datetime.now(UTC)))[3])
            self.assertEqual(len(requests),8)

    async def test_failed_run_preserves_calendar_and_reports_missing_municipalities(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            self.assertEqual(await import_zakb(self.conn,client,SOURCE),'partial')
        calendar = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'")
        coverage = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/coverage'")
        self.assertFalse(coverage['complete_address_coverage'])
        self.assertEqual(coverage['municipalities']['Bürstadt']['sampled_streets'],0)
        await self.conn.execute('DELETE FROM collection_checkpoints')
        def unavailable(request):
            return response(request) if request.url.path == '/addresses' else httpx.Response(503)
        async with httpx.AsyncClient(transport=httpx.MockTransport(unavailable)) as client:
            self.assertEqual(await import_zakb(self.conn,client,SOURCE),'failed')
        self.assertEqual(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'"),calendar)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM collection_checkpoints WHERE item_key NOT LIKE 'address-inventory:%'"),0)

    async def test_tile_retry_only_acquires_missing_or_expired_tiles(self):
        source = {'id':'tiles','layer':'test','url':'https://example.org/wms','wms_layer':'web',
                  'interval_seconds':3600,'bbox':[49.60,8.40,49.61,8.41],
                  'min_zoom':8,'max_zoom':8,'request_interval_seconds':0}
        requests = []
        def provider(request):
            requests.append(request)
            return httpx.Response(200,content=b'\x89PNG\r\n\x1a\nfixture')
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            await import_wms(self.conn,client,source)
            self.assertEqual(len(requests),1)
            self.assertEqual(
                bytes(await self.scalar("SELECT f.body FROM collected_map_tiles t JOIN collected_file_assets f ON f.sha256=t.payload_sha256")),
                b'\x89PNG\r\n\x1a\nfixture',
            )
            self.assertIsNone(await self.scalar("SELECT body FROM collected_payloads"))
            await import_wms(self.conn,client,source)
            self.assertEqual(len(requests),1)
            # Repair already-indexed tiles whose image bytes were never retained,
            # even when their collection timestamp is still fresh.
            await self.conn.execute("DELETE FROM collected_file_assets")
            await import_wms(self.conn,client,source)
            self.assertEqual(len(requests),2)
            self.assertEqual(await self.scalar("SELECT COUNT(*) FROM collected_file_assets"),1)
            await self.conn.execute("UPDATE collected_map_tiles SET fetched_at=NOW()-INTERVAL '2 hours'")
            await import_wms(self.conn,client,source)
            self.assertEqual(len(requests),3)

    async def test_run_budget_reports_unprocessed_streets_without_erasing_calendar(self):
        def inventory_provider(request):
            if request.url.path == '/addresses':
                return httpx.Response(200,json={'elements':[
                    {'lat':49.6,'lon':8.4,'tags':{'addr:city':'Biblis','addr:street':street,'addr:housenumber':'1'}}
                    for street in ['First','Second']
                ]})
            return response(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(inventory_provider)) as client:
            await import_zakb(self.conn,client,SOURCE)
            before=await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'")
            await self.conn.execute("DELETE FROM collection_checkpoints WHERE item_key NOT LIKE 'address-inventory:%'")
            result=await import_zakb(self.conn,client,{**SOURCE,'run_budget_seconds':0.1,'request_spacing_seconds':10})
        self.assertEqual(result,'failed')
        coverage=await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/coverage'")
        self.assertGreater(coverage['remaining_streets'],0)
        self.assertEqual(coverage['status'],'partial')
        self.assertEqual(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'"),before)

    async def test_recently_rejected_addresses_do_not_starve_the_next_run(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            await import_zakb(self.conn,client,SOURCE)
        await self.conn.execute("DELETE FROM collection_checkpoints WHERE item_key NOT LIKE 'address-inventory:%'")
        calls=[]
        def failing(request):
            calls.append(request)
            return httpx.Response(503)
        async with httpx.AsyncClient(transport=httpx.MockTransport(failing)) as client:
            await import_zakb(self.conn,client,SOURCE)
            before=len(calls)
            await import_zakb(self.conn,client,SOURCE)
            self.assertEqual(len(calls),before)
        coverage=await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/coverage'")
        self.assertEqual(coverage['municipalities']['Biblis']['deferred_calendars'],1)
        self.assertEqual(coverage['remaining_streets'],1)

    async def test_exhausted_network_budget_still_includes_all_fresh_calendars(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            await import_zakb(self.conn,client,SOURCE)
        before=await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'")
        calls=[]
        def offline(request):
            calls.append(request)
            return httpx.Response(503)
        async with httpx.AsyncClient(transport=httpx.MockTransport(offline)) as client:
            await import_zakb(self.conn,client,{**SOURCE,'run_budget_seconds':0})
        self.assertEqual(calls,[])
        self.assertEqual(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'"),before)
        coverage=await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/coverage'")
        self.assertEqual(coverage['municipalities']['Biblis']['reused_calendars'],1)

    async def test_legacy_calendar_is_withdrawn_until_identity_is_revalidated(self):
        from publications import publish
        digest = 'b' * 64
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,'legacy','application/json')", (digest,))
        await publish(self.conn, SOURCE, 'waste/calendar', [{'street': 'unverified'}], digest, datetime.now(UTC))
        await publish(self.conn, SOURCE, 'waste/coverage', {'coverage': 'representative_addresses_only'}, digest, datetime.now(UTC))
        await self.conn.commit()
        def unavailable(request):
            return response(request) if request.url.path == '/addresses' else httpx.Response(503)
        async with httpx.AsyncClient(transport=httpx.MockTransport(unavailable)) as client:
            self.assertEqual(await import_zakb(self.conn, client, SOURCE), 'failed')
        self.assertEqual(await self.scalar("SELECT count(*) FROM collected_datasets WHERE dataset='waste/calendar'"), 0)
        self.assertEqual(await self.scalar("SELECT data->>'validation_contract' FROM collected_datasets WHERE dataset='waste/coverage'"), 'zakb-address-v2')


    async def test_rejected_house_uses_real_alternative_and_reuses_its_checkpoint(self):
        submitted = []
        def provider(request):
            if request.url.path == '/addresses':
                return httpx.Response(200, json={'elements': [
                    {'lat': 49.6, 'lon': 8.4, 'tags': {'addr:city': 'Biblis', 'addr:street': 'Teststraße', 'addr:housenumber': '1'}},
                    {'lat': 49.62, 'lon': 8.42, 'tags': {'addr:city': 'Biblis', 'addr:street': 'Teststraße', 'addr:housenumber': '2'}}]})
            fields = parse_qs(request.content.decode())
            if fields.get('submitAction') == ['nextPage']:
                submitted.append(fields['aos[Hausnummer]'][0])
                if fields['aos[Hausnummer]'] == ['1']:
                    return httpx.Response(200, text='<form id="athos-os-form"><input name="pageName" value="Lageadresse"></form>')
            return response(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            await import_zakb(self.conn, client, SOURCE)
            events = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'")
            self.assertEqual(events[0]['house_number'], '2')
            self.assertEqual((events[0]['latitude'], events[0]['longitude']), (49.62, 8.42))
            await import_zakb(self.conn, client, SOURCE)
            await self.conn.execute("UPDATE collection_checkpoints SET fetched_at=NOW()-INTERVAL '25 hours' WHERE source_id=%s AND item_key=%s", (SOURCE['id'], address_key(SOURCE, {**ADDRESS, 'house_number':'2'})))
            await self.conn.commit()
            await import_zakb(self.conn, client, SOURCE)
        self.assertEqual(submitted, ['1', '2', '2'])
        coverage = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/coverage'")
        self.assertEqual(coverage['municipalities']['Biblis']['successful_calendars'], 1)
        self.assertEqual(coverage['municipalities']['Biblis']['reused_calendars'], 0)

    async def test_reviewed_site_is_selected_before_unmapped_houses_and_resumes(self):
        submitted = []
        def provider(request):
            if request.url.path == '/addresses':
                return httpx.Response(200, json={'elements': [
                    {'lat': lat, 'lon': lon, 'tags': {'addr:city': 'Biblis', 'addr:street': 'Außerhalb', 'addr:housenumber': number}}
                    for number, lat, lon in [('1', 49.6, 8.4), ('6', 49.6963697, 8.3647607)]]})
            fields = parse_qs(request.content.decode())
            if fields.get('submitAction') == ['nextPage']:
                submitted.append(fields['aos[Hausnummer]'][0])
                self.assertEqual(fields['aos[Strasse]'], ['Außerhalb - Zur Rheinfähre'])
                return httpx.Response(200, text=FORM + '<span id="Lageadresse">Außerhalb - Zur Rheinfähre 6, 68647 Biblis-Nordheim</span>')
            if fields.get('submitAction') == ['filedownload_ICAL']:
                return httpx.Response(200, content=ICAL)
            city = fields.get('aos[Ort]', ['Biblis'])[0]
            options = ''.join(f'<option value="{c}" {"selected" if c == city else ""}></option>' for c in ['Biblis', 'Biblis-Nordheim'])
            street = 'Außerhalb - Zur Rheinfähre' if city == 'Biblis-Nordheim' else 'Andere Straße'
            return httpx.Response(200, text=f'<form id="athos-os-form"><input name="pageName" value="Lageadresse"><select name="aos[Ort]">{options}</select><select name="aos[Strasse]"><option value="{street}"></option></select></form>')
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            await import_zakb(self.conn, client, SOURCE)
            await import_zakb(self.conn, client, SOURCE)
        self.assertEqual(submitted, ['6'])
        events = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'")
        self.assertEqual(events[0]['house_number'], '6')
        self.assertEqual((events[0]['latitude'], events[0]['longitude']), (49.6963697, 8.3647607))

    async def test_house_fallback_is_bounded_and_never_publishes_rejected_addresses(self):
        submitted = []
        def provider(request):
            if request.url.path == '/addresses':
                return httpx.Response(200, json={'elements': [
                    {'lat': 49.6, 'lon': 8.4, 'tags': {'addr:city': 'Biblis', 'addr:street': 'Teststraße', 'addr:housenumber': str(n)}}
                    for n in range(1, 5)]})
            fields = parse_qs(request.content.decode())
            if fields.get('submitAction') == ['nextPage']:
                submitted.append(fields['aos[Hausnummer]'][0])
                if fields['aos[Hausnummer]'] == ['4']:
                    return response(request)
                return httpx.Response(200, text='<form id="athos-os-form"><input name="pageName" value="Lageadresse"></form>')
            return response(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            self.assertEqual(await import_zakb(self.conn, client, SOURCE), 'failed')
        self.assertEqual(submitted, ['1', '2', '3'])
        self.assertEqual(await self.scalar("SELECT count(*) FROM collected_datasets WHERE dataset='waste/calendar'"), 0)

        # Even after the backoff expires, untried real houses precede old failures.
        await self.conn.execute("UPDATE collection_item_failures SET retry_after=NOW()-INTERVAL '1 hour' WHERE source_id=%s", (SOURCE['id'],))
        await self.conn.commit()
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            await import_zakb(self.conn, client, SOURCE)
        self.assertEqual(submitted, ['1', '2', '3', '4'])
        events = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'")
        self.assertEqual(events[0]['house_number'], '4')

    async def test_early_renewal_keeps_fresh_calendar_when_provider_fails(self):
        from zakb import address_key
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            await import_zakb(self.conn, client, SOURCE)
        key = address_key(SOURCE, ADDRESS)
        await self.conn.execute("UPDATE collection_checkpoints SET fetched_at=NOW()-INTERVAL '13 hours' WHERE source_id=%s AND item_key=%s", (SOURCE['id'], key))
        await self.conn.commit()
        before = await self.scalar("SELECT fetched_at FROM collection_checkpoints WHERE item_key=%s", (key,))
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(503))) as client:
            await import_zakb(self.conn, client, {**SOURCE, 'interval_seconds':3600, 'calendar_cache_seconds':86400, 'calendar_refresh_seconds':43200})
        coverage = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/coverage'")
        self.assertEqual(coverage['municipalities']['Biblis']['successful_calendars'], 1)
        self.assertEqual(coverage['municipalities']['Biblis']['refresh_failed_calendars'], 1)
        self.assertEqual(coverage['remaining_refresh_streets'], 1)
        self.assertEqual(await self.scalar("SELECT jsonb_array_length(data) FROM collected_datasets WHERE dataset='waste/calendar'"), 1)
        self.assertEqual(await self.scalar("SELECT fetched_at FROM collection_checkpoints WHERE item_key=%s", (key,)), before)

    async def test_oldest_renewal_precedes_alphabetical_order_and_budget_preserves_both(self):
        import asyncio
        from unittest.mock import patch

        from zakb import address_key
        def provider(request):
            if request.url.path == '/addresses':
                return httpx.Response(200, json={'elements': [
                    {'lat':49.6,'lon':8.4,'tags':{'addr:city':'Biblis','addr:street':street,'addr:housenumber':'1'}}
                    for street in ['First','Second']]})
            return response(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            await import_zakb(self.conn, client, SOURCE)
            for street,hours in [('First',13),('Second',14)]:
                await self.conn.execute("UPDATE collection_checkpoints SET fetched_at=NOW()-(%s * INTERVAL '1 hour') WHERE source_id=%s AND item_key=%s", (hours,SOURCE['id'],address_key(SOURCE,{**ADDRESS,'street':street})))
            await self.conn.commit()
            renewed = []
            async def renewal(conn, client, source, address, now, locations=None, *, refresh=False):
                if refresh:
                    renewed.append(address['street'])
                    await asyncio.sleep(1)
                return await calendar_for_address(conn,client,source,address,now,locations,refresh=refresh)
            settings = {**SOURCE,'run_budget_seconds':0.1,'calendar_refresh_seconds':43200}
            with patch('zakb.calendar_for_address', side_effect=renewal):
                await import_zakb(self.conn, client, settings)
            self.assertEqual(renewed, ['Second'])
            self.assertEqual(await self.scalar("SELECT jsonb_array_length(data) FROM collected_datasets WHERE dataset='waste/calendar'"), 2)
            with patch('zakb.calendar_for_address', side_effect=renewal):
                await import_zakb(self.conn, client, settings)
            self.assertEqual(renewed, ['Second','First'])

    async def test_suffix_candidates_keep_geometry_and_resume_without_new_requests(self):
        probes = []
        def provider(request):
            if request.url.path == '/addresses':
                return httpx.Response(200, json={'elements': [
                    {'lat':49.6,'lon':8.4,'tags':{'addr:city':'Biblis','addr:street':'Teststraße','addr:housenumber':'8'}},
                    {'center':{'lat':49.61,'lon':8.41},'tags':{'addr:city':'Biblis','addr:street':'Teststraße','addr:housenumber':'8A'}},
                    {'lat':49.62,'lon':8.42,'tags':{'addr:city':'Biblis','addr:street':'Teststraße','addr:housenumber':'9C'}},
                ]})
            fields = parse_qs(request.content.decode(), keep_blank_values=True)
            if fields.get('submitAction') == ['nextPage']:
                number = fields['aos[Hausnummer]'][0]
                suffix = fields['aos[Hausnummerzusatz]'][0]
                probes.append(number + suffix)
                if not suffix:
                    return httpx.Response(200, text='<form id="athos-os-form"><input name="error" value="no containers"></form>')
                return httpx.Response(200, text=FORM + f'<span id="Lageadresse">Teststraße {number} {suffix.lower()}, 68647 Biblis</span>')
            return response(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            await import_zakb(self.conn, client, SOURCE)
        self.assertEqual(probes, ['8', '8A'])
        calendar = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'")
        self.assertEqual(calendar[0]['house_number'], '8A')
        self.assertEqual((calendar[0]['latitude'], calendar[0]['longitude']), (49.61, 8.41))
        self.assertEqual(await self.scalar("SELECT data->>'house_suffix_contract' FROM collected_datasets WHERE dataset='waste/coverage'"), 'zakb-house-suffix-v1')
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: self.fail('Fresh suffix checkpoint must survive restart'))) as client:
            await import_zakb(self.conn, client, {**SOURCE, 'run_budget_seconds':0})
        self.assertEqual(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='waste/calendar'"), calendar)
