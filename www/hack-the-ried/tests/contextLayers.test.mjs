import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function compile(path, extra = {}) {
  const ctx = { exports: {}, URL, URLSearchParams, AbortSignal, Response, ...extra };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, ctx);
  return ctx.exports;
}
const lib = compile("../lib/contextLayers.ts");
const polygon = (properties = {}) => ({ type: "Feature", properties, geometry: { type: "Polygon", coordinates: [[[8.4,49.6],[8.5,49.6],[8.5,49.7],[8.4,49.6]]] } });
function route(fetch) { return compile("../app/api/context-layers/route.ts", { fetch, require: () => lib }).GET; }
function request(layer) { return new Request(`http://localhost/api/context-layers?layer=${layer}`); }
test("queries use fixed region, fields and stable ordering", () => {
  const u = new URL(lib.contextQuery("landcover", 0, 1000));
  assert.equal(u.hostname, "services2.arcgis.com");
  assert.equal(u.searchParams.get("geometry"), "8.35,49.55,8.58,49.76");
  assert.equal(u.searchParams.get("orderByFields"), "OBJECTID_1");
  assert.equal(u.searchParams.get("resultOffset"), "1000");
  assert.equal(lib.isContextLayerId("__proto__"), false);
});
test("unknown and zero census values remain distinct; source interval strings are preserved", () => {
  for (const value of [null, -1, "5", NaN]) assert.equal(lib.contextNumber(value), null);
  assert.equal(lib.contextNumber(0), 0);
  assert.notEqual(lib.contextColor("census", { Einwohner: 0 }), lib.contextColor("census", { Einwohner: -1 }));
  assert.match(lib.contextRows("floodrisk", { scenario: 0, FL_RECUR: ">200" }).join(), />200/);
  assert.match(lib.contextRows("census", { Einwohner: -1 }).join(), /unbekannt/);
});
test("rejects ArcGIS errors, invalid geometry and invalid coordinates", () => {
  for (const value of [{ error: {} }, { type: "FeatureCollection", features: [{...polygon(), geometry: null}] }, {type:"FeatureCollection",features:[{...polygon(),geometry:{type:"Polygon",coordinates:[[[999,49]]]}}]}]) {
    assert.throws(() => lib.decodeContextPage(value));
  }
});
test("unknown layers never fetch", async () => {
  const result = await route(() => { throw new Error("Unexpected fetch"); })(request("https://example.com"));
  assert.equal(result.status, 400);
});
test("paginates transfer-limited results and retains complete features", async () => {
  let calls = 0;
  const result = await route(async url => {
    assert.equal(new URL(url).searchParams.get("resultOffset"), String(calls * 1000));
    calls++;
    return Response.json({ type: "FeatureCollection", features: [polygon({OBJECTID_1:calls})], exceededTransferLimit: calls === 1 });
  })(request("landcover"));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).features.length, 2);
  assert.equal(calls, 2);
});
test("one failed flood scenario prevents partial publication", async () => {
  const result = await route(async url => url.includes("/1/query") ? Response.json({error:{message:"Unavailable"}}) : Response.json({type:"FeatureCollection",features:[polygon({OBJECTID:1})]}))(request("floodrisk"));
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal((await result.json()).features, undefined);
});
test("hard cap fails visibly instead of truncating", async () => {
  let calls = 0;
  const result = await route(async () => { calls++; return Response.json({type:"FeatureCollection",features:[polygon({OBJECTID:calls})], exceededTransferLimit:true}); })(request("census"));
  assert.equal(calls, 10);
  assert.equal(result.status, 503);
});
test("complete empty region is a successful empty layer", async () => {
  const result = await route(async () => Response.json({type:"FeatureCollection",features:[]}))(request("census"));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).features.length, 0);
});

test("duplicate or missing context IDs prevent publishing an incomplete inventory", async () => {
  for (const properties of [{OBJECTID_1:1}, {}]) {
    let calls = 0;
    const result = await route(async () => {
      calls++;
      return Response.json({type:"FeatureCollection",features:[polygon(properties)],exceededTransferLimit:true});
    })(request("landcover"));
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal((await result.json()).features, undefined);
    assert.equal(calls, properties.OBJECTID_1 ? 2 : 1);
  }
});
test("context IDs are scoped to each flood scenario", async () => {
  const result = await route(async () => Response.json({type:"FeatureCollection",features:[polygon({OBJECTID:1})]}))(request("floodrisk"));
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).features.map(f => f.properties.scenario), [0,1,2]);
});
