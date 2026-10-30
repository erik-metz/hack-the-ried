import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, globals = {}) {
  const context = { exports: {}, Date, URL, Response, AbortSignal, AbortController,
    process: { env: { NEXT_PUBLIC_LIVE_API_ORIGIN: 'https://vps.example' } }, ...globals };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context); return context.exports;
}
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function pollingFixture() {
  const events = new Map(), timers = new Map(), signals = [];
  let observer, finish;
  const document = { hidden: false, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const lib = load('../lib/visiblePolling.ts', {
    document,
    IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
    setTimeout(fn) { timers.set(fn, fn); return fn; }, clearTimeout(key) { timers.delete(key); },
  });
  const stop = lib.pollVisible(signal => { signals.push(signal); return new Promise(resolve => { finish = resolve; }); }, 30000, { target: {} });
  return { signals, timers, events, document, stop, visible: value => observer([{ isIntersecting: value }]),
    finish: async () => { finish(); await settle(); },
    hidden: value => { document.hidden = value; events.get('visibilitychange')(); } };
}

test('off-screen diagrams never fetch and leaving the viewport aborts in-flight work', async () => {
  const f = pollingFixture(); assert.equal(f.signals.length, 0);
  f.visible(true); assert.equal(f.signals.length, 1);
  f.visible(false); assert.equal(f.signals[0].aborted, true);
  await f.finish(); assert.equal(f.timers.size, 0);
  f.visible(true); assert.equal(f.signals.length, 2);
  f.stop(); assert.equal(f.signals[1].aborted, true); assert.equal(f.events.size, 0);
});

test('hidden tabs cancel polling and returning to a visible chart reloads immediately', async () => {
  const f = pollingFixture(); f.visible(true); await f.finish(); assert.equal(f.timers.size, 1);
  f.hidden(true); assert.equal(f.timers.size, 0); assert.equal(f.signals[0].aborted, true);
  f.hidden(false); assert.equal(f.signals.length, 2);
  f.stop();
});

test('polling schedules the next request only after the current task finishes', async () => {
  const f = pollingFixture(); f.visible(true); assert.equal(f.timers.size, 0);
  await f.finish(); assert.equal(f.timers.size, 1);
  f.stop(); assert.equal(f.timers.size, 0);
});

test('public readers refuse expired publications, invalid lifetimes and admin paths', async () => {
  for (const expiry of ['invalid', '2000-01-01T00:00:00Z']) {
    const api = load('../lib/publicRequests.ts', { fetch: async () => Response.json([], { headers: { 'x-data-expires-at': expiry } }) });
    await assert.rejects(api.readPublicResource('collected/example', new AbortController().signal));
  }
  const api = load('../lib/publicRequests.ts', { fetch: async () => { throw new Error('Must not fetch'); } });
  for (const path of ['admin/sensors', 'collected/../admin/sensors', 'collected/%2e%2e/admin/sensors', 'https://evil.example']) assert.throws(() => api.publicApiUrl(path));
});

test('CORS-safe cache lifetime bounds display time and avoids old proxy-cache TTLs', async () => {
  let requested;
  const startedAt = Date.now();
  const api = load('../lib/publicRequests.ts', { fetch: async url => { requested = url; return Response.json([1], { headers: { 'cache-control': 'public, max-age=2, s-maxage=2' } }); } });
  const result = await api.readPublicResource('collected/example?year=2024', new AbortController().signal);
  assert.equal(requested.origin, 'https://vps.example'); assert.equal(requested.searchParams.get('year'), '2024');
  assert.ok(Number(requested.searchParams.get('_snapshot')) >= startedAt);
  assert.ok(result.expiresAt <= Date.now() + 2000); assert.deepEqual(result.data, [1]);
  const unknown = load('../lib/publicRequests.ts', { fetch: async () => Response.json([]) });
  await assert.rejects(unknown.readPublicResource('collected/example', new AbortController().signal), /lifetime/);
});
