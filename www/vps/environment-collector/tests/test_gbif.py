"""GBIF receipt verification, bounded pagination and honest occurrence semantics."""

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
from urllib.parse import urlencode

import httpx
from config import Settings
from gbif import PAGE_SIZE, SOURCE, acquire, normalize, persist, query
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tests'))
from db_support import DatabaseCase

NOW = datetime(2026, 10, 6, 12, tzinfo=UTC)


def bundle(records=None):
    records = records if records is not None else [
        {'key': 1, 'datasetKey': 'dataset-a', 'countryCode': 'DE', 'occurrenceStatus': 'PRESENT',
         'decimalLatitude': 49.64, 'decimalLongitude': 8.45, 'year': 2026, 'month': 9, 'day': 1,
         'eventDate': '2026-09-01', 'scientificName': 'Turdus merula', 'speciesKey': 123,
         'license': 'http://creativecommons.org/licenses/by/4.0/legalcode', 'basisOfRecord': 'HUMAN_OBSERVATION'}]
    data = {'offset': 0, 'limit': PAGE_SIZE, 'count': len(records), 'endOfRecords': True, 'results': records}
    body = json.dumps(data).encode()
    return {'query': query(NOW), 'pages': [{'data': data, 'attempt_id': 1, 'received_at': NOW.isoformat(),
        'sha256': hashlib.sha256(body).hexdigest(), 'url': 'https://api.gbif.org/v1/occurrence/search?' + urlencode({**query(NOW), 'limit': PAGE_SIZE, 'offset': 0})}]}


class GbifParsingTests(unittest.TestCase):
    def test_live_record_fields_and_unknown_uncertainty(self):
        fixture = json.loads((Path(__file__).parent/'fixtures/gbif-ried-20261006.json').read_text())
        parsed = normalize(bundle(fixture['results']))
        self.assertEqual(len(parsed['rows']), 3)
        self.assertEqual(parsed['rows'][1]['evidence']['spatial_reference']['coordinate_uncertainty_m'], 25)
        evidence = normalize(bundle())['rows'][0]['evidence']
        self.assertIsNone(evidence['spatial_reference']['coordinate_uncertainty_m'])
        self.assertNotIn('recordedBy', evidence)
        self.assertNotIn('media', evidence)
        self.assertEqual(evidence['date_precision'], 'day')

    def test_insufficient_dates_locations_licenses_are_skipped_not_zero(self):
        for change in ({'day': None}, {'month': 14}, {'year': 2027}, {'decimalLatitude': 60},
                       {'decimalLongitude': True}, {'occurrenceStatus': 'ABSENT'}, {'license': 'unknown'},
                       {'eventDate': '2026-09-01/2026-09-03'}):
            sample = bundle(); sample['pages'][0]['data']['results'][0].update(change)
            result = normalize(sample)
            self.assertEqual(result['rows'], [])
            self.assertEqual(result['skipped'], 1)
        sample = bundle(); sample['pages'][0]['data']['results'][0]['coordinateUncertaintyInMeters'] = -1
        self.assertIsNone(normalize(sample)['rows'][0]['evidence']['spatial_reference']['coordinate_uncertainty_m'])

    def test_duplicate_and_incomplete_pages_fail(self):
        sample = bundle(); sample['pages'][0]['data']['results'] *= 2
        sample['pages'][0]['data']['count'] = 2
        with self.assertRaises(ValueError): normalize(sample)
        sample = bundle(); sample['pages'][0]['data']['endOfRecords'] = False
        with self.assertRaises(ValueError): normalize(sample)
        sample = bundle(); sample['pages'][0]['data']['count'] = 10
        with self.assertRaises(ValueError): normalize(sample)

    def test_cap_retains_explicit_partial_coverage(self):
        sample = bundle(); first = sample['pages'][0]; sample['pages'] = []
        for index in range(10):
            page = deepcopy(first)
            page['data'].update(offset=index*300, count=90000, endOfRecords=False,
                results=[{**first['data']['results'][0], 'key': index*300+i+1} for i in range(300)])
            sample['pages'].append(page)
        result = normalize(sample)
        self.assertEqual(result['scanned'], 3000)
        self.assertTrue(result['source_truncated'])
        self.assertEqual(result['matched'], 90000)

    def test_daily_cadence_and_independent_health(self):
        from health import check_health, record_status
        with patch.dict('os.environ', {'GBIF_POLL_SECONDS': '300'}), self.assertRaises(ValueError):
            Settings.from_env()
        now = datetime.now(UTC)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'status.json'
            previous = {'gbif': {'last_success': (now-timedelta(hours=25)).isoformat()}}
            record_status(path, previous, details={'complete': False, 'gbif': {'status': 'failed'}})
            self.assertEqual(check_health(path, 300), 0)
            previous['gbif']['last_success'] = (now-timedelta(hours=73)).isoformat()
            record_status(path, previous, details={'complete': False, 'gbif': {'status': 'failed'}})
            self.assertEqual(check_health(path, 300), 1)


class GbifStorageTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        sys.path.append(str(Path(__file__).resolve().parents[2]/'api/v1'))
        from measurement_migration import install
        await install(self.conn)

    async def archive(self, sample, attempt=1):
        page = sample['pages'][0]
        body = json.dumps(page['data']).encode(); sha = hashlib.sha256(body).hexdigest()
        page.update(sha256=sha, attempt_id=attempt, _body=body)
        await self.conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING", (sha,len(body)))
        await self.conn.execute("INSERT INTO collection_attempts(id,source_id,received_at,http_status,payload_sha256,status) VALUES (%s,%s,%s,200,%s,'received')", (attempt,SOURCE,datetime.fromisoformat(page['received_at']),sha))

    async def test_replay_distinct_snapshots_and_archive_tampering(self):
        sample = bundle(); await self.archive(sample)
        self.assertEqual(await persist(self.conn, sample, normalize(sample)), 1)
        self.assertEqual(await persist(self.conn, sample, normalize(sample)), 0)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM reading_revisions'), 0)
        tampered = deepcopy(sample); tampered['pages'][0]['data']['results'][0]['scientificName'] = 'changed'
        with self.assertRaises(ValueError): await persist(self.conn, tampered, normalize(tampered))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), 1)
        newer = bundle([{**sample['pages'][0]['data']['results'][0], 'key': 2}]); await self.archive(newer,2)
        await persist(self.conn, newer, normalize(newer))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'), 2)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM measurement_definitions WHERE basis='observed'"), 2)

    async def test_api_pages_latest_snapshot_and_hidden_records(self):
        from endpoints.environment_measurements import biodiversity_occurrences
        sample = bundle(); await self.archive(sample); await persist(self.conn,sample,normalize(sample))
        records = [{**sample['pages'][0]['data']['results'][0], 'key': n} for n in (2,3)]
        newer = bundle(records); await self.archive(newer,2); await persist(self.conn,newer,normalize(newer))
        conn = self.conn
        class Pool:
            @asynccontextmanager
            async def connection(self):
                previous = conn.row_factory; conn.row_factory=dict_row
                try: yield conn
                finally: conn.row_factory=previous
        result = await biodiversity_occurrences(limit=1,offset=0,pool=Pool())
        self.assertEqual(result['stored_records'],2); self.assertEqual(result['stored_species'],1)
        self.assertTrue(result['has_more'])
        next_page = await biodiversity_occurrences(limit=1,offset=1,pool=Pool())
        self.assertFalse(next_page['has_more'])
        self.assertNotEqual(result['items'][0]['entity_id'], next_page['items'][0]['entity_id'])
        await self.conn.execute("UPDATE entities SET is_hidden=TRUE WHERE id='environment:gbif:2'")
        result = await biodiversity_occurrences(limit=100,offset=0,pool=Pool())
        self.assertEqual(result['stored_records'],1)
        empty = bundle([]); await self.archive(empty,3); await persist(self.conn,empty,normalize(empty))
        result = await biodiversity_occurrences(limit=100,offset=0,pool=Pool())
        self.assertEqual(result['stored_records'],0); self.assertEqual(result['items'],[])

    async def test_acquisition_archives_before_parse_and_enforces_cadence(self):
        client = AsyncMock()
        body = json.dumps(bundle()['pages'][0]['data']).encode()
        client.get.return_value = httpx.Response(200,content=body,request=httpx.Request('GET','https://api.gbif.org'))
        sample = await acquire(client,Settings(db={}),self.conn,NOW)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM collected_payloads'),1)
        await persist(self.conn,sample,normalize(sample))
        client.get.reset_mock()
        self.assertIsNone(await acquire(client,Settings(db={}),self.conn,datetime.now(UTC)))
        client.get.assert_not_called()
        await self.conn.execute('DELETE FROM collection_attempts')
        client.get.return_value=httpx.Response(200,content=b'broken json',request=httpx.Request('GET','https://api.gbif.org'))
        with self.assertRaises(ValueError): await acquire(client,Settings(db={}),self.conn,NOW)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM collection_attempts WHERE status='failed'"),1)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM collected_payloads'),2)


class GbifPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_failure_keeps_other_environment_writes(self):
        from main import poll_cycle
        conn = AsyncMock(); conn.__aenter__.return_value=conn
        raw = {'pegel': {'currentMeasurement': {'timestamp': '2026-10-06T00:00:00Z', 'value': 250}},
               'weather': {'current': {'time': '2026-10-06T00:00', 'temperature_2m': 15}}, 'gbif': {'pages': []}}
        writer = AsyncMock(return_value={'weather':1})
        with patch('main.psycopg.AsyncConnection.connect',AsyncMock(return_value=conn)), patch('main.persist_environment_data',writer):
            result = await poll_cycle(None,Settings(db={},enable_gbif=True),raw=raw)
        writer.assert_awaited_once(); self.assertFalse(result['complete'])
        self.assertEqual(result['gbif']['status'],'failed')
