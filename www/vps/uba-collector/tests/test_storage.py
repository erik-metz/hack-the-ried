import hashlib
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

from config import Settings
from db_support import DatabaseCase
from normalize import BERLIN_TZ, UbaMeasurement, UbaStationObservation
from repair_history import receipt_value, repair
from storage import persist_stations


def sample_station():
    now = datetime(2026, 10, 3, 20, 0, tzinfo=UTC)
    return UbaStationObservation(
        station_id="671",
        station_code="DEHE043",
        sensor_id="uba-dehe043",
        name="Riedstadt",
        friendly_name="UBA Luftgütestation Riedstadt (Riedstadt)",
        city="Riedstadt",
        network="Hessen",
        station_type="Hintergrund",
        latitude=49.8252,
        longitude=8.5168,
        updated_at=now,
        measurements=[
            UbaMeasurement(
                metric="air_quality_index",
                value=1.0,
                unit="index",
                observed_at=now,
                index_value=1,
            ),
            UbaMeasurement(
                metric="PM10",
                value=12.0,
                unit="µg/m³",
                observed_at=now,
            ),
            UbaMeasurement(
                metric="PM25",
                value=5.0,
                unit="µg/m³",
                observed_at=now,
            ),
            UbaMeasurement(
                metric="NO2",
                value=16.0,
                unit="µg/m³",
                observed_at=now,
            ),
        ],
        description="Amtliche Luftgütemessstation Riedstadt",
    )


class UbaStorageTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        migration = Path(__file__).resolve().parents[2] / "api/v1/migrations/20261101_uba_legacy_repairs.sql"
        await self.conn.execute(migration.read_text())
        await self.conn.execute(migration.with_name("20260930_measurements.sql").read_text())

    async def test_persist_stations_schema_and_metadata(self):
        settings = Settings(
            poll_seconds=1800,
            state_dir="/tmp",
            db={},
            min_lat=49.40,
            max_lat=50.05,
            min_lon=8.25,
            max_lon=8.85,
        )
        now = datetime.now(UTC)
        st = sample_station()

        stats = await persist_stations(
            self.conn,
            [st],
            settings,
            now=now,
            payload_bytes=b'{"test": true}',
            payload_sha256=hashlib.sha256(b'{"test": true}').hexdigest(),
        )
        self.assertEqual(stats["stations_updated"], 1)

        # Check sensor_metadata
        meta = await (
            await self.conn.execute(
                "SELECT friendly_name, latitude, longitude FROM sensor_metadata WHERE id=%s",
                (st.sensor_id,),
            )
        ).fetchone()
        self.assertIsNotNone(meta)
        self.assertEqual(meta[0], "UBA Luftgütestation Riedstadt (Riedstadt)")
        self.assertAlmostEqual(float(meta[1]), 49.8252, places=4)
        self.assertAlmostEqual(float(meta[2]), 8.5168, places=4)

        # Check sensor_latest for air_quality_index
        latest_aqi = await self.scalar(
            "SELECT value FROM sensor_latest WHERE sensor_id=%s AND metric='air_quality_index'",
            (st.sensor_id,),
        )
        self.assertAlmostEqual(float(latest_aqi), 1.0)

        # Check sensor_latest for PM10
        latest_pm10 = await self.scalar(
            "SELECT value FROM sensor_latest WHERE sensor_id=%s AND metric='PM10'",
            (st.sensor_id,),
        )
        self.assertAlmostEqual(float(latest_pm10), 12.0)

        # Check sensor_latest for PM25 and mirrored PM2.5
        latest_pm25 = await self.scalar(
            "SELECT value FROM sensor_latest WHERE sensor_id=%s AND metric='PM25'",
            (st.sensor_id,),
        )
        self.assertAlmostEqual(float(latest_pm25), 5.0)

        latest_pm25_mirror = await self.scalar(
            "SELECT value FROM sensor_latest WHERE sensor_id=%s AND metric='PM2.5'",
            (st.sensor_id,),
        )
        self.assertAlmostEqual(float(latest_pm25_mirror), 5.0)

        # Check collection_sources was registered
        src = await (
            await self.conn.execute(
                "SELECT id, adapter, enabled FROM collection_sources WHERE id='uba'"
            )
        ).fetchone()
        self.assertIsNotNone(src)
        self.assertEqual(src[0], "uba")
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
                (f"sensor:{st.sensor_id}",),
            )
            self.assertEqual(entity_name, "UBA Luftgütestation Riedstadt (Riedstadt)")

        # Verify idempotency on second run
        stats2 = await persist_stations(
            self.conn,
            [st],
            settings,
            now=now,
            payload_bytes=b'{"test": true}',
            payload_sha256=hashlib.sha256(b'{"test": true}').hexdigest(),
        )
        self.assertEqual(stats2["stations_updated"], 1)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 5)

    async def test_source_correction_replaces_compatibility_row_and_audits_originals(self):
        settings = Settings(poll_seconds=1800, state_dir="/tmp", db={})
        station = sample_station()
        body = b'{"original": true}'
        await persist_stations(self.conn, [station], settings, payload_bytes=body,
                               payload_sha256=hashlib.sha256(body).hexdigest())
        # Reproduce an old redundant compatibility insert.
        await self.conn.execute("INSERT INTO sensor_data SELECT * FROM sensor_data WHERE metric='air_quality_index'")
        corrected = replace(station, measurements=[replace(station.measurements[0], value=2.0)])
        body = b'{"corrected": true}'
        await persist_stations(self.conn, [corrected], settings, payload_bytes=body,
                               payload_sha256=hashlib.sha256(body).hexdigest())
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data WHERE metric='air_quality_index'"), 1)
        self.assertEqual(await self.scalar("SELECT value FROM sensor_data WHERE metric='air_quality_index'"), 2)
        self.assertEqual(await self.scalar("SELECT jsonb_array_length(original_rows) FROM uba_legacy_repairs"), 2)
        self.assertEqual(await self.scalar("SELECT chosen_value FROM uba_legacy_repairs"), 2)
        self.assertEqual(await self.scalar("SELECT count(*) FROM collected_payloads"), 2)
        self.assertEqual(await self.scalar("""SELECT count(*) FROM reading_revisions r
            JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='air_quality_index'"""), 1)

    async def test_invalid_receipt_is_rejected_before_writing(self):
        settings = Settings(poll_seconds=1800, state_dir="/tmp", db={})
        with self.assertRaisesRegex(ValueError, "checksum"):
            await persist_stations(self.conn, [sample_station()], settings,
                                   payload_bytes=b'bad', payload_sha256='wrong')
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 0)

    async def test_history_repair_requires_receipts_for_every_original_value(self):
        settings = Settings(poll_seconds=1800, state_dir="/tmp", db={})
        st = sample_station()
        stamp = st.measurements[0].observed_at
        slot = stamp.astimezone(BERLIN_TZ).strftime("%Y-%m-%d %H:%M:%S")
        first = datetime.now(UTC)
        for index, value in enumerate((1.0, 2.0)):
            body = json.dumps({"stations": {"indices": ["station code"], "data": {st.station_id: [st.station_code]}},
                               "airquality": {"data": {st.station_id: {slot: [slot, value]}}}}).encode()
            digest = hashlib.sha256(body).hexdigest()
            self.assertEqual(receipt_value(body, digest, st.sensor_id, stamp), value)
            observed = replace(st, measurements=[replace(st.measurements[0], value=value)])
            received = first + timedelta(seconds=index * 10)
            await persist_stations(self.conn, [observed], settings, now=received,
                                   payload_bytes=body, payload_sha256=digest)
            # Historical repair fixture predates metadata-only collection.
            await self.conn.execute("UPDATE collected_payloads SET body=%s WHERE sha256=%s",(body,digest))
            await self.conn.execute("UPDATE collection_attempts SET received_at=%s WHERE payload_sha256=%s", (received, digest))
        # Simulate the old compatibility writer: all provider versions remained.
        await self.conn.execute("INSERT INTO sensor_data(timestamp,sensor_id,metric,value,unit) VALUES (%s,%s,'air_quality_index',1,'index')", (stamp, st.sensor_id))
        await self.conn.execute("INSERT INTO sensor_data(timestamp,sensor_id,metric,value,unit) VALUES (%s,%s,'air_quality_index',7,'index')", (stamp, st.sensor_id))
        with self.assertRaisesRegex(ValueError, "Unexplained legacy"):
            await repair(self.conn, stamp, stamp + timedelta(days=1), apply=True)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 3)
        await self.conn.execute("DELETE FROM sensor_data WHERE value=7")
        before = await self.scalar("SELECT count(*) FROM uba_legacy_repairs")
        report = await repair(self.conn, stamp, stamp + timedelta(days=1))
        self.assertEqual(report, {"verified_keys": 1, "original_rows": 2, "applied": False})
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 2)
        await repair(self.conn, stamp, stamp + timedelta(days=1), apply=True)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 1)
        self.assertEqual(await self.scalar("SELECT value FROM sensor_data"), 2)
        self.assertEqual(await self.scalar("SELECT count(*) FROM uba_legacy_repairs"), before + 1)
        self.assertEqual(await self.scalar("SELECT count(*) FROM collected_payloads"), 2)
