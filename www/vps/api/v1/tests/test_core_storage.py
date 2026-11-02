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
    sensor_window,
    transfer_publications,
    verify_sensor_window,
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
