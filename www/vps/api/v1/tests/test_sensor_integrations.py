"""TTN webhook authentication, validation and durable idempotent ingestion."""

import json
import os
import sys
import unittest
from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

import psycopg
from endpoints.sensor_integrations import (
    _sound_events,
    _window_statistics,
    _write_canonical_readings,
    receive_sensor_uplink,
)
from fastapi import HTTPException
from fastapi.security import HTTPBasicCredentials
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tests"))
from db_support import DatabaseCase


class WindowStatisticsValidationTests(TestCase):
    def test_valid_window_statistics_match_compatibility_measurements(self):
        decoded = {
            "window_seconds": 300,
            "measurements": [{"metric": "co2", "value": 500, "unit": "ppm"}],
            "window_statistics": [{"metric": "co2", "unit": "ppm", "min_value": 450,
                                   "mean_value": 500, "max_value": 620, "sample_count": 60}],
        }
        self.assertEqual(_window_statistics(decoded), (300, [{
            "metric": "co2", "unit": "ppm", "min_value": 450.0,
            "mean_value": 500.0, "max_value": 620.0, "sample_count": 60,
        }]))

    def test_invalid_range_and_measurement_mismatch_are_rejected(self):
        decoded = {
            "window_seconds": 300,
            "measurements": [{"metric": "co2", "value": 500, "unit": "ppm"}],
            "window_statistics": [{"metric": "co2", "unit": "ppm", "min_value": 501,
                                   "mean_value": 500, "max_value": 620, "sample_count": 60}],
        }
        with self.assertRaises(HTTPException):
            _window_statistics(decoded)
        decoded["window_statistics"][0]["min_value"] = 450
        decoded["window_statistics"][0]["mean_value"] = 510
        with self.assertRaises(HTTPException):
            _window_statistics(decoded)


class SoundEventsValidationTests(TestCase):
    def test_valid_sound_events_parsing(self):
        decoded = {
            "sound_events": [
                {"class": "dog", "class_id": 0, "count": 5, "max_score": 0.75},
                {"class": "siren", "class_id": 42, "count": 2, "max_score": 0.88},
            ]
        }
        self.assertEqual(_sound_events(decoded), [
            {"class": "dog", "class_id": 0, "count": 5, "max_score": 0.75},
            {"class": "siren", "class_id": 42, "count": 2, "max_score": 0.88},
        ])

    def test_sound_events_invalid_or_duplicate(self):
        with self.assertRaises(HTTPException):
            _sound_events({"sound_events": "invalid"})
        with self.assertRaises(HTTPException):
            _sound_events({"sound_events": [{"class": "dog", "count": 1}, {"class": "dog", "count": 2}]})


