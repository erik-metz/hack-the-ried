import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, globals) {
  const context = { exports: {}, URL, Response, AbortController, AbortSignal, Date, process: { env: { NEXT_PUBLIC_LIVE_API_ORIGIN: 'https://vps.example' } }, ...globals };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
function fixture(hidden = false) {
  const events = new Map(), timers = new Map(), streams = [], requests = [], received = [];
  let errors = 0, id = 0;
  const document = { hidden, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const api = load('../lib/liveData.ts', {
    document,
    EventSource: class {
      constructor(url) { this.url = url; streams.push(this); }
      close() { this.closed = true; }
    },
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); },
    fetch: async (url, options) => { requests.push({ url, options }); return Response.json({ positions: [] }); },
  });
  const stop = api.subscribeLiveData({ kind: 'movements', pollMs: 10000, staleMs: 25000, onData: data => received.push(data), onError: () => errors++ });
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return { api, stop, document, events, timers, streams, requests, received, settle, errors: () => errors,
    visibility(value) { document.hidden = value; events.get('visibilitychange')(); },
    async tick() { const [key, fn] = timers.entries().next().value; timers.delete(key); await fn(); await settle(); },
  };
}

test('live streams and fallback snapshots address the VPS without a Vercel proxy', async () => {
  const f = fixture(); await f.settle();
  assert.equal(f.streams[0].url, 'https://vps.example/api/v1/movements/stream');
  assert.equal(f.requests[0].url, 'https://vps.example/api/v1/movements/latest');
  assert.equal(f.api.liveDataUrl('satellites', 'stream'), 'https://vps.example/api/v1/satellites/stream');
  assert.equal(f.requests[0].options.cache, 'no-store');
  assert.equal(f.received.length, 1);
  f.stop();
});

test('hidden tabs release streams, abort requests and stop timers; resume reloads immediately', async () => {
  const f = fixture(); await f.settle();
  f.visibility(true);
  assert.equal(f.streams[0].closed, true);
  assert.equal(f.requests[0].options.signal.aborted, true);
  assert.equal(f.timers.size, 0);
  f.streams[0].onmessage({ data: '{"positions":["late"]}' });
  assert.equal(f.received.length, 1);
  f.visibility(false); await f.settle();
  assert.equal(f.streams.length, 2); assert.equal(f.requests.length, 2);
  f.stop(); assert.equal(f.streams[1].closed, true);
  assert.equal(f.timers.size, 0); assert.equal(f.events.size, 0);
});

test('a tab opened in the background makes no live requests until visible', async () => {
  const f = fixture(true); await f.settle();
  assert.equal(f.requests.length, 0); assert.equal(f.streams.length, 0);
  f.visibility(false); await f.settle(); assert.equal(f.requests.length, 1);
  f.stop();
});

test('healthy streams suppress polling; an interrupted stream triggers a fallback', async () => {
  const f = fixture(); await f.settle();
  f.streams[0].onmessage({ data: '{"positions":["fresh"]}' });
  await f.tick(); assert.equal(f.requests.length, 1);
  f.streams[0].onerror(); await f.tick();
  assert.equal(f.requests.length, 2); assert.equal(f.errors(), 0);
  f.stop();
});

test('a late snapshot cannot overwrite a newer live frame', async () => {
  let finish;
  const received = [], streams = [];
  const api = load('../lib/liveData.ts', {
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    EventSource: class { constructor() { streams.push(this); } close() {} },
    setTimeout() { return 1; }, clearTimeout() {},
    fetch: () => new Promise(resolve => { finish = resolve; }),
  });
  const stop = api.subscribeLiveData({ kind: 'satellites', pollMs: 5000, staleMs: 5000, onData: body => received.push(body), onError() {} });
  streams[0].onmessage({ data: '{"timestamp":"new"}' });
  finish(Response.json({ timestamp: 'old' }));
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(received.length, 1); assert.equal(received[0].timestamp, 'new'); stop();
});

