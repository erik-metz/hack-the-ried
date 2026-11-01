"""Exercise the SDK HTTP transport, schemas, origin checks and bounded backend."""

import asyncio
import json

import httpx
import pytest
import server
from starlette.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    calls = []

    async def respond(request):
        calls.append(request)
        return httpx.Response(200,json={'items':[{'id':'core:municipality'}], 'next_offset':None})

    async def open_backend():
        server.backend.client = httpx.AsyncClient(base_url='http://backend-api/api/v1/internal/mcp/',
            headers={'Authorization':'Bearer internal-only'},transport=httpx.MockTransport(respond))

    monkeypatch.setattr(server.backend,'open',open_backend)
    monkeypatch.setenv('MCP_ALLOWED_HOSTS','testserver,127.0.0.1:*,localhost:*')
    with TestClient(server.create_app()) as client:
        yield client,calls


def rpc(client, method, params=None, id=1):
    return client.post('/mcp',headers={'Accept':'application/json, text/event-stream',
        'MCP-Protocol-Version':'2025-11-25'},
        json={'jsonrpc':'2.0','id':id,'method':method,'params':params or {}})


def test_http_legacy_client_discovery_and_public_tool_call(client):
    client,calls = client
    response = rpc(client,'initialize',{'protocolVersion':'2025-11-25',
        'capabilities':{},'clientInfo':{'name':'ried-test','version':'1'}})
    assert response.status_code == 200,response.text
    tools = rpc(client,'tools/list').json()['result']['tools']
    names = {t['name'] for t in tools}
    assert {'search_entities','search_events','query_regional_data','get_reliability_report'} <= names
    assert all(t['annotations']['readOnlyHint'] for t in tools)
    response = rpc(client,'tools/call',{'name':'list_datasets','arguments':{'limit':1}})
    assert response.status_code == 200,response.text
    result = response.json()['result']
    assert not result.get('isError'),result
    assert result['structuredContent']['items'][0]['id'] == 'core:municipality'
    assert calls[-1].url.path.endswith('/catalog')
    assert calls[-1].headers['Authorization'] == 'Bearer internal-only'
    assert 'internal-only' not in response.text


def test_host_origin_and_input_bounds(client):
    client,_ = client
    payload = {'jsonrpc':'2.0','id':1,'method':'tools/list'}
    for headers in ({'Host':'attacker.invalid'},{'Origin':'https://attacker.invalid'}):
        response = client.post('/mcp',headers=headers,json=payload)
        assert response.status_code in {400,403,421},response.text
    response = rpc(client,'tools/call',{'name':'list_datasets','arguments':{'limit':1000000}})
    assert response.json()['result']['isError'] is True
    response = client.post('/mcp',content=b'x'*(256*1024+1),headers={'Content-Type':'application/json'})
    assert response.status_code == 413,response.text


def test_ip_rate_limit_and_health_do_not_require_auth(client):
    client,_ = client
    assert client.get('/health').status_code == 200
    assert client.get('/ready').status_code == 200
    codes = [rpc(client, 'tools/list').status_code for _ in range(61)]
    assert codes[-1] == 429


def test_backend_refuses_redirects_errors_and_oversized_results():
    async def run():
        backend = server.Backend()
        for response in (httpx.Response(302,headers={'Location':'http://untrusted.invalid'}),
                         httpx.Response(503,text='password=must-not-leak'),
                         httpx.Response(200,content=b'x'*(512*1024+1))):
            async with httpx.AsyncClient(base_url='http://backend-api/',
                transport=httpx.MockTransport(lambda request, response=response: response)) as c:
                backend.client = c
                with pytest.raises(ValueError) as error:
                    await backend.get('catalog')
                assert 'must-not-leak' not in str(error.value)
        return True

    assert asyncio.run(run())


def test_compose_and_nginx_enforce_service_boundary():
    from pathlib import Path

    import yaml

    root = Path(__file__).resolve().parents[2]
    compose = yaml.safe_load((root/'docker-compose.mcp.yml').read_text())
    mcp = compose['services']['mcp-server']
    assert 'ports' not in mcp
    assert set(mcp['networks']) == {'mcp-frontend','mcp-backend'}
    assert mcp['read_only'] is True
    assert 'default' not in mcp['networks']
    assert all(n['internal'] for n in compose['networks'].values())
    nginx = (root/'nginx.conf').read_text()
    assert 'location ^~ /api/v1/internal/mcp/ { return 404; }' in nginx
    assert 'location = /api/v1/internal/mcp { return 404; }' in nginx
    assert 'proxy_set_header X-Forwarded-For $remote_addr;' in nginx
    assert 'client_max_body_size 256k;' in nginx
    assert not any(key in json.dumps(mcp.get('environment',{})) for key in ('ADMIN_API_KEY','DB_PASSWORD'))
