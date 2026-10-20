"""TTN webhook authentication, validation and durable idempotent ingestion."""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import patch

import psycopg
from endpoints.sensor_integrations import receive_sensor_uplink
from fastapi import HTTPException
from fastapi.security import HTTPBasicCredentials
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tests"))
from db_support import DatabaseCase


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
        migration = Path(__file__).resolve().parents[1] / "migrations/20261016_ttn_ingestion.sql"
        await self.conn.execute(migration.read_text())
        firmware_migration = Path(__file__).resolve().parents[1] / "migrations/20261017_ttn_firmware_version.sql"
        await self.conn.execute(firmware_migration.read_text())
        await self.conn.execute((Path(__file__).resolve().parents[1] / "migrations/20261018_firmware_version_number.sql").read_text())

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
        sound = await (await self.conn.execute(
            "SELECT value,unit FROM sensor_data WHERE sensor_id='ttn-weather-node-1' AND metric='sound_level'"
        )).fetchone()
        self.assertEqual((sound["value"], sound["unit"]), (-32.4, "dBFS"))
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
        self.assertEqual((coordinates["latitude"], coordinates["longitude"]), (49.6855, 8.3863))
        self.assertTrue(coordinates["is_hidden"])

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
