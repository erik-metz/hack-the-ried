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
function route(fetch) {
  const proxy = compile("../lib/referenceProxy.ts", { fetch, require: () => ({ env: { BACKEND_API_URL: "https://backend.test" } }) });
  return compile("../app/api/context-layers/route.ts", { require: id => id.endsWith("/referenceProxy") ? proxy : lib }).GET;
}
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
test("context reads use only the stored VPS publication", async () => {
  let calls=0;
  const result=await route(async url=>{ calls++; assert.equal(String(url),"https://backend.test/api/v1/reference/census"); return Response.json({type:"FeatureCollection",features:[polygon({Einwohner:0})]}); })(request("census"));
  assert.equal(result.status,200); assert.equal(calls,1);
  assert.equal((await result.json()).features[0].properties.Einwohner,0);
});
test("unavailable stored publication never falls back to external providers", async () => {
  let calls=0;
  const result=await route(async url=>{ calls++; assert.equal(new URL(url).hostname,"backend.test"); return new Response(null,{status:503}); })(request("floodrisk"));
  assert.equal(result.status,503);assert.equal(calls,1);assert.equal(result.headers.get("cache-control"),"no-store");
});
test("complete stored empty region remains an empty layer", async()=>{
  const result=await route(async()=>Response.json({type:"FeatureCollection",features:[]}))(request("landcover"));
  assert.equal(result.status,200);assert.equal((await result.json()).features.length,0);
});
