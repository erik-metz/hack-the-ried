import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks, globals = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, Date, URL, URLSearchParams, Response, AbortSignal, ...globals, require(name) { if (!(name in mocks)) throw new Error(name); return mocks[name]; } };
  vm.runInNewContext(code, context); return context.exports;
}
const helpers = load('lib/pitchWindow.ts', {});
const start = new Date(Date.now() - 60000).toISOString();
function route(fetch) {
  return load('app/api/pitch-window/route.ts', {
    '@/env': { env: { BACKEND_API_URL: 'https://backend.example' } },
    '@/lib/pitchWindow': helpers,
  }, { fetch }).GET;
}
function request(value = start) { return new Request(`http://localhost/api/pitch-window?start=${encodeURIComponent(value)}`); }
test('activity proxy preserves zero event counts and uses the exact talk window', async () => {
  let url;
  const payload = {startedAt: start, checkedAt: new Date().toISOString(), crossings: {opened: 0, closed: 2}, bikes: {removed: 3, returned: 1}, moving: {ship: {count: 0}}};
  const response = await route(async input => { url = input; return Response.json(payload); })(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), payload);
  assert.equal(url.pathname, '/api/v1/pitch/activity');
  assert.equal(url.searchParams.get('start'), start);
});
test('missing activity, invalid timestamps and mismatched windows never become fake zeros', async () => {
  for (const payload of [null, [], {error: 'failed'}, {startedAt: start, checkedAt: 'invalid', crossings: null, bikes: null, moving: null}, {startedAt: new Date().toISOString(), checkedAt: start, crossings: null, bikes: null, moving: null}]) {
    const response = await route(async () => Response.json(payload))(request());
    assert.equal(response.status, 503);
  }
  assert.equal((await route(async () => new Response('', {status: 502}))(request())).status, 503);
});
test('invalid or future start never requests the backend', async () => {
  let calls = 0;
  const GET = route(async () => { calls++; return Response.json({}); });
  for (const value of ['invalid', new Date(Date.now()+60000).toISOString(), new Date(Date.now()-3*3600000).toISOString()]) {
    assert.equal((await GET(request(value))).status, 400);
  }
  assert.equal(calls, 0);
});
