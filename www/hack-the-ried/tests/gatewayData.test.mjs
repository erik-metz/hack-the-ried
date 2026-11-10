import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{},Date,Number,Math,Map};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/gatewayData.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {gatewayChartRows,formatGatewayValue}=context.exports;
const point=(time,value,statistic='value')=>({time,value,quality:value===null?'missing':'valid',unit:'°C',dimensions:{statistic}});
test('hourly means use sample weights and extrema remain visible',()=>{
  const rows=gatewayChartRows([point('2026-11-03T00:00:00Z',200,'sum'),point('2026-11-03T00:00:00Z',5,'count'),point('2026-11-03T00:00:00Z',30,'min'),point('2026-11-03T00:00:00Z',50,'max')],'hour');
  assert.equal(rows[0].value,40);assert.deepEqual(Array.from(rows[0].range),[30,50]);
});
test('missing intervals interrupt charts and never become zero',()=>{
  const rows=gatewayChartRows([point('2026-11-03T00:00:00Z',40),point('2026-11-03T00:04:00Z',42)],'minute');
  assert.equal(rows.length,3);assert.equal(rows[1].value,null);
  assert.equal(gatewayChartRows([point('2026-11-03T00:00:00Z',null)],'minute')[0].value,null);
  assert.equal(formatGatewayValue(null,'boolean'),'Unbekannt');
});
test('radio distributions combine packet sums and counts rather than means',()=>{
  const rows=gatewayChartRows([point('2026-11-03T00:00:00Z',-300,'sum'),point('2026-11-03T00:00:00Z',3,'count')],'hour');
  assert.equal(rows[0].value,-100);
});

function loadModule(relativePath, mocks = {}, globals = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const context = { exports: {}, URL, Response, AbortSignal, ...globals, require(name) {
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return context.exports;
}
const qrGateways = loadModule('../lib/qrGateways.ts');

test('printed gateway numbers remain fixed and distinct from database IDs', () => {
  assert.equal(qrGateways.getQrGateway('1').deviceId, 'kamue-lora-pi');
  assert.equal(qrGateways.getGatewayQrId('kamue-lora-pi'), '1');
  for (const id of ['0', '01', '2', '../1', 'kamue-lora-pi']) assert.equal(qrGateways.getQrGateway(id), undefined);
  assert.equal(qrGateways.getGatewayQrId('other-gateway'), undefined);
});

function privateDetails() {
  return {
    device: { id: 'kamue-lora-pi', name: 'Private hostname', token_hash: 'secret', latest_boot: 'private-boot',
      latest_at: null, last_contact: null, sensor_config: { sht41: true, private_config: 'secret' } },
    fresh: false, resolution: 'minute',
    latest: [
      { metric: 'cpu_temperature', value: 42, unit: '°C', quality: 'valid', private: 'secret' },
      { metric: 'disk_free', value: 123, unit: 'bytes', quality: 'valid' },
    ],
    series: [{ ...point('2026-11-03T00:00:00Z', 42), private: 'secret', dimensions: { statistic: 'value', host: 'secret' } }],
    metrics: { cpu_temperature: { unit: '°C', operation: 'gauge', private: 'secret' }, disk_free: { unit: 'bytes' } },
    availability: { radio_ready: { known_seconds: 60, up_seconds: 60, window_seconds: 86400, private: 'secret' },
      undervoltage: { known_seconds: 60, up_seconds: 0, window_seconds: 86400 } },
    events: [{ details: { host: 'secret' } }], maintenance: { pending_hours: 123 }, future_private_field: 'secret',
  };
}

test('public gateway data excludes private operational fields and unapproved metrics', () => {
  const result = qrGateways.publicGatewayData(privateDetails(), '1');
  assert.equal(result.device.id, '1');
  assert.equal(result.device.name, 'Kamü-Gateway');
  assert.equal(result.latest.length, 1);
  assert.equal(result.latest[0].value, 42);
  assert.equal(result.fresh, false);
  assert.deepEqual(Object.keys(result.metrics), ['cpu_temperature']);
  assert.deepEqual(Object.keys(result.availability), ['radio_ready']);
  assert.equal('events' in result, false);
  assert.equal('maintenance' in result, false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.throws(() => qrGateways.publicGatewayData(privateDetails(), '2'));
});

test('public gateway route validates IDs and metrics before authenticated backend requests', async () => {
  let calls = 0;
  let backendStatus = 200;
  const { GET } = loadModule('../app/api/gateways/[id]/route.ts', {
    '@/env': { env: { BACKEND_API_URL: 'https://backend.example', BACKEND_ADMIN_API_KEY: 'server-only-key' } },
    '@/lib/qrGateways': qrGateways,
  }, { fetch: async (url, options) => {
    calls++;
    assert.equal(url.pathname, '/api/v1/admin/gateways/kamue-lora-pi');
    assert.equal(url.searchParams.get('metric'), 'cpu_temperature');
    assert.equal(options.headers.Authorization, 'Bearer server-only-key');
    return Response.json(privateDetails(), { status: backendStatus });
  } });
  const get = (id, query = '') => GET(new Request(`https://hack-the-ried.de/api/gateways/${id}${query}`), { params: Promise.resolve({ id }) });
  assert.equal((await get('2')).status, 404);
  assert.equal((await get('kamue-lora-pi')).status, 404);
  assert.equal((await get('1', '?metric=disk_free')).status, 400);
  assert.equal((await get('1', '?metric=state_known_seconds')).status, 400);
  assert.equal((await get('1', '?days=999')).status, 400);
  assert.equal(calls, 0);
  const response = await get('1');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.device.name, 'Kamü-Gateway');
  assert.equal(JSON.stringify(data).includes('server-only-key'), false);
  assert.equal(JSON.stringify(data).includes('secret'), false);
  backendStatus = 404;
  assert.equal((await get('1')).status, 503);
});
