import io
import unittest
import zipfile
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock

import httpx
from gtfs import active_services, parse_gtfs, seconds, service_epoch
from prediction import position_at
from publications import acquire, acquisition_error, import_json, public_url
from zakb import CalendarForm, forecast_tours, parse_ical


def feed_fixture():
    files = {
        'agency.txt':'agency_id,agency_timezone\na,Europe/Berlin\n',
        'routes.txt':'route_id,agency_id,route_short_name,route_type\nr,a,641,3\n',
        'trips.txt':'route_id,service_id,trip_id,trip_headsign,shape_id\nr,daily,t,Lampertheim,shape\n',
        'stops.txt':'stop_id,stop_name,stop_lat,stop_lon\ns1,Bürstadt,49.64,8.45\ns2,Lampertheim,49.60,8.47\n',
        'stop_times.txt':'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,23:55:00,23:56:00,s1,1\nt,24:10:00,24:11:00,s2,2\n',
        'calendar.txt':'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ndaily,1,1,1,1,1,1,1,20260101,20261231\n',
        'shapes.txt':'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nshape,49.64,8.45,1\nshape,49.62,8.46,2\nshape,49.60,8.47,3\n',
    }
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w') as archive:
        for name,body in files.items(): archive.writestr(name,body)
    return buffer.getvalue()


class PredictionTests(unittest.TestCase):
    def test_acquisition_errors_identify_host_without_request_secrets(self):
        request = httpx.Request('GET', 'https://user:secret@example.org/private/token?key=secret')
        error = httpx.ConnectTimeout('secret exception text', request=request)
        self.assertEqual(acquisition_error(error), 'ConnectTimeout host=example.org')
        response = httpx.Response(503, request=request)
        error = httpx.HTTPStatusError('secret', request=request, response=response)
        self.assertEqual(acquisition_error(error), 'HTTPStatusError host=example.org status=503')
        self.assertEqual(acquisition_error(httpx.ConnectTimeout('secret')), 'ConnectTimeout')
        self.assertEqual(acquisition_error(ValueError('secret')), 'ValueError')

    def test_disk_parser_emits_identical_schedules_without_accumulating_them(self):
        now = datetime(2026, 9, 22, 12, tzinfo=UTC)
        bbox = [49.55, 8.3, 49.8, 8.65]
        expected, stops = parse_gtfs(feed_fixture(), bbox, now)
        emitted = []
        retained, actual_stops = parse_gtfs(io.BytesIO(feed_fixture()), bbox, now, emitted.append)
        self.assertEqual(retained, [])
        self.assertEqual(emitted, expected)
        self.assertEqual(actual_stops, stops)

    def test_interpolation_dwell_and_no_extrapolation(self):
        path=[[10,49.6,8.4],[20,49.6,8.4],[30,49.7,8.5]]
        self.assertIsNone(position_at(path,9))
        self.assertEqual(position_at(path,15),(49.6,8.4,0.0))
        self.assertAlmostEqual(position_at(path,25)[0],49.65)
        self.assertIsNone(position_at(path,30))

    def test_service_exceptions_and_overnight_time(self):
        day=date(2026,9,22)
        calendar=[{'service_id':'normal','start_date':'20260101','end_date':'20261231','tuesday':'1'}]
        changes=[{'service_id':'normal','date':'20260922','exception_type':'2'}, {'service_id':'special','date':'20260922','exception_type':'1'}]
        self.assertEqual(active_services(calendar,changes,day),{'special'})
        self.assertEqual(seconds('25:03:04'),90184)
        with self.assertRaises(ValueError): seconds('25:70:04')

    def test_dst_uses_noon_minus_twelve_elapsed_hours(self):
        self.assertEqual(service_epoch(date(2026,3,29),'Europe/Berlin'),datetime(2026,3,28,22,tzinfo=UTC).timestamp())

    def test_gtfs_filters_region_and_keeps_shapes_and_overnight_service(self):
        now=datetime(2026,9,22,12,tzinfo=UTC)
        schedules,stops=parse_gtfs(feed_fixture(),[49.55,8.3,49.8,8.65],now)
        self.assertEqual(len(schedules),3)
        self.assertEqual(len(stops),2)
        today=next(t for t in schedules if t['service_date']==now.date())
        self.assertEqual(today['metadata']['geometry_basis'],'provider_shape')
        self.assertGreater(today['trajectory'][-1][0],service_epoch(now.date(),'Europe/Berlin')+86400)
        self.assertIn([49.62,8.46],[p[1:] for p in today['trajectory']])
        self.assertEqual(parse_gtfs(feed_fixture(),[0,0,1,1],now),([],[]))

    def test_zakb_sample_scope_and_model_are_explicit(self):
        raw=b'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test\r\nDTSTART;VALUE=DATE:20260922\r\nSUMMARY:Bioabfall\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
        address={'municipality':'Bürstadt','street':'Teststraße','house_number':'1','latitude':49.6,'longitude':8.4}
        events=parse_ical(raw,address)
        self.assertEqual(events[0]['coverage'],'representative_address_only')
        now=datetime(2026,9,22,8,tzinfo=UTC)
        self.assertEqual(forecast_tours(events,now),[])
        tours=forecast_tours(events+[{**events[0],'street':'Andere Straße','latitude':49.61}],now)
        self.assertEqual(tours[0]['metadata']['entity_type'],'collection_forecast_not_identified_truck')
        self.assertEqual(tours[0]['metadata']['geometry_basis'],'stop_to_stop')

    def test_calendar_parser_does_not_submit_unrelated_forms(self):
        parser=CalendarForm()
        parser.feed('<form id="login"><input name="password" value="secret"></form><form id="athos-os-form"><input name="pageName" value="Lageadresse"><input type="checkbox" checked name="aos[Bio]"></form>')
        self.assertEqual(parser.fields,{'pageName':'Lageadresse','aos[Bio]':'on'})


