import os
import unittest
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import psycopg
from endpoints.map_sensors import get_map_sensors
from fastapi import HTTPException
from psycopg import sql
from psycopg.errors import QueryCanceled
from psycopg.rows import dict_row


class MapLimitsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.cursor = MagicMock()
        self.cursor.fetchall = AsyncMock(return_value=[])
        self.conn = MagicMock()
        self.conn.execute = AsyncMock(return_value=self.cursor)
        self.pool = MagicMock()
        self.pool.connection.return_value.__aenter__.return_value = self.conn

    async def test_refuses_silent_inventory_truncation(self):
        self.cursor.fetchall.return_value = [{"readings": []}] * 5001
        with self.assertRaises(HTTPException) as error:
            await get_map_sensors(self.pool)
        self.assertEqual(error.exception.status_code, 422)

    async def test_refuses_silent_metric_truncation(self):
        self.cursor.fetchall.return_value = [{"readings": [{}] * 65}]
        with self.assertRaises(HTTPException) as error:
            await get_map_sensors(self.pool)
        self.assertEqual(error.exception.status_code, 422)

    async def test_nonfinite_database_json_values_are_omitted(self):
        self.cursor.fetchall.return_value = [{"readings": [{"value": "NaN"}, {"value": float("inf")}, {"value": 0}]}]
        result = await get_map_sensors(self.pool)
        self.assertEqual(result["sensors"][0]["readings"], [{"value": 0}])

    async def test_database_timeout_is_generic(self):
        self.conn.execute.side_effect = QueryCanceled("internal SQL")
        with self.assertRaises(HTTPException) as error:
            await get_map_sensors(self.pool)
        self.assertEqual(error.exception.status_code, 503)
        self.assertNotIn("internal", error.exception.detail)


DSN = os.getenv("MAP_TEST_DATABASE_URL")


@unittest.skipUnless(DSN, "Set MAP_TEST_DATABASE_URL for latest-reading integration tests")
class LatestMapTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.schema = "map_test_" + uuid4().hex
        self.conn = await psycopg.AsyncConnection.connect(DSN, autocommit=True, row_factory=dict_row)
        if os.getenv("MAP_TEST_TIMESCALE") == "1":
            await self.conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
        await self.conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        await self.conn.execute(sql.SQL("SET search_path TO {},public").format(sql.Identifier(self.schema)))
        self.schema_sql = (Path(__file__).resolve().parents[1] / "schema.sql").read_text()
        if os.getenv("MAP_TEST_TIMESCALE") != "1":
            self.schema_sql = self.schema_sql.replace("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;", "")
            self.schema_sql = self.schema_sql.replace("SELECT create_hypertable('sensor_data', 'timestamp', if_not_exists => TRUE);", "")
        await self.conn.execute(self.schema_sql)
        await self.conn.execute("INSERT INTO sensor_metadata (id,friendly_name,latitude,longitude,is_hidden) VALUES ('a','Public',49.6,8.4,FALSE),('hidden','Hidden',49.6,8.4,TRUE),('empty','Empty',49.6,8.4,FALSE),('invalid','Invalid',999,8.4,FALSE),('group','Parking group',NULL,NULL,FALSE)")
        self.now = datetime(2026, 9, 14, 12, tzinfo=UTC)

    async def asyncTearDown(self):
        await self.conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))
        await self.conn.close()

    async def insert(self, when, value, metric="temperature", unit="°C", sensor="a"):
        await self.conn.execute("INSERT INTO sensor_data (sensor_id,timestamp,value,unit,metric) VALUES (%s,%s,%s,%s,%s)", (sensor, when, value, unit, metric))

    async def latest(self):
        cur = await self.conn.execute("SELECT value,timestamp FROM sensor_latest WHERE sensor_id='a' AND metric='temperature'")
        return await cur.fetchone()

    async def test_out_of_order_inserts_and_corrections(self):
        await self.insert(self.now, 20)
        await self.insert(self.now - timedelta(days=90), 10)
        self.assertEqual((await self.latest())["value"], 20)
        await self.conn.execute("UPDATE sensor_data SET value=21 WHERE timestamp=%s", (self.now,))
        self.assertEqual((await self.latest())["value"], 21)

    async def test_deleting_latest_restores_previous_and_purge_clears_cache(self):
        await self.insert(self.now - timedelta(days=1), 10)
        await self.insert(self.now, 20)
        await self.conn.execute("DELETE FROM sensor_data WHERE timestamp=%s", (self.now,))
        self.assertEqual((await self.latest())["value"], 10)
        await self.conn.execute("DELETE FROM sensor_data WHERE sensor_id='a'")
        await self.conn.execute("DELETE FROM sensor_metadata WHERE id='a'")
        self.assertIsNone(await self.latest())

    async def test_backfill_runs_once_and_handles_old_stations(self):
        await self.conn.execute("DROP TRIGGER sensor_latest_changed ON sensor_data")
        await self.conn.execute("DELETE FROM telemetry_schema_migrations WHERE name='sensor_latest_v1'")
        old = self.now - timedelta(days=90)
        await self.insert(old, 10)
        await self.conn.execute(self.schema_sql)
        self.assertEqual((await self.latest())["timestamp"], old)
        await self.conn.execute(self.schema_sql)
        self.assertEqual((await self.latest())["value"], 10)

    async def test_map_keeps_empty_stations_and_old_values_but_hides_private_ones(self):
        await self.conn.execute("UPDATE sensor_metadata SET firmware_version='2.0.0' WHERE id='a'")
        await self.insert(self.now - timedelta(days=90), 10)
        await self.insert(self.now, 15, sensor="hidden")
        await self.insert(self.now, 5, metric="waveform", unit="counts")
        await self.insert(self.now, 50, metric="relative_humidity", unit="%")

        class Pool:
            @asynccontextmanager
            async def connection(inner):
                yield self.conn

        response = await get_map_sensors(Pool())
        sensors = {s["id"]: s for s in response["sensors"]}
        self.assertEqual(set(sensors), {"a", "empty", "group"})
        self.assertEqual(sensors["empty"]["readings"], [])
        self.assertEqual(sensors["a"]["firmware_version"], "2.0.0")
        self.assertEqual({r["metric"] for r in sensors["a"]["readings"]}, {"temperature", "relative_humidity"})
