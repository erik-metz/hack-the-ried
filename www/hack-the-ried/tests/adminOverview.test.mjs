import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, mocks, globals = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const context = { exports: {}, URL, URLSearchParams, AbortSignal, BigInt,
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
      return mocks[name];
    }, ...globals };
  vm.runInNewContext(code, context);
  return context.exports;
}
const server = { NextResponse: { json: (body, init) => Response.json(body, init) } };
const request = query => ({ nextUrl: new URL(`https://app.test/api?${query}`) });

test("scan cache cannot bypass authentication; invalid filters never reach backend", async () => {
  let authenticated = false;
  const calls = [];
  const route = load("app/api/admin/qr-scans/route.ts", {
    "@/lib/adminAuth": { isAuthenticated: async () => authenticated },
    "@/lib/adminOverview": { getScanPage: async (...args) => { calls.push(args); return { items: [], next_cursor: null }; } },
    "next/server": server,
  });
  assert.equal((await route.GET(request(""))).status, 401);
  authenticated = true;
  for (const query of ["before=0", "before=-1", "before=9223372036854775808", "before=1%27", "qr_id=11", "days=-1", "days=garbage"]) {
    assert.equal((await route.GET(request(query))).status, 400, query);
  }
  assert.equal(calls.length, 0);
  const response = await route.GET(request(""));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Array.from(calls[0]), ["", "", 0]);
  await route.GET(request("before=9007199254740993&qr_id=10&days=365"));
  assert.deepEqual(Array.from(calls[1]), ["9007199254740993", "10", 365]);
});

test("admin data caches results for 60 seconds and forwards cursor and filters exactly", async () => {
  const configurations = [];
  const calls = [];
  const overview = load("lib/adminOverview.ts", {
    "@/env": { env: { BACKEND_API_URL: "https://backend.test", BACKEND_ADMIN_API_KEY: "test-key" } },
    "next/cache": { unstable_cache: (callback, keys, options) => { configurations.push({ keys, options }); return callback; } },
  }, { fetch: async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.pathname.endsWith("/subscribers") ? [] : { items: [], next_cursor: null });
  } });
  assert.equal(configurations.length, 2);
  for (const config of configurations) assert.equal(config.options.revalidate, 60);
  assert.notDeepEqual(configurations[0].keys, configurations[1].keys);
  assert.equal(configurations[0].options.tags[0], overview.SUBSCRIBERS_CACHE_TAG);
  assert.deepEqual((await overview.getSubscribers()).items, []);
  await overview.getScanPage("9007199254740993", "10", 0);
  assert.equal(calls[1].url.searchParams.get("before"), "9007199254740993");
  assert.equal(calls[1].url.searchParams.get("qr_id"), "10");
  assert.equal(calls[1].url.searchParams.get("days"), "0");
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-key");
});

test("newsletter JSON and CSV stay protected; writes invalidate the shared cache", async () => {
  let authenticated = false;
  let reads = 0;
  const invalidations = [];
  const route = load("app/api/newsletter/route.ts", {
    "@/env": { env: { BACKEND_API_URL: "https://backend.test", BACKEND_ADMIN_API_KEY: "test-key" } },
    "@/lib/adminAuth": { isAuthenticated: async () => authenticated },
    "@/lib/adminOverview": { SUBSCRIBERS_CACHE_TAG: "subscribers-test", getSubscribers: async () => {
      reads++;
      return { items: [{ email: "=formula@example.org", category: "newsletter", consented_at: "2026-01-01T12:00:00Z" }], fetched_at: "2026-11-10T12:00:00Z" };
    } },
    "next/cache": { revalidateTag: (...args) => invalidations.push(args) },
    "next/server": { NextResponse: Response },
  }, { fetch: async () => Response.json({ success: true }) });
  for (const query of ["", "format=json"]) assert.equal((await route.GET(request(query))).status, 401);
  assert.equal(reads, 0);
  authenticated = true;
  const json = await route.GET(request("format=json"));
  assert.equal((await json.json()).items[0].email, "=formula@example.org");
  assert.equal(json.headers.get("cache-control"), "private, no-store");
  const csv = await route.GET(request(""));
  assert.match(await csv.text(), /"'=formula@example.org"/);
  await route.DELETE({ json: async () => ({ email: "user@example.org" }) });
  await route.POST({ json: async () => ({ email: "user@example.org", consent: true }) });
  assert.equal(invalidations.length, 2);
  for (const [tag, options] of invalidations) {
    assert.equal(tag, "subscribers-test");
    assert.equal(options.expire, 0);
  }
});