class AcquisitionTests(unittest.IsolatedAsyncioTestCase):
    def connection(self):
        conn=MagicMock()
        cursor=MagicMock(); cursor.fetchone=AsyncMock(return_value=(1,))
        conn.execute=AsyncMock(return_value=cursor); conn.commit=AsyncMock(); conn.rollback=AsyncMock()
        return conn

    async def test_failed_http_response_is_archived_before_raise(self):
        conn=self.connection()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request:httpx.Response(503,content=b'provider failure'))) as client:
            with self.assertRaises(httpx.HTTPStatusError):
                await acquire(conn,client,{'id':'example','url':'https://example.org/data'})
        queries=[call.args[0] for call in conn.execute.call_args_list]
        self.assertIn('collected_payloads',queries[0])
        self.assertIn('collection_attempts',queries[1])
        self.assertEqual(conn.execute.call_args_list[0].args[1][1],len(b'provider failure'))
        self.assertEqual(conn.execute.call_args_list[2].args[1],(1,b'provider failure'))
        conn.commit.assert_awaited()

    async def test_invalid_publication_never_replaces_last_good_data(self):
        conn=self.connection()
        source={'id':'example','url':'https://example.org/data','datasets':{'demographics/summary':{'type':'array','required':['name']}}}
        body={'source_updated_at':'2026-09-22T00:00:00Z','datasets':{'demographics/summary':[{'other':'bad'}]}}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request:httpx.Response(200,json=body))) as client:
            with self.assertRaises(ValueError): await import_json(conn,client,source)
        self.assertFalse(any('INSERT INTO collected_datasets' in c.args[0] for c in conn.execute.call_args_list))
        conn.rollback.assert_awaited()

    def test_provenance_removes_query_and_credentials(self):
        self.assertEqual(public_url('https://user:password@example.org/source?key=secret'),'https://example.org/source')

    async def test_transient_get_retries_are_bounded_and_archived(self):
        conn=self.connection()
        calls=[]
        def provider(request):
            calls.append(request)
            return httpx.Response(503 if len(calls)==1 else 200,content=b'body')
        source={'id':'example','url':'https://example.org/data','http_retries':1,'retry_delay_seconds':0}
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            response,_,_=await acquire(conn,client,source)
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(calls),2)
        self.assertEqual(sum('INSERT INTO collected_payloads' in call.args[0] for call in conn.execute.call_args_list),2)
        calls.clear()
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            with self.assertRaises(httpx.HTTPStatusError):
                await acquire(conn,client,source,form={'step':'calendar'})
        self.assertEqual(len(calls),1)