class CanonicalWriterTests(unittest.IsolatedAsyncioTestCase):
    async def test_sound_events_become_canonical_readings_with_taxonomy_dimensions(self):
        class Connection:
            def __init__(self):
                self.calls = []

            async def execute(self, query, params):
                self.calls.append((query, params))

        conn = Connection()
        end = datetime.fromisoformat("2026-10-20T10:05:00+00:00")
        events = [
            {"class": "dog", "class_id": 0, "count": 5, "max_score": 0.75},
            {"class": "siren", "class_id": 42, "count": 2, "max_score": 0.88},
        ]
        await _write_canonical_readings(
            conn, sensor_id="ttn-rak", device_id="rak",
            application_id="ried-sensors", event_id="event-1", observed_at=end,
            collected_at=end, measurements=[{"metric": "sound_level", "unit": "dBFS", "value": -32.4}],
            window=(300, []), sound_events=events,
        )
        writes = [params for query, params in conn.calls if "write_measurement" in query]
        sound_writes = [w for w in writes if w[1] == "sound_event_count"]
        self.assertEqual(len(sound_writes), 2)
        dog_write = next(w for w in sound_writes if json.loads(w[4])["class"] == "dog")
        self.assertEqual(dog_write[2], "count")
        self.assertEqual(dog_write[6], Decimal("5"))
        self.assertEqual(json.loads(dog_write[4])["taxonomy"], "esc50_v1")
        self.assertEqual(json.loads(dog_write[8])["max_score"], 0.75)

    async def test_window_statistics_become_three_canonical_readings(self):
        class Connection:
            def __init__(self):
                self.calls = []

            async def execute(self, query, params):
                self.calls.append((query, params))

        conn = Connection()
        end = datetime.fromisoformat("2026-10-20T10:05:00+00:00")
        stats = [{"metric": "sound_level", "unit": "dBFS", "min_value": -60,
                  "mean_value": -32.4, "max_value": -18.1, "sample_count": 18750}]
        await _write_canonical_readings(conn, sensor_id="ttn-rak", device_id="rak",
            application_id="ried-sensors", event_id="event-1", observed_at=end,
            collected_at=end, measurements=[{"metric": "sound_level", "unit": "dBFS",
                                             "value": -32.4}], window=(300, stats))
        writes = [params for query, params in conn.calls if "write_measurement" in query]
        self.assertEqual(len(writes), 3)
        self.assertEqual({json.loads(row[4])["statistic"] for row in writes},
                         {"min", "mean", "max"})
        self.assertTrue(all(row[3] == "ttn:ried-sensors" for row in writes))
        self.assertTrue(all(row[9] == end.replace(minute=0) for row in writes))


