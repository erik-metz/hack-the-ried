"""Compact storage: one accepted value, no revision or compatibility history."""

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from psycopg.errors import CheckViolation
from psycopg.types.json import Jsonb

sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'tests'))
from db_support import DatabaseCase
from measurement_migration import install

sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'ops'))
from consolidate_core_storage import (
    consolidate_traffic,
    retire,
    sensor_window,
    transfer,
    transfer_publications,
    verify_movement_window,
    verify_sensor_window,
    windows,
)

MIGRATIONS=Path(__file__).resolve().parents[1]/'migrations'


class CoreStorageTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await install(self.conn)
        await self.conn.execute((MIGRATIONS/'20261103_core_storage.sql').read_text())
        self.now=datetime(2026,11,2,tzinfo=UTC)
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES('test','Test')")
        await self.conn.execute("INSERT INTO entities(id,name,entity_type) VALUES('sensor:test','Test','sensor')")

    async def write(self,value,details=None,channel='one'):
        return await self.scalar("""SELECT write_measurement('sensor:test','temperature','C','test','observed',
            %s,%s,%s,%s,%s)""",(Jsonb({'sensor_id':channel}),self.now,value,self.now,Jsonb(details or {})))

    async def cutover(self):
        async with self.conn.transaction():
            await self.conn.execute("SET LOCAL ried.core_retirement_verified='yes'")
            await self.conn.execute((MIGRATIONS/'20261103_core_retirement.sql').read_text())

    async def test_corrections_replace_value_without_receipts_or_revisions(self):
        await self.write(1,{'payload_sha256':'a'*64,'collection_attempt_id':123,'sample_count':4})
        await self.write(2,{'payload_sha256':'b'*64,'collection_attempt_id':456,'sample_count':4})
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),1)
        self.assertEqual(await self.scalar('SELECT value FROM readings'),2)
        self.assertEqual(await self.scalar('SELECT provenance FROM readings'),{'sample_count':4})
        self.assertEqual(await self.scalar('SELECT count(*) FROM reading_revisions'),0)
        with self.assertRaises(CheckViolation):
            await self.conn.execute(
                "SELECT write_measurement('sensor:test','latitude','degrees','test','observed','{}',%s,100,%s)",(self.now,self.now))

    async def test_invalid_inputs_neither_persist_nor_replace_accepted_values(self):
        query="""SELECT write_measurement('sensor:test','temperature','C','test','observed',
            '{"sensor_id":"one"}',%s,%s,%s,'{}',%s)"""
        await self.conn.execute(query,(self.now,None,self.now,'invalid'))
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),0)
        await self.write(7)
        await self.conn.execute(query,(self.now,None,self.now+timedelta(seconds=1),'invalid'))
        self.assertEqual(await self.scalar('SELECT value FROM readings'),7)
        await self.conn.execute("UPDATE readings SET quality='invalid',value=NULL")
        self.assertEqual(await self.scalar('SELECT value FROM readings'),7)
        self.assertEqual(await self.scalar('SELECT quality FROM readings'),'valid')

    async def test_missing_legacy_history_copied_once_without_native_channel_duplicates(self):
        await self.write(7,channel='one')
        await self.write(8,channel='two')
        await self.conn.execute("""INSERT INTO sensor_data(timestamp,sensor_id,value,unit,metric)
            VALUES(%s,'test',7,'C','temperature'),(%s,'test',7,'C','temperature'),
                (%s,'test',9,'C','temperature')""",(self.now,self.now,self.now+timedelta(hours=1)))
        self.assertEqual(await sensor_window(self.conn,self.now,self.now+timedelta(hours=2)),1)
        await verify_sensor_window(self.conn,self.now,self.now+timedelta(hours=2))
        self.assertEqual(await sensor_window(self.conn,self.now,self.now+timedelta(hours=2)),0)
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),3)
        await self.cutover()
        self.assertEqual(await self.scalar("SELECT relkind FROM pg_class WHERE oid='sensor_data'::regclass"),'v')
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),3)
        self.assertEqual(await self.scalar('SELECT count(*) FROM sensor_data'),2)
        await self.conn.execute("""INSERT INTO sensor_data(timestamp,sensor_id,value,unit,metric)
            VALUES(%s,'test',9,'C','temperature') ON CONFLICT DO NOTHING""",(self.now+timedelta(hours=1),))
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),3)

    async def test_disagreement_prevents_retirement_transfer(self):
        await self.write(1)
        await self.conn.execute("INSERT INTO sensor_data VALUES(%s,'test',2,'C','temperature')",(self.now,))
        with self.assertRaisesRegex(ValueError,'disagreement'):
            await sensor_window(self.conn,self.now,self.now+timedelta(hours=1))
        self.assertEqual(await self.scalar('SELECT value FROM readings'),1)
        self.assertEqual(await self.scalar('SELECT count(*) FROM sensor_data'),1)

    async def test_expiring_receipts_and_retry_do_not_duplicate_data(self):
        await self.cutover()
        old=self.now-timedelta(days=30)
        await self.conn.execute("INSERT INTO telemetry_ingest_batches(batch_id,payload_hash,committed_at) VALUES('old','hash',%s)",(old,))
        await self.conn.execute('SELECT maintain_core_storage()')
        self.assertEqual(await self.scalar('SELECT count(*) FROM telemetry_ingest_batches'),0)
        for _ in range(2):
            await self.conn.execute("INSERT INTO sensor_data(timestamp,sensor_id,value,unit,metric) VALUES(%s,'test',2,'C','temperature')",(self.now,))
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),1)
        self.assertEqual(await self.scalar('SELECT count(*) FROM sensor_latest'),1)
        await self.conn.execute("INSERT INTO collected_dataset_versions VALUES('test','hash',%s,'{}') ON CONFLICT DO NOTHING",(self.now,))
        self.assertEqual(await self.scalar('SELECT count(*) FROM collected_dataset_versions'),0)

    async def test_movement_writes_only_core_and_current_entity_context(self):
        await self.cutover()
        data={'entity_id':'bus-one','timestamp':self.now.isoformat(),'kind':'bus',
            'basis':'schedule_prediction','source_id':'schedule','latitude':49.5,'longitude':8.4,
            'payload_sha256':'a'*64,'model_version':'one',
            'metadata':{'line':'42','speed_kmh':21,'delay_seconds':30}}
        for _ in range(2):
            await self.conn.execute('SELECT write_movement_position(%s)',(Jsonb(data),))
        self.assertEqual(await self.scalar("SELECT count(*) FROM readings"),4)
        self.assertEqual(await self.scalar("SELECT count(*) FROM readings WHERE provenance<>'{}'"),0)
        self.assertEqual(await self.scalar("SELECT metadata->>'line' FROM entities WHERE id='movement:bus-one'"),'42')
        self.assertIsNone(await self.scalar("SELECT to_regclass('movement_contexts')"))
        self.assertEqual(await self.scalar('SELECT count(*) FROM movement_positions'),1)
        self.assertEqual(await self.scalar("SELECT (metadata->>'speed_kmh')::numeric FROM movement_positions"),21)
        await self.conn.execute("""INSERT INTO movement_positions(timestamp,entity_id,kind,latitude,longitude,basis,source_id,payload_sha256,metadata)
            VALUES(%s,'bus-one','bus',49.5,8.4,'schedule_prediction','schedule',NULL,'{"line":"42","speed_kmh":21,"delay_seconds":30}')
            ON CONFLICT DO NOTHING RETURNING entity_id""",(self.now,))
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),4)

    async def test_publication_replay_preserves_exact_decimals_and_current_accepted_value(self):
        await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",('a'*64,))
        data='[{"id":"gauge","name":"Gauge","water_body":"Rhine","source_station_id":"42","latitude":49.1,"longitude":8.1,"current_level_m":1.1234567890123456789012345,"updated_at":"2026-11-02T00:00:00Z"}]'
        await self.conn.execute("""INSERT INTO collected_datasets(dataset,source_id,source_url,source_updated_at,fetched_at,expires_at,payload_sha256,data)
            VALUES('environment/flood/gauges','environment-pegel','https://example.org',%s,%s,%s,%s,%s::jsonb)""",
            (self.now,self.now,self.now+timedelta(days=1),'a'*64,data))
        await self.conn.execute("""INSERT INTO collected_dataset_versions(dataset,payload_sha256,source_updated_at,data)
            VALUES('environment/flood/gauges',%s,%s,%s::jsonb)""",('a'*64,self.now-timedelta(hours=1),data.replace('1.1234567890123456789012345','1.0')))
        await transfer_publications(self.conn)
        self.assertEqual(await self.scalar("SELECT r.value::text FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='water_level'"),'1.1234567890123456789012345')
        self.assertTrue(await self.scalar("SELECT d.data=read_gauge_publication(d.dataset) FROM collected_datasets d WHERE dataset='environment/flood/gauges'"))
        self.assertEqual(await self.scalar('SELECT count(*) FROM reading_revisions'),0)

    async def test_timescale_compression_preserves_values_and_allows_corrections(self):
        if not await self.scalar("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='timescaledb')"):
            self.skipTest('Timescale compression is covered by the dedicated CI database')
        await self.write(1)
        await self.cutover()
        await self.conn.execute((MIGRATIONS/'20261103_measurement_heads.sql').read_text())
        await self.conn.execute("SELECT compress_chunk(chunk) FROM show_chunks('readings') AS c(chunk)")
        self.assertEqual(await self.scalar('SELECT value FROM readings'),1)
        await self.write(2)
        self.assertEqual(await self.scalar('SELECT value FROM readings'),2)
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),1)
        self.assertEqual(await self.scalar('SELECT count(*) FROM reading_revisions'),0)

    async def test_response_hashes_do_not_create_duplicate_measurements(self):
        from unittest.mock import patch

        from normalize_snapshot_identity import normalize

        await self.cutover()
        for i in (1,2):
            digest=str(i)*64
            await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",(digest,))
            await self.conn.execute("""INSERT INTO collection_attempts(source_id,payload_sha256,status,received_at)
                VALUES('test',%s,'success',%s)""",(digest,self.now+timedelta(minutes=i)))
            await self.conn.execute("""SELECT write_measurement('sensor:test','temperature','C','test','observed',
                %s,%s,%s,%s)""",(Jsonb({'snapshot_sha256':digest}),self.now,i,self.now+timedelta(minutes=i)))
        with patch('normalize_snapshot_identity.MIGRATIONS',MIGRATIONS):
            await normalize(self.conn)
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),1)
        self.assertEqual(await self.scalar('SELECT value FROM readings'),2)
        self.assertEqual(await self.scalar("SELECT count(*) FROM measurement_definitions WHERE dimensions ? 'snapshot_sha256'"),0)
        self.assertTrue(await self.scalar("SELECT current_snapshot_matches(measurement_id,observed_at,'unused') FROM readings"))
        await self.conn.execute("""SELECT write_measurement('sensor:test','temperature','C','test','observed',
            %s,%s,3,%s)""",(Jsonb({'snapshot_sha256':'3'*64}),self.now,self.now+timedelta(minutes=3)))
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),1)
        self.assertEqual(await self.scalar('SELECT value FROM readings'),3)
        with patch('normalize_snapshot_identity.MIGRATIONS',MIGRATIONS):
            await normalize(self.conn)
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),1)

    async def test_current_snapshot_keys_track_unchanged_values_without_copying_history(self):
        await self.cutover()
        await self.conn.execute((MIGRATIONS/'20261103_snapshot_identity.sql').read_text())
        for batch,times in [(1,[0,1]),(2,[0,2])]:
            digest=str(batch)*64
            await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",(digest,))
            attempt=await self.scalar("""INSERT INTO collection_attempts(source_id,payload_sha256,status,http_status)
                VALUES('environment-pollen-cams',%s,'success',200) RETURNING id""",(digest,))
            async with self.conn.transaction():
                for hour in times:
                    await self.conn.execute("""SELECT write_environment_measurement('sensor:test','pollen','grains/m3',
                        'environment-pollen-cams','model',%s,%s,1,%s,%s)""",
                        (Jsonb({'species':'grass','snapshot_sha256':digest}),self.now+timedelta(hours=hour),attempt,
                         Jsonb({'license':'CC0','spatial_reference':'EPSG:4326','model':'test-model'})))
        self.assertEqual(await self.scalar('SELECT count(*) FROM measurement_definitions'),1)
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),3)
        self.assertEqual(await self.scalar("SELECT count(*) FROM readings WHERE current_snapshot_matches(measurement_id,observed_at,'ignored')"),2)
        self.assertEqual(await self.scalar("SELECT count(*) FROM measurement_definitions WHERE dimensions ? 'snapshot_sha256'"),0)

    async def test_latest_values_are_read_from_core_without_numeric_cache_copy(self):
        await self.write(1)
        await self.cutover()
        await self.conn.execute((MIGRATIONS/'20261103_measurement_heads.sql').read_text())
        self.assertEqual(await self.scalar("SELECT relkind FROM pg_class WHERE oid='latest_readings'::regclass"),'v')
        self.assertEqual(await self.scalar('SELECT value FROM latest_readings'),1)
        self.assertEqual(await self.scalar('SELECT count(*) FROM measurement_heads'),1)
        await self.write(2)
        self.assertEqual(await self.scalar('SELECT value FROM latest_readings'),2)
        self.assertEqual(await self.scalar('SELECT count(*) FROM measurement_heads'),1)
        self.assertIsNone(await self.scalar("SELECT to_regclass('retired_latest_readings_cache')"))
        await self.conn.execute('DELETE FROM readings')
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),0)
        self.assertEqual(await self.scalar('SELECT count(*) FROM measurement_heads'),0)
        await self.write(3)
        self.assertEqual(await self.scalar('SELECT value FROM latest_readings'),3)
        await self.conn.execute((MIGRATIONS/'20261103_measurement_heads.sql').read_text())
        self.assertEqual(await self.scalar('SELECT value FROM latest_readings'),3)

    async def test_inventory_coordinates_keep_exact_values_with_lightweight_context(self):
        await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",('a'*64,))
        data='[{"id":"one","latitude":49.123456789012345678901,"longitude":8.1,"description":"Original"}]'
        await self.conn.execute("""INSERT INTO collected_datasets(dataset,source_id,source_url,source_updated_at,fetched_at,expires_at,payload_sha256,data)
            VALUES('waste/address-inventory','inventory-test','https://example.org',%s,%s,%s,%s,%s::jsonb)""",
            (self.now,self.now,self.now+timedelta(days=1),'a'*64,data))
        await self.conn.execute("SELECT mirror_coordinate_publication(d) FROM collected_datasets d WHERE dataset='waste/address-inventory'")
        self.assertTrue(await self.scalar("SELECT d.data=read_coordinate_publication(d.dataset) FROM collected_datasets d WHERE dataset='waste/address-inventory'"))
        self.assertEqual(await self.scalar("SELECT value::text FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='latitude'"),'49.123456789012345678901')
        await self.conn.execute("UPDATE collected_datasets SET source_updated_at=source_updated_at+interval '1 hour'")
        await self.conn.execute("SELECT mirror_coordinate_publication(d) FROM collected_datasets d WHERE dataset='waste/address-inventory'")
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),2)

    async def test_ship_heading_and_navigation_state_remain_numeric_measurements(self):
        await self.cutover()
        data={'entity_id':'ship-one','timestamp':self.now.isoformat(),'kind':'ship','basis':'observed',
            'source_id':'ais','latitude':49.5,'longitude':8.4,
            'metadata':{'heading_deg':120,'navigation_status':3,'name':'Ship','realtime_input_sha256':'a'*64}}
        await self.conn.execute('SELECT write_movement_position(%s)',(Jsonb(data),))
        self.assertEqual(await self.scalar("SELECT value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='heading'"),120)
        self.assertEqual(await self.scalar("SELECT value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='navigation_status'"),3)
        self.assertEqual(await self.scalar("SELECT semantics FROM measurement_definitions WHERE metric='navigation_status'"),'state')
        self.assertEqual(await self.scalar("SELECT (metadata->>'heading_deg')::numeric FROM movement_positions"),120)
        metadata=await self.scalar("SELECT metadata FROM entities WHERE id='movement:ship-one'")
        self.assertNotIn('heading_deg',metadata)
        self.assertNotIn('navigation_status',metadata)
        self.assertNotIn('realtime_input_sha256',metadata)

    async def test_movement_retirement_checks_heading_and_navigation_too(self):
        await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",('a'*64,))
        await self.conn.execute("""INSERT INTO movement_positions(timestamp,entity_id,kind,latitude,longitude,basis,source_id,payload_sha256,metadata)
            VALUES(%s,'ship-one','ship',49.5,8.4,'observed','ais',%s,'{"heading_deg":120,"navigation_status":3}')""",(self.now,'a'*64))
        await self.conn.execute("SELECT backfill_measurement_window('movements',%s,%s)",(self.now,self.now+timedelta(minutes=15)))
        await verify_movement_window(self.conn,self.now,self.now+timedelta(minutes=15))
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),4)
        await self.conn.execute("DELETE FROM readings WHERE measurement_id IN(SELECT id FROM measurement_definitions WHERE metric='navigation_status')")
        with self.assertRaisesRegex(ValueError,'navigation_status'):
            await verify_movement_window(self.conn,self.now,self.now+timedelta(minutes=15))

    async def test_movement_proof_accepts_only_documented_superseded_values(self):
        await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",('a'*64,))
        await self.conn.execute("""INSERT INTO movement_positions(timestamp,entity_id,kind,latitude,longitude,basis,source_id,payload_sha256,metadata)
            VALUES(%s,'bus-one','bus',49.5,8.4,'schedule_prediction','vrn',%s,'{"delay_seconds":174}')""",(self.now,'a'*64))
        await self.conn.execute("SELECT backfill_measurement_window('movements',%s,%s)",(self.now,self.now+timedelta(minutes=15)))
        await self.conn.execute("UPDATE readings SET value=0 WHERE measurement_id IN(SELECT id FROM measurement_definitions WHERE metric='delay')")
        with self.assertRaisesRegex(ValueError,'delay'):
            await verify_movement_window(self.conn,self.now,self.now+timedelta(minutes=15))
        await self.conn.execute("""INSERT INTO reading_revisions(measurement_id,observed_at,revision,previous_record,replaced_at)
            SELECT measurement_id,observed_at,1,'{"value":174,"quality":"valid"}',collected_at
            FROM readings WHERE measurement_id IN(SELECT id FROM measurement_definitions WHERE metric='delay')""")
        await verify_movement_window(self.conn,self.now,self.now+timedelta(minutes=15))
        self.assertEqual(await self.scalar("SELECT value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='delay'"),0)
        await self.conn.execute("UPDATE reading_revisions SET previous_record=%s",(Jsonb({'value':173,'quality':'valid'}),))
        with self.assertRaisesRegex(ValueError,'delay'):
            await verify_movement_window(self.conn,self.now,self.now+timedelta(minutes=15))

    async def test_traffic_quantities_use_core_without_history_copy(self):
        from unittest.mock import patch

        await self.cutover()
        await self.conn.execute("""INSERT INTO traffic_corridor_snapshots VALUES
            (%s,'corridor:A5','A5','congestion',120,2,700,'reported')""",(self.now,))
        with patch('consolidate_core_storage.MIGRATIONS',MIGRATIONS):
            await consolidate_traffic(self.conn)
        self.assertEqual(await self.scalar("SELECT relkind FROM pg_class WHERE oid='traffic_corridor_snapshots'::regclass"),'v')
        row=await (await self.conn.execute('SELECT status,delay_seconds,active_incidents_count,max_length_meters,delay_kind FROM traffic_corridor_snapshots')).fetchone()
        self.assertEqual(row,('congestion',120,2,700,'reported'))
        await self.conn.execute("""INSERT INTO traffic_corridor_snapshots VALUES
            (%s,'corridor:A5','A5','clear',0,0,0,'unknown')""",(self.now+timedelta(minutes=15),))
        self.assertEqual(await self.scalar('SELECT count(*) FROM traffic_corridor_snapshots'),2)
        self.assertEqual(await self.scalar("SELECT count(*) FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='delay'"),1)

    async def test_batch_sensor_transfer_validates_bounds_before_inserting(self):
        await self.conn.execute("INSERT INTO sensor_data VALUES(%s,'test',100,'degrees','latitude')",(self.now,))
        with self.assertRaisesRegex(ValueError,'Invalid historical'):
            await sensor_window(self.conn,self.now,self.now+timedelta(minutes=15))
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),0)
        self.assertEqual(await self.scalar("SHOW session_replication_role"),'origin')

    async def test_window_cache_expires_only_after_exact_core_coverage(self):
        await self.conn.execute((MIGRATIONS/'20261020_sensor_window_statistics.sql').read_text())
        await self.cutover()
        old=self.now-timedelta(days=30)
        start=old-timedelta(minutes=15)
        await self.conn.execute("""INSERT INTO sensor_measurement_windows
            VALUES('test',%s,%s,900,'event-one')""",(old,start))
        await self.conn.execute("INSERT INTO sensor_window_metrics VALUES('test',%s,'temperature','C',1,2,3,4)",(old,))
        for statistic,value in [('min',1),('mean',2)]:
            await self.conn.execute("""SELECT write_measurement('sensor:test','temperature','C','ttn:test','observed',
                %s,%s,%s,%s,'{"sample_count":4}','valid',%s,%s,'interval_statistic')""",
                (Jsonb({'statistic':statistic}),old,value,self.now,start,old))
        await self.conn.execute('SELECT maintain_core_storage()')
        self.assertEqual(await self.scalar('SELECT count(*) FROM sensor_measurement_windows'),1)
        await self.conn.execute("""SELECT write_measurement('sensor:test','temperature','C','ttn:test','observed',
            '{"statistic":"max"}',%s,3,%s,'{"sample_count":4}','valid',%s,%s,'interval_statistic')""",(old,self.now,start,old))
        await self.conn.execute('SELECT maintain_core_storage()')
        self.assertEqual(await self.scalar('SELECT count(*) FROM sensor_measurement_windows'),0)
        self.assertEqual(await self.scalar('SELECT count(*) FROM sensor_window_metrics'),0)
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),3)

    async def test_only_unresolvable_weather_keys_are_secured_outside_database(self):
        import gzip
        import tempfile

        from quarantine_ambiguous_weather import quarantine

        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES('weather-dwd-ried','Weather')")
        await self.conn.execute("""INSERT INTO sensor_data VALUES(%s,'weather-dwd-ried',6.5,'C','temperature'),
            (%s,'weather-dwd-ried',6.6,'C','temperature'),(%s,'test',2,'C','temperature')""",(self.now,self.now,self.now))
        later=self.now+timedelta(minutes=15)
        await self.conn.execute("INSERT INTO entities(id,name,entity_type) VALUES('sensor:weather-dwd-ried','Weather','weather_model')")
        await self.conn.execute("""SELECT write_measurement('sensor:weather-dwd-ried','temperature','C',
            'environment-weather','model','{}',%s,7,%s)""",(later,later))
        await self.conn.execute("""INSERT INTO sensor_data VALUES(%s,'weather-dwd-ried',7,'C','temperature'),
            (%s,'weather-dwd-ried',8,'C','temperature')""",(later,later))
        with tempfile.TemporaryDirectory() as directory:
            result=await quarantine(self.conn,directory)
            self.assertEqual(result['quarantined_keys'],1)
            self.assertEqual(result['quarantined_rows'],2)
            self.assertTrue(gzip.decompress(Path(result['backup']).read_bytes()).startswith(b'PGCOPY'))
            self.assertEqual(await self.scalar('SELECT count(*) FROM sensor_data'),3)
            self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),1)
            self.assertEqual((await quarantine(self.conn,directory))['quarantined_rows'],0)

    async def test_distinct_physical_channel_values_are_not_legacy_conflicts(self):
        await self.write(7,channel='one')
        await self.write(8,channel='two')
        await self.conn.execute("""INSERT INTO sensor_data VALUES(%s,'test',7,'C','temperature'),
            (%s,'test',8,'C','temperature')""",(self.now,self.now))
        self.assertEqual(await sensor_window(self.conn,self.now,self.now+timedelta(minutes=15)),0)
        await verify_sensor_window(self.conn,self.now,self.now+timedelta(minutes=15))
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),2)

    async def test_movement_windows_split_by_scalar_count_without_sampling(self):
        from unittest.mock import patch

        await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",('a'*64,))
        for i in (0,1):
            await self.conn.execute("""INSERT INTO movement_positions(timestamp,entity_id,kind,latitude,longitude,basis,source_id,payload_sha256,metadata)
                VALUES(%s,%s,'bus',49.5,8.4,'observed','gps',%s,'{"speed_kmh":20}')""",
                (self.now+timedelta(minutes=30*i),'bus-'+str(i),'a'*64))
        with patch('consolidate_core_storage.MAX_TRANSFER_VALUES',5):
            spans=[span async for span in windows(self.conn,'movements')]
        self.assertEqual(len(spans),2)
        for i in (0,1):
            time=self.now+timedelta(minutes=30*i)
            self.assertEqual(sum(start<=time<end for start,end in spans),1)

    async def test_retirement_checks_coverage_atomically_in_bounded_windows(self):
        from unittest.mock import patch

        await self.write(1)
        await self.conn.execute("INSERT INTO sensor_data VALUES(%s,'test',2,'C','temperature')",(self.now,))
        with patch('consolidate_core_storage.MIGRATIONS',MIGRATIONS):
            with self.assertRaisesRegex(ValueError,'Native/legacy disagreement'):
                await retire(self.conn)
            self.assertEqual(await self.scalar("SELECT relkind FROM pg_class WHERE oid='sensor_data'::regclass"),'r')
            await self.conn.execute('UPDATE sensor_data SET value=1')
            await retire(self.conn)
            await retire(self.conn)
            await transfer(self.conn)
        self.assertEqual(await self.scalar("SELECT relkind FROM pg_class WHERE oid='sensor_data'::regclass"),'v')
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),1)

    async def test_bulk_float_conversion_remains_exact_with_short_client_format(self):
        await self.conn.execute('SET extra_float_digits=0')
        await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",('a'*64,))
        await self.conn.execute("""INSERT INTO movement_positions(timestamp,entity_id,kind,latitude,longitude,basis,source_id,payload_sha256,metadata)
            VALUES(%s,'precise','ship',49.123456789012344,8.123456789012346,'observed','gps',%s,'{}')""",(self.now,'a'*64))
        expected=await self.scalar("SELECT legacy_numeric(latitude) FROM movement_positions WHERE entity_id='precise'")
        await self.conn.execute("SELECT backfill_measurement_window('movements',%s,%s)",(self.now,self.now+timedelta(hours=1)))
        await verify_movement_window(self.conn,self.now,self.now+timedelta(hours=1))
        self.assertEqual(await self.scalar("SELECT value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='latitude'"),expected)
        self.assertEqual(await self.scalar('SHOW extra_float_digits'),'0')
        await self.conn.execute("INSERT INTO sensor_data VALUES(%s,'test',1.2345678901234567,'C','temperature')",(self.now,))
        expected=await self.scalar("SELECT legacy_numeric(value) FROM sensor_data")
        await sensor_window(self.conn,self.now,self.now+timedelta(hours=1))
        await verify_sensor_window(self.conn,self.now,self.now+timedelta(hours=1))
        self.assertEqual(await self.scalar("SELECT value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='temperature'"),expected)
        self.assertEqual(await self.scalar('SHOW extra_float_digits'),'0')

    async def test_retirement_recovers_late_values_behind_transfer_checkpoint(self):
        from unittest.mock import patch

        await self.conn.execute("INSERT INTO sensor_data VALUES(%s,'test',2,'C','temperature')",(self.now,))
        await sensor_window(self.conn,self.now,self.now+timedelta(hours=1))
        await self.conn.execute("INSERT INTO sensor_data VALUES(%s,'test',3,'C','temperature')",(self.now+timedelta(minutes=5),))
        await self.conn.execute("INSERT INTO collected_payloads(sha256,content_type) VALUES(%s,'application/json')",('a'*64,))
        for hour in (0,2):
            await self.conn.execute("""INSERT INTO movement_positions(timestamp,entity_id,kind,latitude,longitude,basis,source_id,payload_sha256,metadata)
                VALUES(%s,'late-ship','ship',49.5,8.4,'observed','gps',%s,'{}')""",(self.now+timedelta(hours=hour),'a'*64))
        with patch('consolidate_core_storage.MIGRATIONS',MIGRATIONS):
            await retire(self.conn)
        self.assertEqual(await self.scalar('SELECT count(*) FROM readings'),6)
        self.assertEqual(await self.scalar("SELECT count(*) FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.entity_id='movement:late-ship'"),4)
        self.assertEqual(await self.scalar("SELECT relkind FROM pg_class WHERE oid='sensor_data'::regclass"),'v')
