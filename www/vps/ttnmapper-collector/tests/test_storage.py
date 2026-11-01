import hashlib
import sys
from datetime import UTC, datetime
from pathlib import Path

from config import Settings
from db_support import DatabaseCase
from normalize import NormalizedGateway, RiedCoverageSnapshot
from storage import persist_gateways


def sample_gateway():
    now = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)
    return NormalizedGateway(
        gateway_id="eui-58a0cbfffe801234",
        sensor_id="ttn-gw-eui-58a0cbfffe801234",
        eui="58a0cbfffe801234",
        net_id="000013",
        tenant_id="ttn",
        cluster_id="eu1.cloud.thethings.network",
        latitude=49.682,
        longitude=8.618,
        altitude=120.5,
        antenna_placement="OUTDOOR",
        online=True,
        updated_at=now,
        friendly_name="LoRaWAN Gateway eui-58a0cbfffe801234",
        description="LoRaWAN Gateway in Bensheim",
    )


def sample_snapshot(gateways: list[NormalizedGateway]):
    now = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)
    total = len(gateways)
    active = sum(1 for g in gateways if g.online)
    return RiedCoverageSnapshot(
        observed_at=now,
        total_gateways=total,
        active_gateways=active,
        outdoor_gateways=total,
        indoor_gateways=0,
        online_ratio_pct=100.0 if total > 0 else 0.0,
    )