class SensorIntegrationTests(DatabaseCase):
    def pool(self):
        db = self.db

        class Pool:
            @asynccontextmanager
            async def connection(self):
                async with await psycopg.AsyncConnection.connect(
                    **db, row_factory=dict_row
                ) as conn:
                    yield conn

        return Pool()

    async def asyncSetUp(self):
        await super().asyncSetUp()
        core_schema = Path(__file__).resolve().parents[1] / "migrations/20260930_measurements.sql"
        await self.conn.execute(core_schema.read_text())
        await self.conn.execute((Path(__file__).resolve().parents[1] / "migrations/20261021_ttn_interval_statistics.sql").read_text())
        migration = Path(__file__).resolve().parents[1] / "migrations/20261016_ttn_ingestion.sql"
        await self.conn.execute(migration.read_text())
        firmware_migration = Path(__file__).resolve().parents[1] / "migrations/20261017_ttn_firmware_version.sql"
        await self.conn.execute(firmware_migration.read_text())
        await self.conn.execute((Path(__file__).resolve().parents[1] / "migrations/20261018_firmware_version_number.sql").read_text())
        await self.conn.execute((Path(__file__).resolve().parents[1] / "migrations/20261020_sensor_window_statistics.sql").read_text())

    def uplink(self):
        return {
            "end_device_ids": {
                "device_id": "weather-node-1",
                "application_ids": {"application_id": "ried-sensors"},
            },
            "received_at": "2026-10-16T08:30:00Z",
            "correlation_ids": ["as:up:unique-uplink-1"],
            "uplink_message": {
                "f_port": 1,
                "f_cnt": 42,
                "frm_payload": "AQID",
                "decoded_payload": {
                    "firmware_version": 2,
                    "measurements": [
                        {"metric": "temperature", "value": 18.5, "unit": "°C"},
                        {"metric": "humidity", "value": 62, "unit": "%"},
                        {"metric": "sound_level", "value": -32.4, "unit": "dBFS"},
                    ]
                },
                "locations": {"user": {"latitude": 49.6855, "longitude": 8.3863}},
            },
        }

    async def test_uplink_is_stored_once_and_new_sensor_stays_hidden(self):
        credentials = HTTPBasicCredentials(username="ttn-user", password="ttn-secret")
        with patch.dict(os.environ, {
            "TTN_APPLICATION_ID": "ried-sensors",
            "TTN_WEBHOOK_USERNAME": "ttn-user",
            "TTN_WEBHOOK_PASSWORD": "ttn-secret",
        }):
            accepted = await receive_sensor_uplink(self.uplink(), credentials, self.pool())
            duplicate = await receive_sensor_uplink(self.uplink(), credentials, self.pool())

        self.assertEqual(accepted["status"], "accepted")
        self.assertEqual(accepted["sensor_id"], "ttn-weather-node-1")
        self.assertEqual(accepted["inserted_count"], 3)
        self.assertEqual(duplicate["status"], "duplicate")
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 3)
        self.assertEqual(await self.scalar("""SELECT count(*) FROM readings r
            JOIN measurement_definitions d ON d.id=r.measurement_id
            WHERE d.entity_id='sensor:ttn-weather-node-1' AND d.source_id='ttn:ried-sensors'"""), 3)
        sound = await (await self.conn.execute(
            "SELECT value,unit FROM sensor_data WHERE sensor_id='ttn-weather-node-1' AND metric='sound_level'"
        )).fetchone()
        self.assertEqual((sound[0], sound[1]), (-32.4, "dBFS"))
        self.assertEqual(await self.scalar("SELECT count(*) FROM ttn_uplink_events"), 1)
        hidden = await self.scalar(
            "SELECT is_hidden FROM sensor_metadata WHERE id='ttn-weather-node-1'"
        )
        self.assertTrue(hidden)
        firmware = await self.scalar(
            "SELECT firmware_version FROM sensor_metadata WHERE id='ttn-weather-node-1'"
        )
        self.assertEqual(firmware, 2)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data WHERE metric='firmware_version'"), 0)
        coordinates = await (await self.conn.execute(
            "SELECT latitude,longitude,is_hidden FROM sensor_metadata WHERE id='ttn-weather-node-1'"
        )).fetchone()
        self.assertEqual((coordinates[0], coordinates[1]), (49.6855, 8.3863))
        self.assertTrue(coordinates[2])

    async def test_invalid_firmware_metadata_is_rejected(self):
        credentials = HTTPBasicCredentials(username="ttn-user", password="ttn-secret")
        body = self.uplink()
        body["uplink_message"]["decoded_payload"]["firmware_version"] = "v2"
        with patch.dict(os.environ, {
            "TTN_APPLICATION_ID": "ried-sensors",
            "TTN_WEBHOOK_USERNAME": "ttn-user",
            "TTN_WEBHOOK_PASSWORD": "ttn-secret",
        }), self.assertRaises(HTTPException) as error:
            await receive_sensor_uplink(body, credentials, self.pool())
        self.assertEqual(error.exception.status_code, 422)

    async def test_changed_payload_cannot_reuse_ttn_correlation_identity(self):
        credentials = HTTPBasicCredentials(username="ttn-user", password="ttn-secret")
        body = self.uplink()
        with patch.dict(os.environ, {
            "TTN_APPLICATION_ID": "ried-sensors",
            "TTN_WEBHOOK_USERNAME": "ttn-user",
            "TTN_WEBHOOK_PASSWORD": "ttn-secret",
        }):
            await receive_sensor_uplink(body, credentials, self.pool())
            body["uplink_message"]["decoded_payload"]["measurements"][0]["value"] = 99
            with self.assertRaises(HTTPException) as error:
                await receive_sensor_uplink(body, credentials, self.pool())
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 3)

    async def test_accepts_full_sensor_codebook_uplink(self):
        credentials = HTTPBasicCredentials(username="ttn-user", password="ttn-secret")
        body = self.uplink()
        body["correlation_ids"] = ["as:up:full-sensor-codebook"]
        body["uplink_message"]["decoded_payload"]["measurements"] = [
            {"metric": f"bom_metric_{index}", "value": index, "unit": "raw"}
            for index in range(41)
        ]
        with patch.dict(os.environ, {
            "TTN_APPLICATION_ID": "ried-sensors",
            "TTN_WEBHOOK_USERNAME": "ttn-user",
            "TTN_WEBHOOK_PASSWORD": "ttn-secret",
        }):
            accepted = await receive_sensor_uplink(body, credentials, self.pool())
        self.assertEqual(accepted["inserted_count"], 41)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 41)

    async def test_window_uplink_stores_means_and_interval_statistics(self):
        credentials = HTTPBasicCredentials(username="ttn-user", password="ttn-secret")
        body = self.uplink()
        decoded = body["uplink_message"]["decoded_payload"]
        decoded.update({
            "version": 5,
            "firmware_version": 11,
            "window_seconds": 300,
            "window_statistics": [
                {"metric": "temperature", "unit": "°C", "min_value": 17.8,
                 "mean_value": 18.5, "max_value": 19.2, "sample_count": 300},
                {"metric": "humidity", "unit": "%", "min_value": 61.2,
                 "mean_value": 62, "max_value": 62.8, "sample_count": 300},
                {"metric": "sound_level", "unit": "dBFS", "min_value": -60,
                 "mean_value": -32.4, "max_value": -18.1, "sample_count": 18750},
            ],
        })
        with patch.dict(os.environ, {
            "TTN_APPLICATION_ID": "ried-sensors",
            "TTN_WEBHOOK_USERNAME": "ttn-user",
            "TTN_WEBHOOK_PASSWORD": "ttn-secret",
        }):
            accepted = await receive_sensor_uplink(body, credentials, self.pool())

        self.assertEqual(accepted["status"], "accepted")
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_measurement_windows"), 0)
        stored_mean = await self.scalar("SELECT value FROM sensor_data WHERE metric='sound_level'")
        self.assertEqual(stored_mean, -32.4)
        canonical = await (await self.conn.execute("""SELECT d.dimensions->>'statistic',r.value,
                r.period_start,r.period_end,r.provenance->>'sample_count'
            FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
            WHERE d.entity_id='sensor:ttn-weather-node-1' AND d.source_id='ttn:ried-sensors'
                AND d.metric='sound_level' ORDER BY d.dimensions->>'statistic'""")).fetchall()
        self.assertEqual([(row[0], row[1], row[4]) for row in canonical], [
            ("max", Decimal("-18.1"), "18750"),
            ("mean", Decimal("-32.4"), "18750"),
            ("min", Decimal(-60), "18750"),
        ])
        self.assertTrue(all((row[2], row[3]) == (canonical[0][2], canonical[0][3])
                            for row in canonical))
        self.assertEqual(await self.scalar("""SELECT count(*) FROM readings r
            JOIN measurement_definitions d ON d.id=r.measurement_id
            WHERE d.entity_id='sensor:ttn-weather-node-1'"""), 9)

    async def test_rejects_inconsistent_or_incomplete_window_statistics(self):
        credentials = HTTPBasicCredentials(username="ttn-user", password="ttn-secret")
        body = self.uplink()
        body["uplink_message"]["decoded_payload"].update({
            "window_seconds": 300,
            "window_statistics": [{"metric": "temperature", "unit": "°C",
                "min_value": 20, "mean_value": 18.5, "max_value": 21, "sample_count": 3}],
        })
        with patch.dict(os.environ, {
            "TTN_APPLICATION_ID": "ried-sensors",
            "TTN_WEBHOOK_USERNAME": "ttn-user",
            "TTN_WEBHOOK_PASSWORD": "ttn-secret",
        }), self.assertRaises(HTTPException) as error:
            await receive_sensor_uplink(body, credentials, self.pool())
        self.assertEqual(error.exception.status_code, 422)

    async def test_invalid_credentials_and_unconfigured_application_are_rejected(self):
        with patch.dict(os.environ, {
            "TTN_APPLICATION_ID": "ried-sensors",
            "TTN_WEBHOOK_USERNAME": "ttn-user",
            "TTN_WEBHOOK_PASSWORD": "ttn-secret",
        }), self.assertRaises(HTTPException) as error:
            await receive_sensor_uplink(self.uplink(), HTTPBasicCredentials(
                username="wrong", password="wrong"
            ), self.pool())
        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(await self.scalar("SELECT count(*) FROM sensor_data"), 0)
