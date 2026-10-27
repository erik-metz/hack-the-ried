import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function compile(path, extra = {}) {
  const ctx = { exports: {}, URL, URLSearchParams, AbortSignal, Response, TextEncoder, ...extra };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, ctx);
  return ctx.exports;
}
const context = compile("../lib/contextLayers.ts");
const lib = compile("../lib/supplementaryLayers.ts", {require:()=>context});
const now = Date.parse("2026-10-09T17:00:00Z");
class Clock extends Date { static now() { return now; } }
const polygon = (properties = {}) => ({type:"Feature",properties,geometry:{type:"Polygon",coordinates:[[[8.4,49.6],[8.5,49.6],[8.5,49.7],[8.4,49.6]]]}});
const point = (properties = {}) => ({type:"Feature",properties,geometry:{type:"Point",coordinates:[8.4,49.6]}});
const page = (features = [], more = false) => ({type:"FeatureCollection",features,exceededTransferLimit:more});
const warning = (extra={}) => ({OBJECTID:1,STATUS:"Actual",MSGTYPE:"Alert",SCOPE:"Public",ONSET:"2026-10-09T18:00:00Z",EXPIRES:"2026-10-09T20:00:00Z",...extra});
function route(fetch) { return compile("../app/api/supplementary-layers/route.ts", {Date:Clock,fetch,require:id=>id.endsWith("/contextLayers")?context:lib}).GET; }
function request(layer) { return new Request(`http://localhost/api/supplementary-layers?layer=${layer}`); }
test("all four sources use verified bounded queries and warning polygons only", () => {
  assert.equal(lib.isSupplementaryId("__proto__"),false);
  const u=new URL(lib.supplementaryQuery("warnings",1,0));
  assert.match(u.pathname,/aea519\/FeatureServer\/1\/query/);
  assert.equal(u.searchParams.get("geometry"),"8.35,49.55,8.58,49.76");
  assert.throws(()=>lib.supplementaryQuery("warnings",0,0));
  assert.throws(()=>lib.supplementaryQuery("chargers",0,10000));
});
test("point collections validate coordinates and keep geometry types separate",()=>{
  assert.equal(lib.decodeSupplementaryPage("monitoring",page([point({FID:1})])).features.length,1);
  for(const value of [page([polygon()]),page([{...point(),geometry:{type:"Point",coordinates:[999,49]}}]),{error:{}}]) assert.throws(()=>lib.decodeSupplementaryPage("chargers",value));
  assert.throws(()=>lib.decodeSupplementaryPage("protected",page([point()])));
});
test("freshness is based on source data time and rejects stale, missing and future metadata",()=>{
  assert.equal(lib.warningSourceTimestamp({editingInfo:{dataLastEditDate:now-60000}},now),now-60000);
  for(const stamp of [null,now-91*60000,now+6*60000,"2026-10-09",NaN]) assert.throws(()=>lib.warningSourceTimestamp({editingInfo:{dataLastEditDate:stamp}},now));
});
test("retains upcoming public warnings, excludes expired/test/cancelled alerts",()=>{
  assert.equal(lib.retainedWarning(warning(),now),true);
  for(const extra of [{STATUS:"Test"},{MSGTYPE:"Cancel"},{SCOPE:"Private"},{ONSET:"2026-10-09T12:00:00Z",EXPIRES:"2026-10-09T16:00:00Z"}]) assert.equal(lib.retainedWarning(warning(extra),now),false);
  assert.throws(()=>lib.retainedWarning(warning({EXPIRES:"broken"}),now));
  assert.throws(()=>lib.retainedWarning(warning({EXPIRES:"2026-10-09T17:00:00Z"}),now));
});
test("fresh empty warning inventory is successful and never cached",async()=>{
  const result=await route(async (url,options)=>{
    assert.equal(options.cache,"no-store");
    return Response.json(url.includes("/query?")?page():{editingInfo:{dataLastEditDate:now-60000}});
  })(request("warnings"));
  assert.equal(result.status,200);assert.equal(result.headers.get("cache-control"),"no-store");
  const d=await result.json();assert.equal(d.features.length,0);assert.equal(d.source_updated_at,"2026-10-09T16:59:00.000Z");
});
test("stale warning service returns unavailable, never a reassuring empty response",async()=>{
  const result=await route(async()=>Response.json({editingInfo:{dataLastEditDate:now-2*3600000}}))(request("warnings"));
  assert.equal(result.status,503);assert.equal((await result.json()).features,undefined);
});
test("warning API applies expiration filtering without inventing current observations",async()=>{
  const result=await route(async url=>Response.json(url.includes("/query?")?page([polygon(warning()),polygon(warning({OBJECTID:2,ONSET:"2026-10-09T12:00:00Z",EXPIRES:"2026-10-09T16:00:00Z"}))]):{editingInfo:{dataLastEditDate:now}}))(request("warnings"));
  const d=await result.json();assert.equal(result.status,200);assert.equal(d.source_feature_count,2);assert.equal(d.features.length,1);
});
test("monitoring preserves distinct source layers and stable identifiers",async()=>{
  const result=await route(async()=>Response.json(page([point({FID:1})])))(request("monitoring"));
  const d=await result.json();assert.equal(result.status,200);assert.equal(d.features.length,2);
  assert.deepEqual(d.features.map(f=>f.properties.source_layer),[1,2]);
});
test("partial sublayer failure and duplicate pagination fail the entire publication",async()=>{
  const partial=await route(async url=>Response.json(url.includes("/2/query?")?{error:{}}:page([point({FID:1})])))(request("monitoring"));assert.equal(partial.status,503);
  let calls=0;const duplicate=await route(async()=>{calls++;return Response.json(page([point({OBJECTID:1})],true));})(request("chargers"));
  assert.equal(duplicate.status,503);assert.equal(calls,2);
});
test("unknown sources never trigger upstream requests",async()=>{
  const result=await route(()=>{throw new Error("Unexpected network");})(request("http://example.com"));assert.equal(result.status,400);
});