class TTNMapperStorageTests(DatabaseCase):
    async def test_persist_gateways_and_core_schema(self):
        # This collector writes the canonical core; bootstrap alone is insufficient.
        sys.path.append(str(Path(__file__).resolve().parents[2] / 'api/v1'))
        from measurement_migration import install
        await install(self.conn)
        settings = Settings(
            poll_seconds=900,
            state_dir="/tmp",
            db={},
            min_lat=49.40,
            max_lat=50.00,
            min_lon=8.25,
            max_lon=8.80,
            center_lat=49.64,
            center_lon=8.53,
            radius_meters=25000,
        )
        gw = sample_gateway()
        snapshot = sample_snapshot([gw])

        stats = await persist_gateways(
            self.conn,
            [gw],
            snapshot,
            settings,
            payload_bytes=b"{}",
            payload_sha256=hashlib.sha256(b"{}").hexdigest(),
        )

        self.assertEqual(stats["gateways_updated"], 1)

        # Check collection_sources was registered
        src = await (
            await self.conn.execute(
                "SELECT id, adapter, enabled FROM collection_sources WHERE id='ttnmapper'"
            )
        ).fetchone()
        self.assertIsNotNone(src)
        self.assertEqual(src[0], "ttnmapper")
        self.assertTrue(src[2])

        # Verify entity created if table exists
        async with self.conn.cursor() as cur:
            await cur.execute(
                """SELECT 1 FROM information_schema.tables
                WHERE table_name = 'entities' AND table_schema = current_schema()"""
            )
            if (await cur.fetchone()) is not None:
                await cur.execute(
                    "SELECT id, entity_type FROM entities WHERE id = 'lora:gateway:eui-58a0cbfffe801234'"
                )
                row = await cur.fetchone()
                self.assertIsNotNone(row)
                self.assertEqual(row[1], "lora_gateway")

                # Verify regional entity created
                await cur.execute(
                    "SELECT id, entity_type FROM entities WHERE id = 'lora:area:hessisches_ried'"
                )
                area_row = await cur.fetchone()
                self.assertIsNotNone(area_row)
                self.assertEqual(area_row[1], "lora_coverage_area")

            # Verify sensor_metadata for map compatibility
            await cur.execute(
                "SELECT id, latitude, longitude FROM sensor_metadata WHERE id = %s",
                (gw.sensor_id,),
            )
            meta_row = await cur.fetchone()
            self.assertIsNotNone(meta_row)
            self.assertAlmostEqual(meta_row[1], 49.682, places=3)
            self.assertAlmostEqual(meta_row[2], 8.618, places=3)

            # Verify sensor_latest
            await cur.execute(
                "SELECT sensor_id, metric, value FROM sensor_latest WHERE sensor_id = %s",
                (gw.sensor_id,),
            )
            latest_row = await cur.fetchone()
            self.assertIsNotNone(latest_row)
            self.assertEqual(latest_row[1], "online_status")
            self.assertEqual(latest_row[2], 1.0)

        # Verify idempotency on second run
        stats2 = await persist_gateways(
            self.conn,
            [gw],
            snapshot,
            settings,
            payload_bytes=b"{}",
            payload_sha256=hashlib.sha256(b"{}").hexdigest(),
        )
        self.assertEqual(stats2["gateways_updated"], 1)

    async def test_status_uses_poll_time_and_keeps_original_response(self):
        from dataclasses import replace
        from datetime import timedelta

        sys.path.append(str(Path(__file__).resolve().parents[2] / 'api/v1'))
        from measurement_migration import install
        await install(self.conn)
        settings = Settings(poll_seconds=900, state_dir="/tmp", db={},
            min_lat=49.4, max_lat=50, min_lon=8.25, max_lon=8.8,
            center_lat=49.64, center_lon=8.53, radius_meters=25000)
        gateway = sample_gateway()
        first = gateway.updated_at + timedelta(minutes=15)
        second = first + timedelta(minutes=15)
        payload = b'[{"online":true}]'
        digest = hashlib.sha256(payload).hexdigest()
        attempt = await (await self.conn.execute(
            "INSERT INTO collection_attempts(source_id,status) VALUES('ttnmapper','received') RETURNING id"
        )).fetchone()
        await persist_gateways(self.conn, [gateway], replace(sample_snapshot([gateway]), observed_at=first), settings,
            now=first, payload_bytes=payload, payload_sha256=digest, attempt_id=attempt[0])
        offline = replace(gateway, online=False)
        await persist_gateways(self.conn, [offline], replace(sample_snapshot([offline]), observed_at=second), settings, now=second)
        rows = await (await self.conn.execute("""SELECT r.observed_at,r.value,r.provenance
            FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
            WHERE d.source_id='ttnmapper' AND d.metric='online_status' ORDER BY r.observed_at""")).fetchall()
        self.assertEqual([(row[0], row[1]) for row in rows], [(first, 1), (second, 0)])
        self.assertEqual(rows[0][2]['gateway_updated_at'], gateway.updated_at.isoformat())
        self.assertEqual(rows[0][2]['payload_sha256'], digest)
        self.assertEqual(rows[0][2]['collection_attempt_id'], attempt[0])
        legacy = await (await self.conn.execute(
            "SELECT timestamp,value FROM sensor_data WHERE sensor_id=%s ORDER BY timestamp",
            (gateway.sensor_id,),
        )).fetchall()
        self.assertEqual(legacy, [(first, 1), (second, 0)])
        receipt = await (await self.conn.execute("""SELECT p.body,a.fetched_at,a.http_status
            FROM collection_attempts a JOIN collected_payloads p ON p.sha256=a.payload_sha256
            WHERE a.id=%s""", (attempt[0],))).fetchone()
        self.assertEqual(receipt, (payload, first, 200))
        # A retry of the same poll cannot create another status observation.
        await persist_gateways(self.conn, [offline], replace(sample_snapshot([offline]), observed_at=second), settings, now=second)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 2)
        self.assertEqual(await self.scalar("SELECT count(*) FROM reading_revisions"), 0)
        with self.assertRaisesRegex(ValueError, 'Conflicting gateway status'):
            await persist_gateways(self.conn, [gateway], replace(sample_snapshot([gateway]), observed_at=second), settings, now=second)
        self.assertEqual(await self.scalar("SELECT count(*) FROM reading_revisions"), 0)
        with self.assertRaisesRegex(ValueError, 'checksum'):
            await persist_gateways(self.conn, [gateway], sample_snapshot([gateway]), settings,
                now=first, payload_bytes=payload, payload_sha256='incorrect')

    async def test_quarantine_keeps_exact_backups_and_other_measurements(self):
        from psycopg import sql
        from quarantine_history import quarantine

        sys.path.append(str(Path(__file__).resolve().parents[2] / 'api/v1'))
        from measurement_migration import install
        await install(self.conn)
        await self.conn.execute("""INSERT INTO entities(id,name,entity_type) VALUES
            ('lora:gateway:test','Gateway','lora_gateway'),('gps:test','GPS','vehicle');
            SELECT write_measurement('lora:gateway:test','online_status','state','ttnmapper','observed','{}',
                '2026-10-01',1,'2026-10-02','{}');
            SELECT write_measurement('lora:gateway:test','latitude','degrees','lora-infrastructure','reported','{}',
                '2026-10-01',49.6,'2026-10-02','{}');
            SELECT write_measurement('gps:test','latitude','degrees','gps','observed','{}',
                '2026-10-01',49.7,'2026-10-02','{}');
            INSERT INTO sensor_metadata(id,friendly_name) VALUES('ttn-gw-test','Test');
            INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value) VALUES
                ('ttn-gw-test','online_status','state','2026-10-01',1),
                ('ttn-gw-test','online_status','state','2026-10-01',0),
                ('ttn-gw-test','online_status','state','2026-10-01',1);
            INSERT INTO data_archives(month,generated_at,is_complete,reading_count,size_bytes,files,entity_ids,station_ids)
                VALUES('2026-10',now(),true,3,100,'[{"key":"old-key"}]','{lora:gateway:test}','{}');""")
        name = 'ttn_status_quarantine_' + self.schema[-24:]
        try:
            expected = await quarantine(self.conn, name, snapshot=True)
            self.assertEqual(expected['sensor_data'], 3)
            self.assertEqual(expected['readings'], 1)
            await self.conn.execute("""INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
                VALUES('ttn-gw-test','online_status','state','2026-10-02',0)""")
            with self.assertRaisesRegex(ValueError, 'changed after backup'):
                await quarantine(self.conn, name)
            self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 4)
            await self.conn.execute("DELETE FROM sensor_data WHERE timestamp='2026-10-02'")
            self.assertEqual(await quarantine(self.conn, name), expected)
            self.assertEqual(await self.scalar("SELECT count(*) FROM readings"), 2)
            self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 0)
            self.assertEqual(await self.scalar("SELECT key FROM archive_cleanup"), 'old-key')
            self.assertEqual(await self.scalar("SELECT files FROM data_archives"), [])
            backup = await (await self.conn.execute(sql.SQL(
                'SELECT value FROM {}.sensor_data ORDER BY value').format(sql.Identifier(name)))).fetchall()
            self.assertEqual([row[0] for row in backup], [0, 1, 1])
        finally:
            await self.conn.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(name)))
