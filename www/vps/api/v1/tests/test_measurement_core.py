"""Real database checks for scalar storage, paired coordinates and migration."""

import hashlib
import json
import os
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tests"))
from db_support import DatabaseCase
from measurement_migration import audit, backfill, capacity, disable_shadow, install
from weather_measurements import decode_weather, replay_weather_receipt


class MeasurementCoreTests(DatabaseCase):
    async def test_weather_replay_preserves_source_corrections_and_receipt_time(self):
        def payload(humidity):
            body = json.dumps({'timezone':'GMT', 'current': {
                'time':'2026-09-25T07:15', 'temperature_2m':6.1,
                'relative_humidity_2m':humidity, 'precipitation':0},
                'current_units':{'temperature_2m':'°C','relative_humidity_2m':'%',
                                 'precipitation':'mm'}}).encode()
            return hashlib.sha256(body).hexdigest(), body
        first = payload(92)
        second = payload(90)
        await replay_weather_receipt(self.conn, 1, self.now, *first)
        await replay_weather_receipt(self.conn, 2, self.now + timedelta(minutes=5), *second)
        await replay_weather_receipt(self.conn, 2, self.now + timedelta(minutes=5), *second)
        await replay_weather_receipt(self.conn, 1, self.now, *first)
        row = await (await self.conn.execute("""SELECT r.value,r.observed_at,r.collected_at,d.basis
            FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
            WHERE d.metric='relative_humidity'""")).fetchone()
        self.assertEqual(row, (Decimal(90), datetime(2026,9,25,7,15,tzinfo=UTC),
                               self.now + timedelta(minutes=5), 'model'))
        self.assertEqual(await self.scalar("""SELECT (v.previous_record->>'value')::numeric
            FROM reading_revisions v JOIN measurement_definitions d ON d.id=v.measurement_id
            WHERE d.metric='relative_humidity'"""), Decimal(92))
        with self.assertRaises(ValueError):
            decode_weather(first[1], 'wrong-checksum')
        bad = payload(101)
        with self.assertRaises(ValueError):
            decode_weather(bad[1], bad[0])
        await self.conn.execute("""INSERT INTO sensor_metadata(id,friendly_name)
            VALUES ('weather-dwd-ried','Weather')""")
        stamp = datetime(2026,9,25,7,15,tzinfo=UTC)
        for value in (92,90):
            await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
                VALUES ('weather-dwd-ried','relative_humidity','%%',%s,%s)""", (stamp,value))
        args = ('weather-dwd-ried','relative_humidity','%',stamp)
        self.assertFalse(await self.scalar('SELECT reconcile_weather_history(%s,%s,%s,%s)',args))
        for attempt, (digest, body) in enumerate((first,second),start=1):
            await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,%s,'application/json')",(digest,body))
            await self.conn.execute("""INSERT INTO collection_attempts(id,source_id,http_status,payload_sha256,status)
                VALUES (%s,'environment-weather',200,%s,'success')""", (attempt,digest))
        self.assertTrue(await self.scalar('SELECT reconcile_weather_history(%s,%s,%s,%s)',args))
        self.assertEqual(await self.scalar("""SELECT value FROM core_sensor_data
            WHERE sensor_id='weather-dwd-ried' AND metric='relative_humidity'"""),90)
        report = await audit(self.conn,stamp,stamp+timedelta(seconds=1))
        self.assertEqual(report['sensors']['reconciled_legacy'],1)
        self.assertEqual(report['sensors']['conflicting_legacy'],0)
        self.assertEqual(report['sensors']['different'],0)
        await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
            VALUES ('weather-dwd-ried','relative_humidity','%%',%s,91)""", (stamp,))
        self.assertFalse(await self.scalar('SELECT reconcile_weather_history(%s,%s,%s,%s)',args))
        report = await audit(self.conn,stamp,stamp+timedelta(seconds=1))
        self.assertEqual(report['sensors']['conflicting_legacy'],1)

    async def asyncSetUp(self):
        await super().asyncSetUp()
        await install(self.conn)
        await install(self.conn)
        self.now = datetime(2026, 9, 30, 12, tzinfo=UTC)
        await self.conn.execute("INSERT INTO entities(id,name,entity_type) VALUES ('one','One','sensor')")

    async def write(self, metric="temperature", value=Decimal(20), timestamp=None,
                    collected=None, source="test", basis="observed", backfill=False):
        return await self.scalar("""SELECT write_measurement('one',%s,'test-unit',%s,%s,'{}',
            %s,%s,%s,'{}','valid',NULL,NULL,'instantaneous',%s)""",
            (metric, source, basis, timestamp or self.now, value, collected or self.now, backfill))

    async def test_capacity_gate_accounts_for_chunks_and_rejects_low_disk(self):
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES ('legacy','Legacy')")
        await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
            VALUES ('legacy','temperature','°C',%s,1)""", (self.now,))
        report = await capacity(self.conn, 1)
        self.assertFalse(report['passes_preliminary_gate'])
        self.assertGreater(report['source_bytes'], 0)
        self.assertGreater(report['minimum_free_bytes'], 2*1024**3)
        self.assertTrue((await capacity(self.conn, 100))['passes_preliminary_gate'])
        with self.assertRaises(ValueError):
            await capacity(self.conn, 'NaN')

    async def test_ttn_capacity_gate_counts_only_ttn_backfill_sources(self):
        await self.conn.execute("""INSERT INTO sensor_metadata(id,friendly_name)
            VALUES ('ttn-gateway-test','TTN'),('unrelated','Other')""")
        stamp = self.now
        await self.conn.execute("""INSERT INTO ttn_uplink_events
            (application_id,event_id,device_id,received_at,payload_sha256)
            VALUES ('app','event','device',%s,%s)""", (stamp, '0' * 64))
        await self.conn.execute("""INSERT INTO sensor_measurement_windows
            (sensor_id,window_end,window_start,window_seconds,event_id)
            VALUES ('ttn-gateway-test',%s,%s,300,'event')""", (stamp, stamp-timedelta(minutes=5)))
        await self.conn.execute("""INSERT INTO sensor_window_metrics
            (sensor_id,window_end,metric,unit,minimum,mean,maximum,sample_count)
            VALUES ('ttn-gateway-test',%s,'temperature','°C',1,2,3,5)""", (stamp,))
        await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
            VALUES ('ttn-gateway-test','temperature','°C',%s,2),
                   ('unrelated','temperature','°C',%s,99)""", (stamp, stamp))
        report = await capacity(self.conn, '2.1', family='ttn')
        expected = await self.scalar("""SELECT (
            SELECT COALESCE(SUM(pg_column_size(s)),0) FROM sensor_data s
            WHERE s.sensor_id LIKE 'ttn-%'
        ) + (
            SELECT COALESCE(SUM(pg_column_size(w) + pg_column_size(m)),0)
            FROM sensor_measurement_windows w JOIN sensor_window_metrics m
              USING (sensor_id,window_end) WHERE w.sensor_id LIKE 'ttn-%'
        ) + (SELECT COALESCE(SUM(pg_column_size(e)),0) FROM ttn_uplink_events e)""")
        self.assertEqual(report['source_bytes'], expected)
        self.assertTrue(report['passes_preliminary_gate'])

    async def test_decimal_precision_retries_and_corrections(self):
        value = Decimal("12345678901234567890.12")
        identity = await self.write("revenue", value)
        await self.write("revenue", value, collected=self.now + timedelta(seconds=1))
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 1)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM reading_revisions"), 0)
        self.assertEqual(await self.scalar("SELECT value FROM readings"), value)
        await self.write("revenue", value + 1, collected=self.now + timedelta(seconds=2))
        self.assertEqual(await self.scalar("SELECT revision FROM readings"), 1)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM reading_revisions"), 1)
        await self.write("revenue", value, collected=self.now, backfill=True)
        self.assertEqual(await self.scalar("SELECT value FROM latest_readings WHERE measurement_id=%s", (identity,)), value + 1)
        await self.write("revenue", value, collected=self.now)
        self.assertEqual(await self.scalar("SELECT revision FROM readings"), 1)

    async def test_legacy_float_conversion_preserves_all_significant_digits(self):
        await install(self.conn, shadow=True)
        value=49.97297297297298
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name,latitude) VALUES ('precise','Precise',%s)", (value,))
        await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
            VALUES ('precise','temperature','°C',%s,%s)""", (self.now,value))
        self.assertEqual(await self.scalar("SELECT latitude FROM core_sensor_metadata"), value)
        self.assertEqual(await self.scalar("SELECT value FROM core_sensor_data"), value)
        report=await audit(self.conn,self.now,self.now+timedelta(seconds=1))
        self.assertEqual(report['sensors']['different'], 0)

    async def test_pairs_require_same_time_source_and_basis(self):
        await self.write("latitude", Decimal("49.64"))
        await self.write("longitude", Decimal("8.45"), timestamp=self.now-timedelta(seconds=1))
        await self.write("longitude", Decimal("8.45"), source="other")
        await self.write("longitude", Decimal("8.45"), basis="schedule_prediction")
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM measurement_positions"), 0)
        await self.write("longitude", Decimal("8.45"))
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM measurement_positions"), 1)
        await self.write("latitude", Decimal("49.65"), timestamp=self.now+timedelta(seconds=10))
        self.assertEqual(await self.scalar("SELECT MAX(observed_at) FROM measurement_positions"), self.now)

    async def test_invalid_coordinate_rolls_back_pair_and_definition(self):
        with self.assertRaises(psycopg.errors.CheckViolation):
            async with self.conn.transaction():
                await self.write("latitude", Decimal("49.64"))
                await self.write("longitude", Decimal(181))
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 0)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM measurement_definitions"), 0)

    async def test_suppressed_value_and_immutable_definition(self):
        identity = await self.scalar("""SELECT write_measurement('one','population','people','test',
            'reported','{"age":"0-5"}',%s,NULL,%s,'{}','suppressed',NULL,NULL,'reference')""", (self.now,self.now))
        self.assertIsNone(await self.scalar("SELECT value FROM latest_readings"))
        with self.assertRaises(psycopg.errors.CheckViolation):
            await self.conn.execute("UPDATE measurement_definitions SET unit='percent' WHERE id=%s", (identity,))
        with self.assertRaises(psycopg.errors.CheckViolation):
            await self.conn.execute("UPDATE readings SET value=0 WHERE measurement_id=%s", (identity,))

    async def test_latest_out_of_order_and_delete(self):
        await self.write(value=Decimal(21))
        await self.write(value=Decimal(19), timestamp=self.now-timedelta(seconds=1))
        self.assertEqual(await self.scalar("SELECT value FROM latest_readings"), 21)
        await self.conn.execute("DELETE FROM readings WHERE observed_at=%s", (self.now,))
        self.assertEqual(await self.scalar("SELECT value FROM latest_readings"), 19)

    async def test_sensor_shadow_backfill_resumes_without_overwriting_live(self):
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES ('legacy','Legacy')")
        for offset in range(3):
            await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
                VALUES ('legacy','temperature','°C',%s,%s)""", (self.now+timedelta(seconds=offset), offset))
        with self.assertRaises(RuntimeError):
            await backfill(self.conn, "sensors")
        await install(self.conn, shadow=True)
        first = await backfill(self.conn, "sensors", batch_size=1)
        self.assertEqual(first["processed"], 1)
        await self.conn.execute("UPDATE sensor_data SET value=10 WHERE timestamp=%s", (self.now,))
        last = await backfill(self.conn, "sensors", batch_size=1, max_batches=4)
        self.assertTrue(last["caught_up"])
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 3)
        self.assertEqual(await self.scalar("SELECT value FROM readings WHERE observed_at=%s", (self.now,)), 10)
        self.assertEqual((await backfill(self.conn, "sensors"))["processed"], 3)

    async def test_conflicting_historical_samples_fail_without_advancing(self):
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES ('legacy','Legacy')")
        await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
            VALUES ('legacy','temperature','°C',%s,1),('legacy','temperature','°C',%s,2)""", (self.now,self.now))
        await install(self.conn, shadow=True)
        with self.assertRaisesRegex(ValueError, "Conflicting legacy"):
            await backfill(self.conn, "sensors")
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 0)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM measurement_migration_state WHERE name='backfill:sensors'"), 0)

    async def test_duplicate_batch_boundary_does_not_skip_later_keys(self):
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES ('legacy','Legacy')")
        for offset in (0,0,0,1):
            await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
                VALUES ('legacy','temperature','°C',%s,20)""", (self.now+timedelta(seconds=offset),))
        await install(self.conn, shadow=True)
        first = await backfill(self.conn, 'sensors', batch_size=2)
        self.assertFalse(first['caught_up'])
        self.assertEqual(first['processed'], 1)
        second = await backfill(self.conn, 'sensors', batch_size=2)
        self.assertTrue(second['caught_up'])
        self.assertEqual(second['processed'], 2)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 2)

    async def test_movement_shadow_and_backfill_preserve_pair_and_prediction(self):
        digest = "c"*64
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,'data','text/plain')", (digest,))
        await install(self.conn, shadow=True)
        await self.conn.execute("""INSERT INTO movement_positions
            (timestamp,entity_id,kind,latitude,longitude,basis,source_id,payload_sha256,model_version,metadata)
            VALUES (%s,'trip','bus',49.64,8.45,'schedule_prediction','vrn',%s,'v1',
                '{"speed_kmh":30,"delay_seconds":60}')""", (self.now, digest))
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 4)
        self.assertEqual(await self.scalar("SELECT basis FROM measurement_positions"), "schedule_prediction")
        self.assertEqual(await self.scalar("SELECT entity_type FROM entities WHERE id='movement:trip'"), "service_trip")
        await backfill(self.conn, "movements")
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 4)
        report = await audit(self.conn, self.now, self.now+timedelta(seconds=1))
        self.assertEqual(report['movements'], {'legacy_samples': 1, 'core_samples': 1,
                                               'missing': 0, 'extra': 0, 'different': 0})
        await self.conn.execute("DELETE FROM movement_positions")
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 0)

    async def test_audit_detects_missing_values_and_pause_requires_reconciliation(self):
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES ('legacy','Legacy')")
        await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
            VALUES ('legacy','temperature','°C',%s,1)""", (self.now,))
        report = await audit(self.conn, self.now, self.now+timedelta(seconds=1))
        self.assertEqual(report['sensors']['missing'], 1)
        await install(self.conn, shadow=True)
        await backfill(self.conn, 'sensors')
        report = await audit(self.conn, self.now, self.now+timedelta(seconds=1))
        self.assertEqual(report['sensors']['missing'], 0)
        await disable_shadow(self.conn)
        await self.conn.execute("UPDATE sensor_data SET value=2")
        report = await audit(self.conn, self.now, self.now+timedelta(seconds=1))
        self.assertEqual(report['sensors']['different'], 1)
        with self.assertRaisesRegex(RuntimeError, 'reconcile'):
            await install(self.conn, shadow=True)
        with self.assertRaisesRegex(RuntimeError, 'Enable shadow'):
            await backfill(self.conn, 'sensors')

    async def test_metadata_location_pair_and_visibility_are_preserved(self):
        await self.conn.execute("""INSERT INTO sensor_metadata(id,friendly_name,latitude,longitude)
            VALUES ('legacy','Legacy',49.64,8.45)""")
        await install(self.conn, shadow=True)
        await backfill(self.conn, 'metadata')
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM measurement_positions"), 1)
        self.assertEqual(await self.scalar("SELECT provenance->>'time_basis' FROM measurement_positions"),
                         'metadata_effective_time')
        await self.conn.execute("UPDATE sensor_metadata SET friendly_name='Renamed',is_hidden=TRUE WHERE id='legacy'")
        self.assertEqual(await self.scalar("SELECT name FROM entities WHERE id='sensor:legacy'"), 'Renamed')
        self.assertTrue(await self.scalar("SELECT is_hidden FROM entities WHERE id='sensor:legacy'"))
        await self.conn.execute("DELETE FROM sensor_metadata WHERE id='legacy'")
        self.assertTrue(await self.scalar("SELECT (metadata->>'legacy_deleted')::boolean FROM entities WHERE id='sensor:legacy'"))

    async def test_shadow_duplicate_samples_do_not_silently_choose_a_value(self):
        await install(self.conn, shadow=True)
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES ('legacy','Legacy')")
        statement = """INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
            VALUES ('legacy','temperature','°C',%s,%s)"""
        await self.conn.execute(statement, (self.now,1))
        await self.conn.execute(statement, (self.now,1))
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 1)
        with self.assertRaises(psycopg.errors.RaiseException):
            await self.conn.execute(statement, (self.now,2))
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM sensor_data"), 2)
        await self.conn.execute("DELETE FROM sensor_data")
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 0)

    async def test_read_views_preserve_sensor_values_and_cleared_location(self):
        await install(self.conn, shadow=True)
        await self.conn.execute("""INSERT INTO sensor_metadata(id,friendly_name,latitude,longitude)
            VALUES ('legacy','Temperature station',49.64,8.45)""")
        await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
            VALUES ('legacy','temperature','°C',%s,20.125)""", (self.now,))
        self.assertEqual(await self.scalar("SELECT value FROM core_sensor_data"), 20.125)
        self.assertEqual(await self.scalar("SELECT value FROM core_sensor_latest"), 20.125)
        self.assertEqual(await self.scalar("SELECT latitude FROM core_sensor_metadata"), 49.64)
        await self.conn.execute("UPDATE sensor_metadata SET latitude=NULL,is_hidden=TRUE")
        self.assertIsNone(await self.scalar("SELECT latitude FROM core_sensor_metadata"))
        self.assertEqual(await self.scalar("SELECT longitude FROM core_sensor_metadata"), 8.45)
        self.assertTrue(await self.scalar("SELECT is_hidden FROM core_sensor_metadata"))
        await self.conn.execute("DELETE FROM sensor_data")
        await self.conn.execute("DELETE FROM sensor_latest")
        await self.conn.execute("DELETE FROM sensor_metadata")
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM core_sensor_metadata"), 0)

    async def test_movement_read_view_rejects_other_coordinate_dimensions(self):
        await install(self.conn, shadow=True)
        digest = 'd'*64
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,'data','text/plain')", (digest,))
        await self.conn.execute("""INSERT INTO movement_positions
            (timestamp,entity_id,kind,latitude,longitude,basis,source_id,payload_sha256,model_version,metadata)
            VALUES (%s,'trip','bus',49.64,8.45,'schedule_prediction','vrn',%s,'v1',
                '{"speed_kmh":30,"delay_seconds":60}')""", (self.now,digest))
        await self.conn.execute("""INSERT INTO movement_latest(entity_id,basis,timestamp,valid_until,data)
            VALUES ('trip','schedule_prediction',%s,%s,jsonb_build_object(
                'source_id','vrn','latitude',0,'longitude',0,'speed_kmh',0,'line','645'))""",
            (self.now,self.now+timedelta(minutes=5)))
        await self.conn.execute("""SELECT write_measurement('movement:trip','latitude','degrees',
            'vrn','schedule_prediction','{"crs":"other"}',%s,80,%s,'{}')""", (self.now,self.now))
        data = await self.scalar("SELECT data FROM core_movement_latest")
        self.assertEqual(data, {'source_id':'vrn','latitude':49.64,'longitude':8.45,
                                'speed_kmh':30,'delay_seconds':60,'line':'645'})
        await self.conn.execute("""DELETE FROM readings USING measurement_definitions d
            WHERE d.id=readings.measurement_id AND d.metric='longitude'""")
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM core_movement_latest"), 0)

    async def test_statistics_publication_roundtrip_periods_and_missing_values(self):
        await install(self.conn, shadow=True)
        digest='e'*64
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,'data','text/plain')", (digest,))
        data={'basis':'published_statistics','tables':[{'id':'16',
            'title':'Ein- und Auszahlungen in Hessen 2024 (Stand: 07.10.2025)',
            'records':[{'municipality_id':'biblis','ags':'06431003','name':'Biblis','values':[
                {'cell':'D17','label':'Einzahlungen / insgesamt / 1 000 Euro','value':12345.67,'source_marker':None},
                {'cell':'E17','label':'Einzahlungen / je Einwohner/-in / Euro','value':None,'source_marker':'.'}]}]}]}
        await self.conn.execute("""INSERT INTO collected_datasets VALUES
            ('statistics/finance','hessen-municipal-statistics','https://example.test',%s,%s,%s,%s,%s)""",
            (self.now,self.now,datetime.now(UTC)+timedelta(days=1),digest,Jsonb(data)))
        self.assertEqual(await self.scalar("SELECT data FROM core_statistical_datasets"), data)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"), 2)
        self.assertEqual(await self.scalar("SELECT value FROM readings WHERE quality='valid'"), Decimal('12345.67'))
        self.assertEqual(await self.scalar("SELECT unit FROM measurement_definitions WHERE id=(SELECT measurement_id FROM readings WHERE quality='valid')"), '1000 EUR')
        self.assertEqual(await self.scalar("SELECT MIN(observed_at) FROM readings"), datetime(2023,12,31,23,tzinfo=UTC))
        self.assertEqual(await self.scalar("SELECT template #> '{tables,0,records,0,values,0,value}' FROM measurement_publications"), None)
        from endpoints.collected import dataset_publication
        from starlette.requests import Request
        connection=self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                yield connection

        request=Request({'type':'http','method':'GET','path':'/','headers':[],'query_string':b''})
        self.conn.row_factory=dict_row
        try:
            with patch.dict(os.environ, {'MEASUREMENT_READ_MODE':'legacy'}):
                legacy=await dataset_publication('statistics/finance',request,Pool())
            with patch.dict(os.environ, {'MEASUREMENT_READ_MODE':'core'}):
                core=await dataset_publication('statistics/finance',request,Pool())
            self.assertEqual(core.body,legacy.body)
            self.assertEqual(json.loads(core.body),data)
            self.assertEqual(core.headers['etag'],legacy.headers['etag'])
        finally:
            self.conn.row_factory=psycopg.rows.tuple_row
        await self.conn.execute("UPDATE collected_datasets SET fetched_at=fetched_at+INTERVAL '1 day'")
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM reading_revisions"), 0)
        await self.conn.execute("DELETE FROM readings WHERE quality='valid'")
        with self.assertRaisesRegex(psycopg.errors.RaiseException,'Missing canonical'):
            await self.scalar("SELECT data FROM core_statistical_datasets")

    async def test_statistics_column_reference_date_is_not_download_date(self):
        row=await (await self.conn.execute("""SELECT * FROM statistical_source_period(
            'Jahresbericht Betriebe in Hessen 2024','Zum 30. September 2024 / Tätige Personen / Anzahl')""")).fetchone()
        self.assertEqual(row[0],datetime(2024,9,29,22,tzinfo=UTC))
        self.assertIsNone(row[1])
        self.assertEqual(await self.scalar("SELECT statistical_source_unit('1','davon / männlich / %')"), '%')
        self.assertEqual(await self.scalar("SELECT statistical_source_unit('1','davon / männlich / Anzahl')"), 'people')

    async def test_charger_list_and_map_share_readings_without_inventing_occupancy(self):
        await install(self.conn, shadow=True)
        digest='f'*64
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,'data','text/plain')", (digest,))
        station={'id':'bnetza-123','name':'Station','lat':49.97297297297298,'lng':8.45,
                 'maxPowerKw':22,'totalPoints':2,'availablePoints':None,
                 'occupiedPoints':None,'outOfServicePoints':None,
                 'sourceUpdatedAt':self.now.isoformat(),'availabilityBasis':'unavailable'}
        data={'stations':[station],'availability':'not_provided_by_register'}
        feature={'type':'FeatureCollection','features':[{'type':'Feature',
            'geometry':{'type':'Point','coordinates':[8.45,station['lat']]},'properties':station}]}
        statement="""INSERT INTO collected_datasets VALUES
            (%s,'bnetza-chargers','https://example.test',%s,%s,%s,%s,%s)"""
        for dataset,payload in [('infrastructure/ev-charging',data),('map/layers/charging',feature)]:
            await self.conn.execute(statement,(dataset,self.now,self.now,self.now+timedelta(days=1),digest,Jsonb(payload)))
            self.assertEqual(await self.scalar("SELECT data FROM core_charger_datasets WHERE dataset=%s",(dataset,)),payload)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"),7)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings WHERE quality='missing' AND value IS NULL"),3)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM reading_revisions"),0)
        await self.conn.execute("DELETE FROM measurement_publication_cells WHERE dataset='infrastructure/ev-charging' AND path=ARRAY['stations','0','availablePoints']")
        with self.assertRaisesRegex(psycopg.errors.RaiseException,'Missing canonical inventory binding'):
            await self.scalar("SELECT data FROM core_charger_datasets WHERE dataset='infrastructure/ev-charging'")

    async def test_gauge_map_and_list_share_source_values_and_reject_unmatched_features(self):
        await install(self.conn, shadow=True)
        digest='9'*64
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,'data','text/plain')", (digest,))
        gauge={'id':'pegel-rhein-worms','name':'WORMS','water_body':'RHEIN',
               'source_station_id':'23900200','latitude':49.631837,'longitude':8.377519,
               'current_level_m':-0.3,'updated_at':self.now.isoformat()}
        feature={'type':'FeatureCollection','features':[{'type':'Feature',
            'geometry':{'type':'Point','coordinates':[gauge['longitude'],gauge['latitude']]},
            'properties':{'name':'WORMS','level_m':-0.3,'measured_at':self.now.isoformat()}}]}
        statement="""INSERT INTO collected_datasets VALUES
            (%s,'environment-pegel','https://example.test',%s,%s,%s,%s,%s)"""
        for dataset,payload in [('environment/flood/gauges',[gauge]),('map/layers/floods',feature)]:
            await self.conn.execute(statement,(dataset,self.now,self.now,self.now+timedelta(hours=1),digest,Jsonb(payload)))
            self.assertEqual(await self.scalar("SELECT data FROM core_gauge_datasets WHERE dataset=%s",(dataset,)),payload)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings"),3)
        self.assertEqual(await self.scalar("SELECT value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='water_level'"),Decimal('-0.3'))
        with self.assertRaisesRegex(psycopg.errors.RaiseException,'no unique source station'):
            await self.conn.execute("""UPDATE collected_datasets SET data=jsonb_set(data,
                '{features,0,properties,name}','"OTHER"') WHERE dataset='map/layers/floods'""")
        self.assertEqual(await self.scalar("SELECT data FROM core_gauge_datasets WHERE dataset='map/layers/floods'"),feature)


class EnvironmentContractTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await install(self.conn)
        await install(self.conn)
        self.now = datetime(2026, 10, 6, 12, tzinfo=UTC)
        await self.conn.execute("INSERT INTO entities(id,name,entity_type) VALUES ('env:one','One','model_point')")
        await self.conn.execute("INSERT INTO collected_payloads VALUES ('test-hash','{}','application/json',%s)", (self.now,))
        for attempt in (1, 2):
            await self.conn.execute("""INSERT INTO collection_attempts
                (id,source_id,received_at,http_status,payload_sha256,status)
                VALUES (%s,'environment-test',%s,200,'test-hash','received')""",
                (attempt, self.now + timedelta(minutes=attempt)))

    async def write(self, value=1, attempt=1, issued=None, kind='forecast', dimensions=None, metadata=None):
        return await self.scalar("""SELECT write_environment_measurement(
            'env:one','soil_moisture','m3/m3','environment-test',%s,%s,%s,%s,%s,%s,
            'valid',NULL,NULL,'instantaneous',%s)""",
            (kind, Jsonb(dimensions or {}), self.now + timedelta(hours=1), value, attempt,
             Jsonb(metadata or {'license': 'CC-BY-4.0', 'spatial_reference': 'grid:one', 'model': 'test'}),
             issued))

    async def test_runs_replay_revisions_and_missing_values(self):
        first = await self.write(issued=self.now)
        await self.write(issued=self.now)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), 1)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM reading_revisions'), 0)
        await self.write(value=2, attempt=2, issued=self.now)
        await self.write(value=1, attempt=1, issued=self.now)
        self.assertEqual(await self.scalar('SELECT value FROM readings WHERE measurement_id=%s', (first,)), 2)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM reading_revisions'), 1)
        second = await self.write(issued=self.now - timedelta(hours=1))
        self.assertNotEqual(first, second)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), 2)
        await self.conn.execute("""SELECT write_environment_measurement(
            'env:one','pollen','grains/m3','environment-test','model','{}',%s,NULL,1,
            '{"license":"CC-BY","spatial_reference":"grid:one","model":"test"}',
            'missing')""", (self.now,))
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings WHERE quality='missing' AND value IS NULL"), 1)

    async def test_invalid_receipts_and_forecast_contract(self):
        for kwargs in ({'attempt': 999}, {'issued': None}, {'issued': self.now + timedelta(days=1)},
                       {'issued': self.now, 'dimensions': {'data_kind': 'observation'}},
                       {'issued': self.now, 'metadata': {'license': 'CC-BY'}},
                       {'issued': self.now, 'kind': 'observation'}):
            with self.assertRaises(psycopg.errors.CheckViolation):
                await self.write(**kwargs)
        await self.conn.execute("UPDATE collection_attempts SET http_status=500 WHERE id=1")
        with self.assertRaises(psycopg.errors.CheckViolation):
            await self.write(issued=self.now)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), 0)

    async def test_api_preserves_contract_and_hides_private_entities(self):
        from endpoints.environment_measurements import environment_measurements

        await self.write(issued=self.now)
        conn = self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                previous = conn.row_factory
                conn.row_factory = dict_row
                try:
                    yield conn
                finally:
                    conn.row_factory = previous

        response = await environment_measurements(entity_id='env:one', start=self.now,
            end=self.now + timedelta(days=1), kind=None, metric=None, limit=1, pool=Pool())
        self.assertEqual(response['items'][0]['provenance']['payload_sha256'], 'test-hash')
        self.assertEqual(response['items'][0]['dimensions']['data_kind'], 'forecast')
        self.assertEqual(response['items'][0]['unit'], 'm3/m3')
        await self.write(issued=self.now - timedelta(hours=1))
        response = await environment_measurements(entity_id='env:one', start=self.now,
            end=self.now + timedelta(days=1), kind='forecast', metric='soil_moisture', limit=1, pool=Pool())
        self.assertTrue(response['truncated'])
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            await environment_measurements(entity_id='env:one', start=self.now.replace(tzinfo=None),
                end=self.now, kind=None, metric=None, limit=1, pool=Pool())
        with self.assertRaises(HTTPException):
            await environment_measurements(entity_id='env:one', start=self.now,
                end=self.now + timedelta(days=32), kind=None, metric=None, limit=1, pool=Pool())
        await self.conn.execute("UPDATE entities SET is_hidden=TRUE WHERE id='env:one'")
        response = await environment_measurements(entity_id='env:one', start=self.now,
            end=self.now + timedelta(days=1), kind=None, metric=None, limit=1, pool=Pool())
        self.assertEqual(response['items'], [])

    async def test_soil_api_uses_newest_initialization_without_mixing_runs(self):
        from endpoints.environment_measurements import soil_forecasts
        stamp = datetime.now(UTC)
        await self.conn.execute("""INSERT INTO collection_attempts
            (id,source_id,http_status,payload_sha256,status)
            VALUES (3,'environment-soil-icon',200,'test-hash','received')""")
        for hours, value in ((6, 1), (1, 2)):
            await self.conn.execute("""SELECT write_environment_measurement(
                'env:one','soil_moisture','m3/m3','environment-soil-icon','forecast','{}',%s,%s,3,
                '{"license":"CC-BY","spatial_reference":"grid:one","model":"test"}',
                'valid',NULL,NULL,'instantaneous',%s)""", (stamp, value, stamp-timedelta(hours=hours)))
        conn = self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                previous = conn.row_factory
                conn.row_factory = dict_row
                try:
                    yield conn
                finally:
                    conn.row_factory = previous

        result = await soil_forecasts(pool=Pool())
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['value'], 2)
        self.assertFalse(result['truncated'])
