"""Soil forecasts: source-time identity, physical units and archived imports."""

import json
import sys
import unittest
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from config import Settings
from soil import POINTS, VARIABLES, normalize, persist, request_url

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tests'))
from db_support import DatabaseCase


def bundle():
    data = []
    for point in POINTS:
        hourly = {'time': ['2026-10-06T00:00', '2026-10-06T01:00']}
        units = {'time': 'iso8601'}
        for variable, (_, unit, _, _, _) in VARIABLES.items():
            hourly[variable] = [None, .2]
            units[variable] = unit
        data.append({'latitude': point[2], 'longitude': point[3], 'utc_offset_seconds': 0,
                     'hourly': hourly, 'hourly_units': units})
    return {'data': data, 'run': '2026-10-06T00:00:00+00:00', 'attempt_id': 1,
            'url': 'https://single-runs-api.open-meteo.com/v1/forecast?run=2026-10-06T00:00'}


class SoilParsingTests(unittest.TestCase):
    def test_depth_units_missing_and_previous_hour_totals(self):
        points = normalize(bundle())
        self.assertEqual(len(points), 4)
        rows = points[0]['rows']
        moisture = rows[0]
        self.assertEqual(moisture[2], {'depth_start_cm': 0, 'depth_end_cm': 1})
        self.assertEqual(moisture[5], 'missing')
        total = next(r for r in rows if r[0]=='reference_evapotranspiration' and r[4] is not None)
        self.assertEqual(total[6], datetime(2026, 10, 6, tzinfo=UTC))
        self.assertEqual(total[7], datetime(2026, 10, 6, 1, tzinfo=UTC))

    def test_explicit_run_is_not_acquisition_time(self):
        url, run = request_url('https://example.org', datetime(2026, 10, 6, 15, 30, tzinfo=UTC))
        self.assertEqual(run, datetime(2026, 10, 6, 6, tzinfo=UTC))
        self.assertIn('models=icon_global', url)
        self.assertIn('run=2026-10-06T06%3A00', url)

    def test_rejects_partial_wrong_units_duplicate_times_and_invalid_values(self):
        samples = []
        sample = bundle(); sample['data'].pop(); samples.append(sample)
        sample = bundle(); sample['data'][0]['hourly_units']['soil_temperature_0cm']='K'; samples.append(sample)
        sample = bundle(); sample['data'][0]['hourly']['time'][1]='2026-10-06T00:00'; samples.append(sample)
        sample = bundle(); sample['data'][0]['hourly']['soil_moisture_0_to_1cm'][1]=2; samples.append(sample)
        sample = bundle(); sample['data'][0]['hourly']['shortwave_radiation'][1]=float('nan'); samples.append(sample)
        for sample in samples:
            with self.assertRaises(ValueError):
                normalize(sample)

    def test_archived_live_response_has_all_depths_and_preserves_nulls(self):
        sample = bundle()
        sample['data'] = json.loads((Path(__file__).parent / 'fixtures/icon-global-20261006T00.json').read_text())
        points = normalize(sample)
        self.assertEqual(sum(len(p['rows']) for p in points), 8064)
        self.assertEqual(sum(r[5]=='missing' for p in points for r in p['rows']), 8)
        self.assertEqual(points[0]['latitude'], points[1]['latitude'])

    def test_config_rejects_fast_polling(self):
        with patch.dict('os.environ', {'SOIL_POLL_SECONDS': '60'}), self.assertRaises(ValueError):
            Settings.from_env()


class SoilStorageTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        sys.path.append(str(Path(__file__).resolve().parents[2] / 'api/v1'))
        from measurement_migration import install
        await install(self.conn)

    async def archive(self, sample, attempt=1):
        data=sample["data"]
        import hashlib
        body = json.dumps(data).encode()
        sample["_body"]=body
        sha = hashlib.sha256(body).hexdigest()
        await self.conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING", (sha, len(body)))
        await self.conn.execute("""INSERT INTO collection_attempts(id,source_id,received_at,http_status,payload_sha256,status)
            VALUES (%s,'environment-soil-icon',%s,200,%s,'received')""", (attempt,datetime(2026,10,6,12,tzinfo=UTC),sha))

    async def test_atomic_archived_replay_and_distinct_runs(self):
        sample = bundle()
        await self.archive(sample)
        points = normalize(sample)
        count = await persist(self.conn, sample, points)
        await persist(self.conn, sample, points)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), count)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM reading_revisions'), 0)
        self.assertEqual(await self.scalar("SELECT status FROM collection_attempts WHERE id=1"), 'success')
        retry = deepcopy(sample); retry['attempt_id']=3
        await self.archive(retry, 3)
        self.assertEqual(await persist(self.conn, retry, normalize(retry)), 0)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM reading_revisions'), 0)
        second = deepcopy(sample)
        second['run']='2026-10-05T18:00:00+00:00'
        second['attempt_id']=2
        await self.archive(second, 2)
        await persist(self.conn, second, normalize(second))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), count*2)
        tampered = deepcopy(sample); tampered['data'][0]['hourly']['soil_temperature_0cm'][1]=42
        with self.assertRaises(ValueError):
            await persist(self.conn, tampered, normalize(tampered))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), count*2)

    async def test_cadence_and_failed_receipt_do_not_write(self):
        from soil import acquire
        sample = bundle()
        await self.archive(sample)
        await self.conn.execute("UPDATE collection_attempts SET status='success' WHERE id=1")
        from unittest.mock import AsyncMock
        client = AsyncMock()
        result = await acquire(client, Settings(db={}), self.conn, datetime(2026,10,6,12,10,tzinfo=UTC))
        self.assertIsNone(result)
        client.get.assert_not_called()
        await self.conn.execute("UPDATE collection_attempts SET status='failed' WHERE id=1")
        with self.assertRaises(ValueError):
            await persist(self.conn, sample, normalize(sample))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), 0)


class SoilHealthTests(unittest.TestCase):
    def test_failed_optional_source_preserves_success_and_eventually_expires(self):
        import tempfile

        from health import check_health, record_status
        now = datetime.now(UTC)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'status.json'
            previous = {'soil': {'status': 'success', 'last_success': now.isoformat()}}
            state = record_status(path, previous, details={'complete': False, 'soil': {'status': 'failed'}})
            self.assertEqual(state['status'], 'degraded')
            self.assertEqual(check_health(path, 300), 0)
            state['soil']['last_success'] = (now - timedelta(hours=4)).isoformat()
            record_status(path, state, details={'complete': False, 'soil': {'status': 'failed'}})
            self.assertEqual(check_health(path, 300), 1)


class SoilPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_soil_failure_retains_base_writes_and_reports_partial_status(self):
        from unittest.mock import AsyncMock

        from main import poll_cycle
        conn = AsyncMock()
        conn.__aenter__.return_value = conn
        raw = {'pegel': {'currentMeasurement': {'timestamp': '2026-10-06T00:00:00Z', 'value': 250}},
               'weather': {'current': {'time': '2026-10-06T00:00', 'temperature_2m': 15}}}
        writer = AsyncMock(return_value={'weather': 1})
        with patch('main.psycopg.AsyncConnection.connect', AsyncMock(return_value=conn)), \
             patch('main.persist_environment_data', writer), \
             patch('main.soil.acquire', AsyncMock(side_effect=ValueError('unavailable'))):
            # raw input avoids remote base sources; override the optional payload to
            # exercise normalization failure after base persistence.
            raw['soil'] = {'data': []}
            result = await poll_cycle(None, Settings(db={}, enable_soil=True), raw=raw)
        writer.assert_awaited_once()
        self.assertFalse(result['complete'])
        self.assertEqual(result['soil']['status'], 'failed')
