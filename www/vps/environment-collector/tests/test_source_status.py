"""HTTP access and response parsing failures retain their own source evidence."""

import httpx
from config import Settings
from db_support import DatabaseCase
from source import fetch


class SourceStatusTests(DatabaseCase):
    async def test_optional_http_denial_is_recorded_without_hiding_core_downloads(self):
        settings = Settings(
            db={},
            enable_blitzortung=True,
            enable_radolan=False,
            blitzortung_url="https://example.org/lightning",
        )

        def handler(request):
            return (
                httpx.Response(401)
                if request.url.path == "/lightning"
                else httpx.Response(200, json={})
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            payload = await fetch(client, settings, self.conn)
        self.assertIn("pegel_attempt_id", payload)
        self.assertTrue(
            await self.scalar(
                "SELECT enabled FROM collection_sources WHERE id='environment-blitzortung'"
            )
        )
        self.assertFalse(
            await self.scalar(
                "SELECT enabled FROM collection_sources WHERE id='environment-radolan'"
            )
        )
        self.assertEqual(
            await self.scalar(
                "SELECT interval_seconds FROM collection_sources WHERE id='environment-weather'"
            ),
            settings.poll_seconds,
        )
        row = await (
            await self.conn.execute(
                "SELECT status,http_status,error,error_stage,processed_at FROM collection_attempts WHERE source_id='environment-blitzortung'"
            )
        ).fetchone()
        self.assertEqual(row, ("failed", 401, "HTTP 401", "acquisition", None))

    async def test_required_failure_does_not_leave_prior_download_running(self):
        settings = Settings(db={}, weather_url="https://example.org/weather")

        def handler(request):
            return (
                httpx.Response(503)
                if request.url.path == "/weather"
                else httpx.Response(200, json={})
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with self.assertRaises(httpx.HTTPStatusError):
                await fetch(client, settings, self.conn)
        self.assertEqual(
            await self.scalar(
                "SELECT status FROM collection_attempts WHERE source_id='environment-pegel'"
            ),
            "failed",
        )
        self.assertEqual(
            await self.scalar(
                "SELECT error_stage FROM collection_attempts WHERE source_id='environment-weather'"
            ),
            "acquisition",
        )

    async def test_invalid_json_is_processing_failure_after_successful_download(self):
        settings = Settings(db={})
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=b"not-json")
            )
        ) as client:
            with self.assertRaises(ValueError):
                await fetch(client, settings, self.conn)
        row = await (
            await self.conn.execute(
                "SELECT status,error_stage,fetched_at,processed_at FROM collection_attempts"
            )
        ).fetchone()
        self.assertEqual(row[:2], ("failed", "processing"))
        self.assertIsNotNone(row[2])
        self.assertIsNone(row[3])

    async def test_xweather_empty_window_and_secret_redaction(self):
        import sys
        from pathlib import Path
        sys.path.append(str(Path(__file__).resolve().parents[2] / "api" / "v1"))
        from measurement_migration import install
        await install(self.conn, shadow=True)
        from datetime import UTC, datetime

        from normalize import normalize
        from storage import persist_environment_data
        settings = Settings(db={}, enable_xweather=True, enable_blitzortung=False,
                            enable_radolan=False, enable_mosmix=False,
                            xweather_client_id='private-id', xweather_client_secret='private-secret')

        def handler(request):
            if request.url.path.endswith('/closest'):
                self.assertEqual(request.url.params['limit'], '1000')
                self.assertEqual(request.url.params['client_secret'], 'private-secret')
                return httpx.Response(200, json={'success': True, 'error': {'code': 'warn_no_data'},
                                               'response': [], 'echo': 'private-secret'})
            return httpx.Response(200, json={})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            payload = await fetch(client, settings, self.conn)
        lightning = normalize(payload, settings).lightning
        await persist_environment_data(self.conn, [], [], datetime.now(UTC), lightning=lightning, payload=payload)
        row = await (await self.conn.execute("SELECT status,item_count FROM collection_attempts WHERE source_id='environment-xweather'")).fetchone()
        self.assertEqual(row, ('success', 1))
        body = await self.scalar("SELECT body FROM collected_payloads WHERE sha256=%s", (payload['xweather_sha256'],))
        self.assertNotIn(b'private-secret', bytes(body))
        row = await (await self.conn.execute("SELECT d.source_id,r.value,r.period_end-r.period_start FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.source_id='environment-xweather' AND d.metric='lightning_strikes_count'")).fetchone()
        from datetime import timedelta
        self.assertEqual(row, ('environment-xweather', 0, timedelta(minutes=5)))

    async def test_xweather_quota_response_records_reset_and_skips_until_then(self):
        from datetime import UTC, datetime, timedelta
        settings = Settings(db={}, enable_xweather=True, enable_blitzortung=False,
                            enable_radolan=False, enable_mosmix=False,
                            xweather_client_id='id', xweather_client_secret='secret')
        reset = (datetime.now(UTC) + timedelta(hours=2)).replace(microsecond=0)
        calls = 0

        def handler(request):
            nonlocal calls
            if request.url.path.endswith('/closest'):
                calls += 1
                return httpx.Response(429, json={'success': False, 'error': {'code': 'maxhits'}},
                                      headers={'X-RateLimit-Reset-Period': reset.isoformat()})
            return httpx.Response(200, json={})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await fetch(client, settings, self.conn)
        error = await self.scalar("SELECT error FROM collection_attempts WHERE source_id='environment-xweather'")
        self.assertIn('maxhits', error)
        self.assertIn(reset.isoformat(), error)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await fetch(client, settings, self.conn)
        self.assertEqual(calls, 1)
