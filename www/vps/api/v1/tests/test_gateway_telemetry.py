"""Real database coverage for retries, late uploads, rollup and scoped retention."""

import hashlib
import sys
import unittest
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from psycopg.rows import dict_row
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tests"))
from db_support import DatabaseCase
from dependencies import get_db_pool, verify_admin_key
from endpoints.gateways import router
from gateway_contract import Batch, Reading
from gateway_storage import history, ingest, maintain
from measurement_migration import install

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


class ContractTests(unittest.TestCase):
    def test_unknown_nan_bounds_dimensions_and_time_rejected(self):
        for data in [
            {"metric": "evil", "value": 1},
            {"metric": "cpu_temperature", "value": float("nan")},
            {"metric": "cpu_temperature", "value": 200},
            {"metric": "cpu_temperature", "value": 20, "dimensions": {"state": "x"}},
        ]:
            with self.assertRaises(ValidationError):
                Reading(**data)
        with self.assertRaises(ValidationError):
            Batch(
                version=1,
                samples=[
                    {
                        "sample_id": str(uuid4()),
                        "boot_id": str(uuid4()),
                        "sequence": 1,
                        "observed_at": "2020-01-01T00:00:00Z",
                        "readings": [{"metric": "cpu_temperature", "value": 42}],
                    }
                ],
            )


class GatewayTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await install(self.conn)
        await self.conn.execute((MIGRATIONS / "20261103_core_storage.sql").read_text())
        await self.conn.execute(
            (MIGRATIONS / "20261103_gateway_telemetry.sql").read_text()
        )
        self.conn.row_factory = dict_row
        await self.conn.execute(
            "INSERT INTO entities(id,name,entity_type,is_hidden) VALUES('gateway:test','Test','gateway',true),('sensor:other','Other','sensor',false)"
        )
        await self.conn.execute(
            "INSERT INTO gateway_devices(id,entity_id,name,token_hash) VALUES('test','gateway:test','Test',%s)",
            (hashlib.sha256(b"test-token").hexdigest(),),
        )
        self.now = datetime.now(UTC).replace(
            minute=0, second=0, microsecond=0
        ) - timedelta(hours=2)

    def batch(self, value=42, minute=0):
        return Batch(
            version=1,
            samples=[
                {
                    "sample_id": uuid4(),
                    "boot_id": uuid4(),
                    "sequence": 1,
                    "observed_at": self.now + timedelta(minutes=minute),
                    "readings": [{"metric": "cpu_temperature", "value": value}],
                }
            ],
        )

    async def values(self, query, params=None):
        return await (await self.conn.execute(query, params)).fetchall()

    async def test_retry_and_conflicting_identity(self):
        batch = self.batch()
        async with self.conn.transaction():
            self.assertEqual((await ingest(self.conn, "test", batch))["inserted"], 1)
        async with self.conn.transaction():
            self.assertEqual((await ingest(self.conn, "test", batch))["inserted"], 0)
        batch.samples[0].readings[0].value = 43
        with self.assertRaises(HTTPException):
            async with self.conn.transaction():
                await ingest(self.conn, "test", batch)
        self.assertEqual(
            (await self.values("SELECT count(*) AS n FROM readings"))[0]["n"], 1
        )

    async def test_late_arrival_recomputes_without_duplicates(self):
        async with self.conn.transaction():
            await ingest(self.conn, "test", self.batch(40))
            await maintain(self.conn)
        async with self.conn.transaction():
            await ingest(self.conn, "test", self.batch(50, 1))
            await maintain(self.conn)
            await maintain(self.conn)
        rows = await self.values(
            "SELECT dimensions->>'statistic' AS stat,value FROM readings JOIN measurement_definitions d ON d.id=measurement_id WHERE dimensions->>'resolution'='hour'"
        )
        self.assertEqual(
            {r["stat"]: r["value"] for r in rows},
            {"min": 40, "max": 50, "sum": 90, "count": 2},
        )

    async def test_retention_only_after_rollup_and_only_gateway_minutes(self):
        async with self.conn.transaction():
            await ingest(self.conn, "test", self.batch())
            await self.conn.execute(
                "SELECT write_measurement('sensor:other','temperature','°C','other','observed','{}',%s,12,%s)",
                (self.now, self.now),
            )
        future = self.now + timedelta(days=92)
        # Zero maintenance budget cannot erase unaggregated data.
        async with self.conn.transaction():
            await maintain(self.conn, now=future, limit=0, delete=True)
        self.assertEqual(len(await self.values("SELECT * FROM readings")), 2)
        async with self.conn.transaction():
            result = await maintain(self.conn, now=future, delete=True)
        self.assertEqual(result["deleted"], 1)
        self.assertEqual(
            len(
                await self.values(
                    "SELECT * FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE source_id='other'"
                )
            ),
            1,
        )
        self.assertEqual(
            len(
                await self.values(
                    "SELECT * FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE dimensions->>'resolution'='hour'"
                )
            ),
            4,
        )

    async def test_history_pending_hours_and_daily_weighting(self):
        async with self.conn.transaction():
            await ingest(self.conn, "test", self.batch(40))
            await maintain(self.conn)
            await ingest(self.conn, "test", self.batch(50, 1))
        rows, resolution = await history(
            self.conn,
            "gateway:test",
            "test",
            "cpu_temperature",
            self.now - timedelta(days=1),
            7,
        )
        self.assertEqual(resolution, "hour")
        self.assertEqual(
            {r["dimensions"]["statistic"]: r["value"] for r in rows},
            {"min": 40, "max": 50, "sum": 90, "count": 2},
        )
        async with self.conn.transaction():
            await maintain(self.conn)
        rows, resolution = await history(
            self.conn,
            "gateway:test",
            "test",
            "cpu_temperature",
            self.now - timedelta(days=1),
            365,
        )
        self.assertEqual(resolution, "day")
        self.assertEqual(
            {r["dimensions"]["statistic"]: r["value"] for r in rows},
            {"min": 40, "max": 50, "sum": 90, "count": 2},
        )

    async def test_http_auth_private_read_and_atomic_ack(self):
        conn = self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                yield conn

        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.dependency_overrides[get_db_pool] = lambda: Pool()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            body = self.batch().model_dump(mode="json")
            response = await client.post(
                "/api/v1/gateways/test/telemetry/batch",
                json=body,
                headers={"Authorization": "Bearer wrong"},
            )
            self.assertEqual(response.status_code, 401)
            response = await client.post(
                "/api/v1/gateways/test/telemetry/batch",
                json=body,
                headers={"Authorization": "Bearer test-token"},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["inserted"], 1)
            response = await client.get("/api/v1/admin/gateways")
            self.assertIn(response.status_code, (401, 403))
            app.dependency_overrides[verify_admin_key] = lambda: "test-admin"
            response = await client.get("/api/v1/admin/gateways/test?days=7")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["fresh"], False)
            self.assertEqual(len(response.json()["series"]), 4)
