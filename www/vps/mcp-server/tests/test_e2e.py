"""SDK client -> real HTTP MCP -> real HTTP API -> disposable PostgreSQL schema."""

import asyncio
import os
import socket
import sys
import tempfile
import threading
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from unittest.mock import patch

import httpx
import psycopg
import server
import uvicorn
from fastapi import FastAPI
from mcp import Client
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'api/v1'))
sys.path.insert(0,str(ROOT/'tests'))
from db_support import DatabaseCase
from dependencies import get_db_pool
from endpoints.mcp import router
from measurement_migration import install


@contextmanager
def running(app):
    sock = socket.socket()
    sock.bind(('127.0.0.1',0))
    port = sock.getsockname()[1]
    config = uvicorn.Config(app,log_level='error',lifespan='on')
    instance = uvicorn.Server(config)
    thread = threading.Thread(target=instance.run,kwargs={'sockets':[sock]},daemon=True)
    thread.start()
    try:
        deadline = time.monotonic()+10
        while not instance.started:
            if not thread.is_alive() or time.monotonic()>deadline:
                raise RuntimeError('Test HTTP server did not start')
            time.sleep(0.01)
        yield f'http://127.0.0.1:{port}'
    finally:
        instance.should_exit = True
        thread.join(timeout=5)
        sock.close()


class RealHTTPTests(DatabaseCase):
    async def test_official_sdk_and_legacy_protocol_use_real_database(self):
        import hashlib

        await install(self.conn)
        await self.conn.execute((ROOT/'api/v1/migrations/20261101_mcp.sql').read_text())
        await self.conn.execute("INSERT INTO entities(id,name,entity_type) VALUES ('community','Biblis','municipality')")
        await self.conn.execute("SELECT write_measurement('community','population','people','official','reported','{}',NOW(),12345,NOW())")
        db = self.db

        class Pool:
            @asynccontextmanager
            async def connection(self):
                async with await psycopg.AsyncConnection.connect(**db,row_factory=dict_row) as conn:
                    yield conn

        api = FastAPI()
        api.include_router(router,prefix='/api/v1')
        api.dependency_overrides[get_db_pool] = Pool
        with tempfile.TemporaryDirectory() as tmp:
            key_path,digest_path = Path(tmp)/'key',Path(tmp)/'digest'
            key = 'mcp-e2e-'+'b'*64
            key_path.write_text(key)
            digest_path.write_text(hashlib.sha256(key.encode()).hexdigest())
            with patch.dict(os.environ,MCP_API_ENABLED='true',MCP_SERVICE_DIGESTS_FILE=str(digest_path),  # noqa: SIM117
                MCP_SERVICE_KEY_FILE=str(key_path),MCP_TESTING='true',MCP_ALLOWED_HOSTS='127.0.0.1:*'):
                with running(api) as api_url, patch.dict(os.environ,
                    MCP_API_URL=api_url+'/api/v1/internal/mcp/'):
                    with running(server.create_app()) as mcp_url:
                        async with Client(mcp_url+'/mcp') as client:
                            tools = await client.list_tools()
                            self.assertIn('get_reliability_report',{t.name for t in tools.tools})
                            result = await client.call_tool('search_entities',{'search':'Biblis'})
                            self.assertFalse(result.is_error)
                            self.assertEqual(result.structured_content['items'][0]['id'],'community')
                            definitions = await client.call_tool('list_measurements',{'entity_id':'community'})
                            measurement_id = definitions.structured_content['items'][0]['id']
                            values = await client.call_tool('get_latest_readings',{'measurement_id':int(measurement_id)})
                            self.assertEqual(values.structured_content['items'][0]['value'],'12345')
                            report = await client.call_tool('get_reliability_report',{'limit':1})
                            self.assertFalse(report.is_error)
                        async with httpx.AsyncClient() as legacy:
                            response = await legacy.post(mcp_url+'/mcp',headers={
                                'Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},
                                json={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{
                                    'name':'search_entities','arguments':{'search':'Biblis'}}})
                            self.assertEqual(response.status_code,200,response.text)
                            self.assertEqual(response.json()['result']['structuredContent']['items'][0]['id'],'community')
                        await asyncio.sleep(0)
