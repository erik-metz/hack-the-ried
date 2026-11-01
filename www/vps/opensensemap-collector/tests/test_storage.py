import hashlib
import json
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

from config import Settings
from db_support import DatabaseCase
from normalize import OpenSenseBoxObservation, OpenSenseMeasurement
from psycopg.types.json import Jsonb
from repair_history import repair
from storage import persist_boxes


def sample_box():
    now = datetime(2026, 10, 3, 14, 0, tzinfo=UTC)
    return OpenSenseBoxObservation(
        box_id="58cd22d8c877fb0011774898",
        sensor_id="osem-58cd22d8c877fb0011774898",
        name="Bürstadt Wetterstation",
        friendly_name="senseBox: Bürstadt Wetterstation",
        model="homeWifiFeinstaub",
        exposure="outdoor",
        latitude=49.6425,
        longitude=8.4552,
        updated_at=now,
        measurements=[
            OpenSenseMeasurement(
                metric="temperature",
                value=21.5,
                unit="°C",
                observed_at=now,
                sensor_id="s1",
                sensor_title="Temperatur",
                sensor_type="HDC1080",
            ),
            OpenSenseMeasurement(
                metric="PM25",
                value=8.2,
                unit="µg/m³",
                observed_at=now,
                sensor_id="s2",
                sensor_title="PM2.5",
                sensor_type="SDS011",
            ),
        ],
        description="openSenseMap / senseBox Station Bürstadt",
    )


class OpenSenseStorageTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        migrations = Path(__file__).resolve().parents[2] / 'api/v1/migrations'
        for name in ['20260930_measurements.sql', '20261101_opensensemap_sensor_identity.sql']:
            await self.conn.execute((migrations / name).read_text())

    async def test_persist_boxes_schema_and_metadata(self):
        settings = Settings(
            poll_seconds=300,
            state_dir="/tmp",
            db={},
            min_lat=49.40,
            max_lat=50.00,
            min_lon=8.25,
            max_lon=8.80,
        )
        now = datetime.now(UTC)
        box = sample_box()

        stats = await persist_boxes(
            self.conn,
            [box],
            settings,
            now=now,
            payload_bytes=b'{"test": true}',
            payload_sha256=hashlib.sha256(b'{"test": true}').hexdigest(),
        )
        self.assertEqual(stats["boxes_updated"], 1)

        # Check sensor_metadata
        meta = await (
            await self.conn.execute(
                "SELECT friendly_name, latitude, longitude FROM sensor_metadata WHERE id=%s",
                (box.sensor_id,),
            )
        ).fetchone()
        self.assertIsNotNone(meta)
        self.assertEqual(meta[0], "senseBox: Bürstadt Wetterstation")
        self.assertAlmostEqual(float(meta[1]), 49.6425, places=4)
        self.assertAlmostEqual(float(meta[2]), 8.4552, places=4)

        # Check sensor_latest for temperature
        latest_temp = await self.scalar(
            "SELECT value FROM sensor_latest WHERE sensor_id=%s AND metric='temperature'",
            (box.sensor_id,),
        )
        self.assertAlmostEqual(float(latest_temp), 21.5)

        # Check sensor_latest for PM25 and mirrored PM2.5
        latest_pm25 = await self.scalar(
            "SELECT value FROM sensor_latest WHERE sensor_id=%s AND metric='PM25'",
            (box.sensor_id,),
        )
        self.assertAlmostEqual(float(latest_pm25), 8.2)

        latest_pm25_mirror = await self.scalar(
            "SELECT value FROM sensor_latest WHERE sensor_id=%s AND metric='PM2.5'",
            (box.sensor_id,),
        )
        self.assertAlmostEqual(float(latest_pm25_mirror), 8.2)

        # Check collection_sources was registered
        src = await (
            await self.conn.execute(
                "SELECT id, adapter, enabled FROM collection_sources WHERE id='opensensemap'"
            )
        ).fetchone()
        self.assertIsNotNone(src)
        self.assertEqual(src[0], "opensensemap")
        self.assertTrue(src[2])

        # Check entities table if present
        row = await (
            await self.conn.execute(
                """SELECT 1 FROM information_schema.tables
                WHERE table_name = 'entities' AND table_schema = current_schema()"""
            )
        ).fetchone()
        if row:
            entity_name = await self.scalar(
                "SELECT name FROM entities WHERE id=%s",
                (f"sensor:{box.sensor_id}",),
            )
            self.assertEqual(entity_name, "senseBox: Bürstadt Wetterstation")

        # Verify idempotency on second run
        stats2 = await persist_boxes(
            self.conn,
            [box],
            settings,
            now=now,
            payload_bytes=b'{"test": true}',
            payload_sha256=hashlib.sha256(b'{"test": true}').hexdigest(),
        )
        self.assertEqual(stats2["boxes_updated"], 1)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 3)

    async def test_physical_sensors_remain_distinct_with_same_metric_and_timestamp(self):
        settings = Settings(poll_seconds=300, state_dir='/tmp', db={})
        box = sample_box()
        box = replace(box, measurements=[box.measurements[0], replace(box.measurements[0], sensor_id='s3', value=19.2)])
        body = b'{"test": true}'
        for _ in range(2):
            await persist_boxes(self.conn, [box], settings, payload_bytes=body,
                                payload_sha256=hashlib.sha256(body).hexdigest())
        rows = await (await self.conn.execute("""SELECT d.dimensions->>'sensor_id',r.value
            FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
            WHERE d.metric='temperature' ORDER BY d.dimensions->>'sensor_id'""")).fetchall()
        self.assertEqual([(sensor, float(value)) for sensor, value in rows], [('s1', 21.5), ('s3', 19.2)])
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 1)
        self.assertAlmostEqual(await self.scalar("SELECT value FROM sensor_data"), 19.2)
        self.assertEqual(await self.scalar("SELECT count(*) FROM opensensemap_legacy_repairs"), 0)

    async def test_receipt_repair_recovers_both_sensors_and_saves_original_rows(self):
        box = sample_box()
        stamp = box.measurements[0].observed_at
        received = datetime.now(UTC)
        body = json.dumps([{'_id': box.box_id, 'model': box.model, 'sensors': [
            {'_id': 's1', 'title': 'Temperatur', 'unit': '°C', 'sensorType': 'BME280',
             'lastMeasurement': {'createdAt': stamp.isoformat(), 'value': '21.50'}},
            {'_id': 's3', 'title': 'Temperatur', 'unit': '°C', 'sensorType': 'DHT22',
             'lastMeasurement': {'createdAt': stamp.isoformat(), 'value': '19.20'}}]}]).encode()
        digest = hashlib.sha256(body).hexdigest()
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,%s,'application/json')", (digest, body))
        await self.conn.execute("INSERT INTO collection_attempts(source_id,received_at,http_status,payload_sha256,status) VALUES ('opensensemap',%s,200,%s,'success')", (received, digest))
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name) VALUES (%s,'Test')", (box.sensor_id,))
        await self.conn.execute("INSERT INTO entities(id,name,entity_type) VALUES (%s,'Test','environmental_sensor')", ('sensor:' + box.sensor_id,))
        for value in (21.5, 19.2):
            await self.conn.execute("""SELECT write_measurement(%s,'temperature','°C',%s,'observed','{}',%s,%s::numeric,%s,%s)""",
                ('sensor:' + box.sensor_id, 'legacy-sensor:' + box.sensor_id, stamp, value, received,
                 Jsonb({'source': 'opensensemap', 'box_id': box.box_id})))
            await self.conn.execute("INSERT INTO sensor_data(timestamp,sensor_id,metric,value,unit) VALUES (%s,%s,'temperature',%s,'°C')", (stamp, box.sensor_id, value))
        await self.conn.execute("INSERT INTO sensor_data(timestamp,sensor_id,metric,value,unit) VALUES (%s,%s,'temperature',77,'°C')", (stamp, box.sensor_id))
        end = datetime(2026, 11, 1, tzinfo=UTC)
        with self.assertRaisesRegex(ValueError, 'Unexplained legacy'):
            await repair(self.conn, stamp, end, apply=True)
        self.assertEqual(await self.scalar("SELECT count(*) FROM opensensemap_legacy_repairs"), 0)
        await self.conn.execute("DELETE FROM sensor_data WHERE value=77")
        report = await repair(self.conn, stamp, end)
        self.assertEqual(report['verified_keys'], 1)
        self.assertEqual(report['native_revisions'], 1)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 2)
        await repair(self.conn, stamp, end, apply=True)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 1)
        self.assertEqual(await self.scalar("SELECT jsonb_array_length(original_rows) FROM opensensemap_legacy_repairs"), 2)
        self.assertEqual(await self.scalar("SELECT jsonb_array_length(original_native_revisions) FROM opensensemap_legacy_repairs"), 1)
        rows = await (await self.conn.execute("""SELECT d.dimensions->>'sensor_id',r.value FROM readings r
            JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='temperature'
            ORDER BY d.dimensions->>'sensor_id'""")).fetchall()
        self.assertEqual([(sensor, float(value)) for sensor, value in rows], [('s1', 21.5), ('s3', 19.2)])
        self.assertEqual(await self.scalar("SELECT count(*) FROM collected_payloads"), 1)
