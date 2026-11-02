"""Pollen snapshots: seasonal gaps, receipt identity and source isolation."""

import hashlib
import json
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from config import Settings
from pollen import POINTS, SOURCE, SPECIES, acquire, normalize, persist
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tests'))
from db_support import DatabaseCase


def bundle():
    data = []
    for p in POINTS:
        hourly = {'time': ['2026-10-06T00:00', '2026-10-06T01:00']}
        units = {'time': 'iso8601'}
        for species in SPECIES:
            hourly[species+'_pollen'] = [0, None]
            units[species+'_pollen'] = 'grains/m³'
        data.append({'latitude': p[2], 'longitude': p[3], 'utc_offset_seconds': 0,
                     'hourly': hourly, 'hourly_units': units})
    return {'data': data, 'snapshot_at': '2026-10-06T12:00:00+00:00', 'attempt_id': 1}


class PollenParsingTests(unittest.TestCase):
    def test_seasonal_gaps_are_not_zero(self):
        points = normalize(bundle())
        self.assertEqual(points[0]['rows'][0][2:], (0, 'valid'))
        self.assertEqual(points[0]['rows'][1][2:], (None, 'missing'))

    def test_live_fixture_keeps_all_six_species_and_missing_horizon(self):
        sample = bundle()
        sample['data'] = json.loads((Path(__file__).parent/'fixtures/cams-pollen-20261006.json').read_text())
        points = normalize(sample)
        self.assertEqual(sum(len(p['rows']) for p in points), 2880)
        self.assertEqual(sum(r[3]=='missing' for p in points for r in p['rows']), 552)

    def test_malformed_units_values_and_time_axes_are_rejected(self):
        mutations = []
        sample = bundle(); sample['data'].pop(); mutations.append(sample)
        sample = bundle(); sample['data'][0]['hourly_units']['grass_pollen']='ug/m3'; mutations.append(sample)
        sample = bundle(); sample['data'][0]['hourly']['grass_pollen'][0]=-1; mutations.append(sample)
        sample = bundle(); sample['data'][0]['hourly']['grass_pollen'][0]=True; mutations.append(sample)
        sample = bundle(); sample['data'][0]['hourly']['time'][1]='2026-10-06T00:00'; mutations.append(sample)
        sample = bundle(); sample['data'][0]['hourly']['grass_pollen'].pop(); mutations.append(sample)
        sample = bundle(); sample['snapshot_at']='2026-10-06T00:00'; mutations.append(sample)
        for sample in mutations:
            with self.assertRaises(ValueError):
                normalize(sample)

    def test_pollen_interval_and_health_are_independent(self):
        from health import check_health, record_status
        with patch.dict('os.environ', {'POLLEN_POLL_SECONDS': '60'}), self.assertRaises(ValueError):
            Settings.from_env()
        now = datetime.now(UTC)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'status.json'
            previous = {'pollen': {'last_success': now.isoformat()}}
            status = record_status(path, previous, details={'complete': False, 'pollen': {'status': 'failed'}})
            self.assertEqual(status['status'], 'degraded')
            self.assertEqual(check_health(path, 300), 0)
            status['pollen']['last_success'] = (now-timedelta(hours=10)).isoformat()
            record_status(path, status, details={'complete': False, 'pollen': {'status': 'failed'}})
            self.assertEqual(check_health(path, 300), 1)


class PollenStorageTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        sys.path.append(str(Path(__file__).resolve().parents[2]/'api/v1'))
        from measurement_migration import install
        await install(self.conn)

    async def archive(self, sample, attempt=1):
        body = json.dumps(sample['data']).encode()
        sha = hashlib.sha256(body).hexdigest()
        sample.update(sha256=sha, attempt_id=attempt, _body=body)
        await self.conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING", (sha,len(body)))
        await self.conn.execute("""INSERT INTO collection_attempts(id,source_id,received_at,http_status,payload_sha256,status)
            VALUES (%s,%s,%s,200,%s,'received')""", (attempt,SOURCE,datetime.fromisoformat(sample['snapshot_at']),sha))

    async def test_replay_and_new_snapshots_remain_distinct(self):
        sample = bundle(); await self.archive(sample)
        count = await persist(self.conn, sample, normalize(sample))
        await persist(self.conn, sample, normalize(sample))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), count)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM reading_revisions'), 0)
        retry = deepcopy(sample); await self.archive(retry, 2)
        self.assertEqual(await persist(self.conn, retry, normalize(retry)), 0)
        newer = deepcopy(sample); newer['data'][0]['hourly']['grass_pollen'][0]=5
        newer['snapshot_at']='2026-10-06T15:00:00+00:00'; await self.archive(newer, 3)
        await persist(self.conn, newer, normalize(newer))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), count*2)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings WHERE provenance->>'provider_issue_time' IS NOT NULL"), 0)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM measurement_definitions WHERE basis<>'model'"), 0)

    async def test_archive_tampering_rolls_back_and_cadence_skips_network(self):
        sample = bundle(); await self.archive(sample)
        tampered = deepcopy(sample); tampered['data'][0]['hourly']['grass_pollen'][0]=12
        with self.assertRaises(ValueError):
            await persist(self.conn, tampered, normalize(tampered))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), 0)
        await persist(self.conn, sample, normalize(sample))
        client = AsyncMock()
        self.assertIsNone(await acquire(client, Settings(db={}), self.conn, datetime(2026,10,6,13,tzinfo=UTC)))
        client.get.assert_not_called()
        await self.conn.execute("UPDATE collection_attempts SET status='failed' WHERE id=1")
        with self.assertRaises(ValueError):
            await acquire(client, Settings(db={}), self.conn, datetime(2026,10,6,13,tzinfo=UTC))
        client.get.assert_not_called()

    async def test_api_returns_latest_complete_snapshot_and_hides_entities(self):
        from endpoints.environment_measurements import pollen_forecasts
        sample = bundle()
        now = datetime.now(UTC)
        sample['snapshot_at']=now.isoformat()
        for p in sample['data']:
            p['hourly']['time']=[now.replace(hour=h,minute=0,second=0,microsecond=0).strftime('%Y-%m-%dT%H:%M') for h in (0,1)]
        await self.archive(sample); await persist(self.conn, sample, normalize(sample))
        newer = deepcopy(sample); newer['snapshot_at']=(now+timedelta(seconds=1)).isoformat()
        for p in newer['data']:
            p['hourly']['grass_pollen'][0]=7
        await self.archive(newer,2); await persist(self.conn, newer, normalize(newer))
        conn = self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                previous = conn.row_factory; conn.row_factory=dict_row
                try:
                    yield conn
                finally:
                    conn.row_factory=previous

        result = await pollen_forecasts(pool=Pool())
        self.assertEqual(len(result['items']), 48)
        self.assertIsNone(result['provider_issue_time'])
        grass = [r for r in result['items'] if r['dimensions']['species']=='grass' and r['quality']=='valid']
        self.assertEqual({r['value'] for r in grass}, {7})
        await self.conn.execute("UPDATE entities SET is_hidden=TRUE WHERE id='environment:pollen:buerstadt'")
        result = await pollen_forecasts(pool=Pool())
        self.assertEqual(len(result['items']), 36)


class PollenPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_failure_does_not_undo_weather(self):
        from main import poll_cycle
        conn = AsyncMock(); conn.__aenter__.return_value=conn
        raw = {'pegel': {'currentMeasurement': {'timestamp': '2026-10-06T00:00:00Z', 'value': 250}},
               'weather': {'current': {'time': '2026-10-06T00:00', 'temperature_2m': 15}}, 'pollen': {'data': []}}
        writer = AsyncMock(return_value={'weather': 1})
        with patch('main.psycopg.AsyncConnection.connect',AsyncMock(return_value=conn)), patch('main.persist_environment_data',writer):
            result = await poll_cycle(None,Settings(db={},enable_pollen=True),raw=raw)
        writer.assert_awaited_once()
        self.assertFalse(result['complete'])
        self.assertEqual(result['pollen']['status'],'failed')
