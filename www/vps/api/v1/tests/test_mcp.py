"""Real SQL and HTTP boundaries for anonymous MCP's internal data service."""

import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import httpx
from dependencies import get_db_pool
from endpoints.mcp import router
from fastapi import FastAPI
from mcp_auth import validate_mcp_config
from mcp_common import public_url
from mcp_reliability import classify
from measurement_migration import install
from psycopg.rows import dict_row, tuple_row
from psycopg.types.json import Jsonb
from startup_schema import schema_mode, validate_existing_schema

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tests'))
from db_support import DatabaseCase


class PolicyTests(unittest.TestCase):
    def test_schema_startup_mode_is_explicit(self):
        with patch.dict(os.environ, API_SCHEMA_MODE='validate'):
            self.assertEqual(schema_mode(),'validate')
        with patch.dict(os.environ, API_SCHEMA_MODE='unsafe'), self.assertRaises(RuntimeError):
            schema_mode()
    def test_empty_results_do_not_fail_and_uninstrumented_success_is_unknown(self):
        now = datetime.now(UTC)
        source = {'enabled': True, 'interval_seconds': 300, 'received_at': now,
                  'status': 'success', 'item_count': 0}
        self.assertEqual(classify(source, now)[0], 'unknown')
        source.update(coverage_since=now-timedelta(days=7), expected_slots=100,
                      covered_slots=100, completed_runs=100)
        self.assertEqual(classify(source, now)[0], 'healthy')

    def test_failure_expiry_missing_activity_and_disabled_precedence(self):
        now = datetime.now(UTC)
        source = {'enabled': True, 'interval_seconds': 60, 'received_at': now-timedelta(hours=1)}
        self.assertEqual(classify(source, now)[0], 'overdue')
        source.update(status='failed')
        self.assertEqual(classify(source, now)[0], 'failing')
        source.update(enabled=False)
        self.assertEqual(classify(source, now)[0], 'disabled')
        source.update(enabled=True, status='success', received_at=now, expired_publications=1)
        self.assertEqual(classify(source, now)[0], 'degraded')

    def test_urls_drop_queries_credentials_and_invalid_schemes(self):
        self.assertEqual(public_url('https://example.org/data?token=private#fragment'), 'https://example.org/data')
        for value in ('https://user:secret@example.org', 'file:///etc/passwd', 'http://[invalid'):
            self.assertIsNone(public_url(value))


class MCPDatabaseTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await install(self.conn)
        self.migration = Path(__file__).resolve().parents[1] / 'migrations/20261101_mcp.sql'
        await self.conn.execute(self.migration.read_text())
        self.conn.row_factory = dict_row
        connection = self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                yield connection

        self.pool = Pool()
        self.secrets = tempfile.TemporaryDirectory()
        self.addCleanup(self.secrets.cleanup)
        self.key = 'mcp-test-' + 'a'*64
        digest_file = Path(self.secrets.name)/'digests'
        digest_file.write_text(hashlib.sha256(self.key.encode()).hexdigest())
        self.env = patch.dict(os.environ, MCP_API_ENABLED='true', MCP_SERVICE_DIGESTS_FILE=str(digest_file))
        self.env.start()
        self.addCleanup(self.env.stop)
        self.app = FastAPI()
        self.app.include_router(router, prefix='/api/v1')
        self.app.dependency_overrides[get_db_pool] = lambda: self.pool
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://api',
            headers={'Authorization': f'Bearer {self.key}'})
        self.addAsyncCleanup(self.client.aclose)

    async def get(self, path, **params):
        return await self.client.get('/api/v1/internal/mcp/'+path, params=params)

    async def reading(self, identity, *, hidden=False, metric='temperature', semantics='instantaneous'):
        await self.conn.execute('INSERT INTO entities(id,name,entity_type,is_hidden,metadata) VALUES (%s,%s,%s,%s,%s)',
            (identity,identity,'municipality',hidden,Jsonb({'municipality':'Biblis','password':'never-public'})))
        row = await (await self.conn.execute('''SELECT write_measurement(%s,%s,'°C','mcp-test','reported',
            '{}'::jsonb,'2030-01-15T12:00:00Z',12.1234567890123456789,'2030-01-15T12:01:00Z',
            '{}'::jsonb,'valid',NULL,NULL,%s) AS id''',(identity,metric,semantics))).fetchone()
        return row['id']

    async def test_existing_schema_startup_needs_no_ddl_locks(self):
        async with self.conn.transaction():
            await self.conn.execute('SET TRANSACTION READ ONLY')
            await validate_existing_schema(self.conn,mcp=True)

    async def test_http_auth_disabled_missing_wrong_separation_and_rotation(self):
        for key in ('', 'wrong', os.getenv('API_KEY','ingestion'), os.getenv('ADMIN_API_KEY','admin')):
            r = await self.client.get('/api/v1/internal/mcp/catalog', headers={'Authorization': f'Bearer {key}'})
            self.assertEqual(r.status_code,401)
        with patch.dict(os.environ,MCP_API_ENABLED='false'):
            self.assertEqual((await self.get('catalog')).status_code,404)
        old_digest = Path(os.environ['MCP_SERVICE_DIGESTS_FILE'])
        old_digest.write_text(old_digest.read_text()+'\n'+hashlib.sha256(b'next-key').hexdigest())
        r = await self.client.get('/api/v1/internal/mcp/catalog', headers={'Authorization':'Bearer next-key'})
        self.assertEqual(r.status_code,200)
        with patch.dict(os.environ,API_KEY=self.key), self.assertRaises(RuntimeError):
            validate_mcp_config()

    async def test_real_canonical_visibility_precision_metadata_and_pagination(self):
        measurement_id = await self.reading('public')
        await self.reading('hidden',hidden=True)
        await self.reading('sensor:legacy-hidden')
        response = await self.get('entities',limit=1)
        self.assertEqual(response.status_code,200,response.text)
        body = response.json()
        self.assertEqual([row['id'] for row in body['items']],['public'])
        self.assertNotIn('password',json.dumps(body))
        self.assertIsNone(body['next_offset'])
        self.assertEqual((await self.get('entities',entity_id='hidden')).status_code,404)
        data = (await self.get('readings',measurement_id=measurement_id,latest=True)).json()
        self.assertEqual(data['items'][0]['value'],'12.1234567890123456789')
        self.assertEqual(data['items'][0]['measurement_id'],str(measurement_id))
        self.assertEqual(data['definition']['basis'],'reported')

    async def test_ranges_aggregates_and_unknown_parameters_are_bounded(self):
        measurement_id = await self.reading('public',semantics='counter')
        response = await self.get('readings',measurement_id=measurement_id,start='2030-01-01T00:00:00Z',
            end='2030-02-20T00:00:00Z')
        self.assertEqual(response.status_code,422)
        response = await self.get('readings',measurement_id=measurement_id,start='2030-01-15T00:00:00Z',
            end='2030-01-16T00:00:00Z',aggregate='avg',interval_seconds=3600)
        self.assertEqual(response.status_code,422)
        self.assertEqual((await self.get('entities',limit=201)).status_code,422)
        self.assertEqual((await self.get('readings',measurement_id=measurement_id,latest=True,start='2030-01-01')).status_code,422)

    async def test_valid_aggregation_and_nested_publication_pagination(self):
        from fastapi import Response
        from mcp_data import publication_page

        measurement_id = await self.reading('public')
        response = await self.get('readings',measurement_id=measurement_id,start='2030-01-15T00:00:00Z',
            end='2030-01-16T00:00:00Z',aggregate='avg',interval_seconds=3600)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['items'][0]['sample_count'],1)
        data = {'tables':[{'records':[{'year':2025},{'year':2026}]}]}
        page = publication_page(Response(json.dumps(data)),section='tables/0/records',limit=1)
        self.assertEqual(page['next_offset'],1)
        self.assertEqual(page['items'],[{'year':2025}])

    async def test_publication_catalog_events_and_expiry_share_public_boundary(self):
        now = datetime.now(UTC)
        await self.conn.execute("INSERT INTO collected_payloads VALUES ('mcp-payload','x','application/json',NOW())")
        await self.conn.execute('''INSERT INTO collected_datasets VALUES ('social/events','events','https://example.org',
            %s,%s,%s,'mcp-payload',%s)''', (now,now,now+timedelta(days=1),Jsonb([
                {'title':'Public event','municipality':'Biblis','start_time':(now+timedelta(hours=2)).isoformat()},
                {'title':'Other event','municipality':'Worms','start_time':(now+timedelta(hours=3)).isoformat()}])))
        response = await self.get('datasets/data',dataset_id='social/events',municipality='Biblis')
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual([row['title'] for row in response.json()['items']],['Public event'])
        await self.conn.execute("UPDATE collected_datasets SET expires_at=NOW()-interval '1 second'")
        self.assertEqual((await self.get('datasets/data',dataset_id='social/events')).status_code,503)
        self.assertEqual((await self.get('datasets/info',dataset_id='social/source-diagnostics/secret')).status_code,404)

    async def test_evidence_history_policy_versions_and_no_raw_errors(self):
        now = datetime.now(UTC)
        await self.conn.execute("INSERT INTO collection_sources VALUES ('review','https://example.org?token=secret','test',true,3600,NULL,NOW())")
        await self.conn.execute("UPDATE collection_source_policies SET effective_at=%s WHERE source_id='review'",(now-timedelta(days=2),))
        await self.conn.execute("INSERT INTO collection_run_coverage VALUES ('review',%s)",(now-timedelta(days=2),))
        await self.conn.execute("INSERT INTO collection_runs(source_id,started_at,finished_at,status) VALUES ('review',%s,%s,'success')",
            (now-timedelta(hours=2),now-timedelta(hours=2)))
        await self.conn.execute("INSERT INTO collection_attempts(source_id,status,error,error_stage,item_count,item_count_unit) VALUES ('review','failed','password=secret /root/private','processing',0,'items')")
        response = await self.get('sources',source_id='review')
        self.assertEqual(response.status_code,200,response.text)
        body = response.json()
        source = body['items'][0]
        self.assertEqual(source['health'],'failing')
        self.assertEqual(source['completed_runs'],1)
        self.assertEqual(source['run_success_ratio'],1.0)
        self.assertGreater(source['expected_slots'],source['covered_slots'])
        self.assertNotIn('secret',response.text)
        self.assertNotIn('/root',response.text)
        history = await self.get('sources/history',source_id='review')
        self.assertNotIn('secret',history.text)
        self.assertEqual(history.json()['items'][0]['error_stage'],'processing')
        await self.conn.execute("UPDATE collection_sources SET interval_seconds=7200 WHERE id='review'")
        count = await (await self.conn.execute("SELECT count(*) AS count FROM collection_source_policies WHERE source_id='review'")).fetchone()
        self.assertEqual(count['count'],2)

        await self.conn.execute(self.migration.read_text())
        count = await (await self.conn.execute("SELECT count(*) AS count FROM collection_source_policies WHERE source_id='review'")).fetchone()
        self.assertEqual(count['count'],2)

    async def test_registry_run_contains_retries_and_crash_remains_visible(self):
        path = Path(__file__).resolve().parents[3]/'registry-sync-worker/run_evidence.py'
        spec = importlib.util.spec_from_file_location('registry_run_evidence',path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.conn.row_factory = tuple_row
        with patch.dict(os.environ,COLLECTION_RUN_EVIDENCE='true'):
            run_id = await module.begin_run(self.conn,'retry-source')
            for status in ('failed','failed','success'):
                await self.conn.execute('INSERT INTO collection_attempts(source_id,status) VALUES (%s,%s)',
                    ('retry-source',status))
            await module.finish_run(self.conn,run_id,'success')
            await module.begin_run(self.conn,'crashed-source')
        self.conn.row_factory = dict_row
        runs = await (await self.conn.execute('SELECT source_id,status,finished_at FROM collection_runs ORDER BY source_id')).fetchall()
        self.assertEqual(len(runs),2)
        self.assertEqual(runs[0]['status'],'running')
        self.assertIsNone(runs[0]['finished_at'])
        self.assertEqual(runs[1]['status'],'success')
        self.assertIsNotNone(runs[1]['finished_at'])
