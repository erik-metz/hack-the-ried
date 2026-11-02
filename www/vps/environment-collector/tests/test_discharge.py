"""Discharge snapshot identity, daily rate semantics and ensemble uncertainty."""

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

import httpx
from config import Settings
from discharge import ENTITY, SOURCE, VARIABLES, acquire, normalize, persist
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tests'))
from db_support import DatabaseCase


def bundle():
    data = json.loads((Path(__file__).parent/'fixtures/glofas-worms-20261006.json').read_text())
    return {'data': data, 'attempt_id': 1, 'snapshot_at': '2026-10-06T12:00:00+00:00'}


class DischargeParsingTests(unittest.TestCase):
    def test_live_fixture_preserves_all_statistics_and_grid(self):
        point = normalize(bundle())
        self.assertEqual(len(point['rows']),98)
        self.assertEqual(point['latitude'],49.625)
        self.assertEqual({r[0] for r in point['rows']},set(VARIABLES))

    def test_missing_is_distinct_from_zero(self):
        sample = bundle()
        for variable in VARIABLES.values(): sample['data']['daily'][variable][0]=0
        sample['data']['daily']['river_discharge_median'][1]=None
        rows = normalize(sample)['rows']
        self.assertEqual(rows[0][2:], (0,'valid'))
        self.assertEqual(next(r[2:] for r in rows if r[0]=='median' and r[1].day==7), (None,'missing'))

    def test_invalid_units_statistics_dates_values_and_grid_are_rejected(self):
        changes = []
        sample=bundle(); sample['data']['daily_units']['river_discharge']='m'; changes.append(sample)
        sample=bundle(); sample['data']['daily']['river_discharge'][0]=-1; changes.append(sample)
        sample=bundle(); sample['data']['daily']['river_discharge'][0]=True; changes.append(sample)
        sample=bundle(); sample['data']['daily']['river_discharge'][0]=float('inf'); changes.append(sample)
        sample=bundle(); sample['data']['daily']['river_discharge_p25'][0]=999999; changes.append(sample)
        sample=bundle(); sample['data']['daily']['river_discharge_mean'][0]=999999; changes.append(sample)
        sample=bundle(); sample['data']['daily']['time'][1]=sample['data']['daily']['time'][0]; changes.append(sample)
        sample=bundle(); sample['data']['daily']['time'][0]+='T00:00'; changes.append(sample)
        sample=bundle(); sample['data']['daily']['river_discharge'].pop(); changes.append(sample)
        sample=bundle(); sample['data']['latitude']=49.8; changes.append(sample)
        sample=bundle(); sample['data']['utc_offset_seconds']=3600; changes.append(sample)
        sample=bundle(); sample['snapshot_at']='2026-10-06T12:00'; changes.append(sample)
        for sample in changes:
            with self.assertRaises(ValueError): normalize(sample)

    def test_daily_interval_and_health_are_independent(self):
        from health import check_health, record_status
        with patch.dict('os.environ', {'DISCHARGE_POLL_SECONDS':'300'}), self.assertRaises(ValueError): Settings.from_env()
        now=datetime.now(UTC)
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'status.json'
            previous={'discharge':{'last_success':(now-timedelta(hours=25)).isoformat()}}
            record_status(path,previous,details={'complete':False,'discharge':{'status':'failed'}})
            self.assertEqual(check_health(path,300),0)
            previous['discharge']['last_success']=(now-timedelta(hours=73)).isoformat()
            record_status(path,previous,details={'complete':False,'discharge':{'status':'failed'}})
            self.assertEqual(check_health(path,300),1)


class DischargeStorageTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        sys.path.append(str(Path(__file__).resolve().parents[2]/'api/v1'))
        from measurement_migration import install
        await install(self.conn)

    async def archive(self,sample,attempt=1):
        body=json.dumps(sample['data']).encode();sha=hashlib.sha256(body).hexdigest()
        sample.update(sha256=sha,attempt_id=attempt,_body=body)
        await self.conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING",(sha,len(body)))
        await self.conn.execute("INSERT INTO collection_attempts(id,source_id,received_at,http_status,payload_sha256,status) VALUES (%s,%s,%s,200,%s,'received')",(attempt,SOURCE,datetime.fromisoformat(sample['snapshot_at']),sha))

    async def test_replay_new_snapshots_and_daily_rate_semantics(self):
        sample=bundle();await self.archive(sample)
        self.assertEqual(await persist(self.conn,sample,normalize(sample)),98)
        self.assertEqual(await persist(self.conn,sample,normalize(sample)),0)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM reading_revisions'),0)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM measurement_definitions WHERE basis='model' AND semantics='rate'"),7)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings WHERE period_end-period_start=INTERVAL '1 day'"),98)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings WHERE provenance->>'provider_issue_time' IS NOT NULL"),0)
        newer=deepcopy(sample)
        for variable in VARIABLES.values(): newer['data']['daily'][variable][0]+=1
        await self.archive(newer,2);await persist(self.conn,newer,normalize(newer))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'),196)
        self.assertEqual(await self.scalar("SELECT metadata->>'river_assignment' FROM entities WHERE id=%s",(ENTITY,)),'unverified')

    async def test_api_one_snapshot_and_visibility(self):
        from endpoints.environment_measurements import discharge_forecasts
        sample=bundle();now=datetime.now(UTC);sample['snapshot_at']=now.isoformat()
        sample['data']['daily']['time']=[(now+timedelta(days=i)).date().isoformat() for i in range(14)]
        await self.archive(sample);await persist(self.conn,sample,normalize(sample))
        newer=deepcopy(sample);newer['snapshot_at']=(now+timedelta(seconds=1)).isoformat()
        for variable in VARIABLES.values(): newer['data']['daily'][variable][0]+=1
        await self.archive(newer,2);await persist(self.conn,newer,normalize(newer))
        conn=self.conn
        class Pool:
            @asynccontextmanager
            async def connection(self):
                previous=conn.row_factory;conn.row_factory=dict_row
                try: yield conn
                finally: conn.row_factory=previous
        result=await discharge_forecasts(pool=Pool())
        self.assertEqual(len(result['items']),98)
        self.assertEqual({r['dimensions']['snapshot_sha256'] for r in result['items']},{newer['sha256']})
        self.assertIsNone(result['provider_issue_time'])
        self.assertFalse(result['truncated'])
        await self.conn.execute('UPDATE entities SET is_hidden=TRUE WHERE id=%s',(ENTITY,))
        self.assertEqual((await discharge_forecasts(pool=Pool()))['items'],[])

    async def test_tampering_is_rejected_and_acquisition_is_archived(self):
        client=AsyncMock()
        data=bundle()['data']
        # Acquisition records the real receipt time; keep the mocked forecast current.
        today=datetime.now(UTC).date()
        data['daily']['time']=[(today+timedelta(days=i)).isoformat() for i in range(14)]
        client.get.return_value=httpx.Response(200,content=json.dumps(data).encode(),request=httpx.Request('GET','https://flood-api.open-meteo.com'))
        sample=await acquire(client,Settings(db={}),self.conn)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM collected_payloads'),1)
        tampered=deepcopy(sample);tampered['data']['daily']['river_discharge'][0]+=1
        with self.assertRaises(ValueError): await persist(self.conn,tampered,normalize(tampered))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'),0)
        await persist(self.conn,sample,normalize(sample))
        client.get.reset_mock()
        self.assertIsNone(await acquire(client,Settings(db={}),self.conn))
        client.get.assert_not_called()
        await self.conn.execute("UPDATE collection_attempts SET status='failed'")
        with self.assertRaises(ValueError): await acquire(client,Settings(db={}),self.conn)
        client.get.assert_not_called()


class DischargePipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_failure_keeps_other_environment_writes(self):
        from main import poll_cycle
        conn=AsyncMock();conn.__aenter__.return_value=conn
        raw={'pegel':{'currentMeasurement':{'timestamp':'2026-10-06T00:00:00Z','value':250}},
             'weather':{'current':{'time':'2026-10-06T00:00','temperature_2m':15}},'discharge':{'data':{}}}
        writer=AsyncMock(return_value={'weather':1})
        with patch('main.psycopg.AsyncConnection.connect',AsyncMock(return_value=conn)),patch('main.persist_environment_data',writer):
            result=await poll_cycle(None,Settings(db={},enable_discharge=True),raw=raw)
        writer.assert_awaited_once();self.assertFalse(result['complete'])
        self.assertEqual(result['discharge']['status'],'failed')