test('public configuration strips credentials and limits CSP to live namespaces', async () => {
  const config = load('../next.config.ts', { process: { env: { BACKEND_API_URL: 'https://user:secret@vps.example/private' } } }).default;
  assert.equal(config.env.NEXT_PUBLIC_LIVE_API_ORIGIN, 'https://vps.example');
  const headers = await config.headers();
  const csp = headers[0].headers[0].value;
  assert.match(csp, /connect-src 'self' https:\/\/vps.example\/api\/v1\/movements\/ https:\/\/vps.example\/api\/v1\/satellites\/ https:\/\/vps.example\/api\/v1\/map\/ https:\/\/vps.example\/api\/v1\/collected\//);
  assert.doesNotMatch(JSON.stringify(config.env) + csp, /user|secret|private/);
  const rewrites = await config.rewrites();
  assert.equal(rewrites.beforeFiles.find(rule => rule.source === '/api/map-layers').destination, 'https://vps.example/api/v1/map/collected-layers');
  assert.equal(rewrites.beforeFiles[0].destination, 'https://vps.example/api/v1/map-tiles/:layer/:z/:x/:y.png');
  const { pathToRegexp } = (await import('next/dist/compiled/path-to-regexp/index.js')).default;
  const matcher = pathToRegexp(rewrites.beforeFiles[0].source);
  for (const layer of ['base', 'rain']) assert.ok(matcher.test(`/api/map-tiles/${layer}/12/2144/1402.png`));
  for (const path of ['lora/12/1/2.png', 'base/no/1/2.png', 'base/12/1/2.jpg']) assert.equal(matcher.test('/api/map-tiles/' + path), false);
});

for (const [route, kind] of [['mobility', 'movements'], ['satellites', 'satellites']]) {
  test(`${route} compatibility stream returns an immediate redirect without opening an upstream request`, () => {
    const api = load(`../app/api/${route}/stream/route.ts`, {
      require: () => ({ env: { BACKEND_API_URL: 'https://user:secret@vps.example/internal' } }),
      fetch() { throw new Error('A serverless function must not hold the stream'); },
    });
    const response = api.GET();
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), `https://vps.example/api/v1/${kind}/stream`);
  });
}

const mapModel = load('../lib/mapData.ts');
const publicMap = load('../lib/publicMapData.ts', { require: name => {
  assert.equal(name, './mapData'); return mapModel;
} });

test('bulk map payloads and raster tiles bypass Vercel while addressing only public VPS endpoints', () => {
  for (const [resource, path] of Object.entries({ sensors: 'map/sensors', layers: 'map/collected-layers', maengelmelder: 'collected/civic/maengelmelder', schaedlingsradar: 'collected/civic/schaedlingsradar' })) {
    assert.equal(publicMap.publicMapDataUrl(resource), `https://vps.example/api/v1/${path}`);
  }
  assert.equal(publicMap.publicMapTileUrl('base'), 'https://vps.example/api/v1/map-tiles/base/{z}/{x}/{y}.png');
  assert.equal(publicMap.publicMapTileUrl('rain'), 'https://vps.example/api/v1/map-tiles/rain/{z}/{x}/{y}.png');
});

test('direct sensor snapshots preserve server normalization, hidden-station filtering and zero counts', () => {
  const sensor = { id: 'station', friendly_name: 'Station', latitude: 49.6, longitude: 8.4,
    readings: [{ metric: 'temperature', value: 18, unit: '°C', timestamp: '2026-10-30T08:00:00Z' }] };
  const sensors = [sensor, { ...sensor, id: 'hidden', is_hidden: true }];
  const decoded = publicMap.decodeMapSnapshot({ sensors });
  assert.equal(JSON.stringify(decoded.nodes), JSON.stringify(mapModel.toStationNodes(sensors)));
  assert.equal(decoded.nodes.length, 1); assert.equal(decoded.readingsAvailable, true);
  assert.equal(publicMap.decodeMapSnapshot({ sensors: [] }).nodes.length, 0);
  for (const invalid of [null, [], {}, { sensors: null }, { sensors: {} }]) assert.throws(() => publicMap.decodeMapSnapshot(invalid), /Invalid map response/);
});

test('the CSP permits public VPS map endpoints and tiles without exposing admin endpoints', async () => {
  const config = load('../next.config.ts', { process: { env: { BACKEND_API_URL: 'https://vps.example' } } }).default;
  const csp = (await config.headers())[0].headers[0].value;
  assert.match(csp, /img-src[^;]*https:\/\/vps.example\/api\/v1\/map-tiles\//);
  const connect = csp.split(';')[0];
  assert.ok(connect.includes('https://vps.example/api/v1/map/'));
  assert.ok(connect.includes('https://vps.example/api/v1/collected/'));
  assert.equal(connect.includes('https://vps.example;'), false);
  assert.equal(connect.includes('/admin'), false);
});
