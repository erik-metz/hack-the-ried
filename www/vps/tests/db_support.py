"""Disposable-schema integration harness; requires an explicit test DSN."""

import hashlib
import os
import unittest
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql

DSN = os.getenv("COLLECTOR_TEST_DATABASE_URL")


def payload_digest(body):
    return hashlib.sha256(body.encode() if isinstance(body, str) else body).hexdigest()


class DatabaseCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        if not DSN:
            self.skipTest("Set COLLECTOR_TEST_DATABASE_URL to a disposable database")
        self.schema = "collector_test_" + uuid4().hex
        self.conn = await psycopg.AsyncConnection.connect(DSN, autocommit=True)
        await self.conn.execute(
            sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema))
        )
        await self.conn.execute(
            sql.SQL("SET search_path TO {}, public").format(sql.Identifier(self.schema))
        )
        schema = (Path(__file__).resolve().parents[1] / "api/v1/schema.sql").read_text()
        if os.getenv("COLLECTOR_TEST_TIMESCALE") != "1":
            schema = schema.replace(
                "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;", ""
            )
            schema = schema.replace(
                "SELECT create_hypertable('sensor_data', 'timestamp', if_not_exists => TRUE);",
                "",
            )
            schema = schema.replace("SELECT create_hypertable('movement_positions','timestamp',if_not_exists => TRUE);", "")
        await self.conn.execute(schema)
        await self.conn.execute(schema)
        self.db = {"conninfo": DSN, "options": f"-c search_path={self.schema},public"}

    async def asyncTearDown(self):
        await self.conn.execute(
            sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema))
        )
        await self.conn.close()

    async def scalar(self, query, params=None):
        return (await (await self.conn.execute(query, params)).fetchone())[0]
