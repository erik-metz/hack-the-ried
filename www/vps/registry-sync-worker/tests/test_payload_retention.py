"""Raw replies are transient; derived publications and served files remain usable."""

import hashlib
import sys
from pathlib import Path

import httpx
from psycopg.errors import CheckViolation
from db_support import DatabaseCase
from publications import acquire, import_json

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ops"))
from purge_raw_payloads import cleanup


class PayloadRetentionTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        sys.path.append(str(Path(__file__).resolve().parents[2] / "api/v1"))
        from measurement_migration import install

        await install(self.conn)

    async def test_successful_pipeline_works_with_database_guard_and_no_raw_body(self):
        await self.conn.execute(
            "ALTER TABLE collected_payloads ADD CONSTRAINT no_raw_body CHECK(body IS NULL)"
        )
        body = b'{"source_updated_at":"2026-10-01T00:00:00+00:00","datasets":{"test/data":[{"name":"Original","value":-1.25}]}}'
        source = {
            "id": "test",
            "url": "https://example.org/test",
            "max_age_seconds": 604800,
            "datasets": {"test/data": {"type": "array", "required": ["name", "value"]}},
        }
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=body)
            )
        ) as client:
            await import_json(self.conn, client, source)
        self.assertEqual(
            await self.scalar(
                "SELECT data FROM collected_datasets WHERE dataset='test/data'"
            ),
            [{"name": "Original", "value": -1.25}],
        )
        self.assertEqual(
            await self.scalar("SELECT sha256 FROM collected_payloads"),
            hashlib.sha256(body).hexdigest(),
        )
        self.assertEqual(
            await self.scalar("SELECT size_bytes FROM collected_payloads"), len(body)
        )
        self.assertIsNone(await self.scalar("SELECT body FROM collected_payloads"))

    async def test_error_sample_is_small_redacted_and_expires(self):
        import os
        from unittest.mock import patch

        source = {
            "id": "failure",
            "url": "https://example.org/data",
            "header_env": {"Authorization": "TEST_PAYLOAD_SECRET"},
        }
        with patch.dict(os.environ, {"TEST_PAYLOAD_SECRET": "private-credential"}):
            async with httpx.AsyncClient(
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(
                        503, content=b"private-credential " + b"x" * 100000
                    )
                )
            ) as client:
                with self.assertRaises(httpx.HTTPStatusError):
                    await acquire(self.conn, client, source)
        sample = await self.scalar("SELECT body FROM collection_failure_samples")
        self.assertLessEqual(len(sample), 65536)
        self.assertNotIn(b"private-credential", sample)
        self.assertIn(b"[REDACTED]", sample)
        self.assertIsNone(await self.scalar("SELECT body FROM collected_payloads"))
        await self.conn.execute(
            "UPDATE collection_failure_samples SET expires_at=NOW()-INTERVAL '1 second'"
        )
        await self.conn.execute("SELECT retain_collection_failure(NULL,NULL)")
        self.assertEqual(
            await self.scalar("SELECT count(*) FROM collection_failure_samples"), 0
        )

    async def test_error_sample_global_budget_evicts_oldest(self):
        await self.conn.execute(
            "INSERT INTO collection_attempts(id,source_id,status) SELECT n,'failed','failed' FROM generate_series(1,1025) n"
        )
        await self.conn.execute(
            "INSERT INTO collection_failure_samples(attempt_id,body) SELECT n,convert_to(repeat('x',65536),'UTF8') FROM generate_series(1,1024) n"
        )
        await self.conn.execute(
            "SELECT retain_collection_failure(1025,convert_to(repeat('y',65536),'UTF8'))"
        )
        self.assertEqual(
            await self.scalar(
                "SELECT sum(octet_length(body)) FROM collection_failure_samples"
            ),
            67108864,
        )
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collection_failure_samples WHERE attempt_id=1025"
            ),
            1,
        )

    async def test_existing_bodies_are_purged_but_files_checksums_and_calendar_survive(
        self,
    ):
        raw = b"original reply"
        digest = hashlib.sha256(raw).hexdigest()
        crop = b"file product"
        sha = hashlib.sha256(crop).hexdigest()
        calendar = b"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261103\r\nSUMMARY:Papier\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        calsha = hashlib.sha256(calendar).hexdigest()
        for checksum, body, mime in [
            (digest, raw, "application/json"),
            (sha, crop, "application/x-npz"),
            (calsha, calendar, "text/calendar"),
        ]:
            await self.conn.execute(
                "INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,%s,%s)",
                (checksum, body, mime),
            )
        await self.conn.execute(
            "INSERT INTO collection_checkpoints(source_id,item_key,payload_sha256,fetched_at) VALUES ('calendar','address',%s,NOW())",
            (calsha,),
        )
        await self.conn.execute(
            "INSERT INTO entities(id,name,entity_type) VALUES ('sensor:retention','Original','sensor')"
        )
        await self.conn.execute("""SELECT write_measurement('sensor:retention','temperature','C','retention','observed','{}',
            '2026-10-01T00:00:00.123456Z',-1.234567890123456789,'2026-10-01','{}')""")
        original = await (await self.conn.execute("SELECT * FROM readings")).fetchall()
        await self.conn.execute("""INSERT INTO data_archives(month,generated_at,is_complete,reading_count,size_bytes,station_ids,files)
            VALUES ('2026-09',NOW(),true,0,0,'{}','[]')""")
        await cleanup(self.conn, apply=False)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collected_payloads WHERE body IS NOT NULL"
            ),
            3,
        )
        await cleanup(self.conn, apply=True)
        await cleanup(self.conn, apply=True)
        self.assertEqual(
            await self.scalar("SELECT count(*) FROM collected_payloads"), 3
        )
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collected_payloads WHERE body IS NOT NULL"
            ),
            0,
        )
        self.assertEqual(
            await self.scalar("SELECT body FROM collected_file_assets"), crop
        )
        self.assertEqual(
            await self.scalar("SELECT parsed_data FROM collection_checkpoints"),
            [
                {
                    "date": "2026-11-03",
                    "fraction": "Papier",
                    "coverage": "representative_address_only",
                }
            ],
        )
        self.assertEqual(
            await (await self.conn.execute("SELECT * FROM readings")).fetchall(),
            original,
        )
        self.assertEqual(await self.scalar("SELECT count(*) FROM data_archives"), 1)
        with self.assertRaises(CheckViolation):
            await self.conn.execute(
                "INSERT INTO collected_payloads(sha256,body,content_type) VALUES ('forbidden','x','text/plain')"
            )


def test_live_producers_never_insert_raw_reply_bodies():
    import ast
    import re

    root = Path(__file__).resolve().parents[2]
    for directory in (
        "environment-collector",
        "registry-sync-worker",
        "opensensemap-collector",
        "uba-collector",
        "ttnmapper-collector",
        "aircraft-collector",
        "ais-collector",
    ):
        for filename in (root / directory).glob("*.py"):
            for node in ast.walk(ast.parse(filename.read_text())):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    assert not re.search(
                        r"INSERT INTO collected_payloads\s*\([^)]*\bbody\b", node.value
                    ), filename
