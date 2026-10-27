import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, modules={}, extra={}) {
 const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');
 const context={exports:{}, URL,Response,AbortSignal,Headers,Date, console,
  require(id) { if (id in modules) return modules[id]; throw new Error(`Unexpected dependency ${id}`); },...extra};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return context.exports;
}
const env={env:{BACKEND_API_URL:'https://vps.example'}};

test('regular offers reread the combined publication instead of caching a mixed source batch', async () => {
 let seen;
 const lib=load('../lib/collectedBackend.ts',{'@/env':env},{fetch:async(url,init)=>{seen=init;return Response.json([]);}});
 await lib.readCollected('social/regular-offers');
 assert.equal(seen.cache,'no-store');
 assert.equal(seen.next,undefined);
 await lib.readCollected('example');
 assert.equal(seen.next.revalidate,300);
});

test('all domain fetchers reject backend failures instead of returning baselines',async()=>{
 const modules={'@/env':env,'./collectedBackend':{collectedFetch:async()=>new Response(null,{status:503})}};
 for (const [file,functions] of Object.entries({
  demographicsData:['fetchDemographicSummary','fetchEducationalFacilities','fetchCommuterFlows'],
  realestateData:['fetchRealEstateSummary','fetchHousingStock','fetchBorisZones','fetchConstructionActivity','fetchMarketBenchmarks','fetchDevelopmentPlans'],
  financeData:['fetchBudgets','fetchSpending','fetchFinanceComparison'],
  electionsData:['fetchElections','fetchElectionDistricts'],
  economyData:['fetchEconomyOverview','fetchCompanies','fetchTaxRates','fetchBusinessRegistrations','fetchIndustryStructure','fetchStartupInitiatives'],
  regionalStats:['fetchSocialSummary','fetchWasteStatistics','fetchRegionalFacilities','fetchCulturalEvents'],
 })) {
  const lib=load(`../lib/${file}.ts`,modules);
  for (const fn of functions) await assert.rejects(lib[fn](),undefined,`${file}.${fn}`);
 }
});

test('empty collected data remains empty',async()=>{
 const lib=load('../lib/demographicsData.ts',{'@/env':env,'./collectedBackend':{collectedFetch:async()=>Response.json([])}});
 assert.equal((await lib.fetchDemographicSummary()).length,0);
});

test('shared fetch only addresses the VPS and opts into caching',async()=>{
 let seen;
 const lib=load('../lib/collectedBackend.ts',{'@/env':env},{fetch:async(url,init)=>{seen={url:String(url),init};return Response.json([]);}});
 await lib.collectedFetch('https://vps.example/api/v1/demographics/summary');
 assert.equal(seen.url,'https://vps.example/api/v1/collected/demographics/summary');
 assert.equal(seen.init.next.revalidate,300);
 await assert.rejects(lib.collectedFetch('https://provider.example/data'));
});

test('expired shared-cache entries are never relabelled current',async()=>{
 const lib=load('../lib/collectedBackend.ts',{'@/env':env},{fetch:async()=>Response.json([{value:1}],{headers:{'x-data-expires-at':'2000-01-01T00:00:00Z'}})});
 await assert.rejects(lib.readCollected('example'));
 const response=await lib.proxyBackend('collected/example');
 assert.equal(response.status,503);
 assert.equal(response.headers.get('cache-control'),'no-store');
});

test('movement compatibility routes pass the same stored batch through unchanged',async()=>{
 for (const route of ['mobility','buses','waste-trucks']) {
  const expected=Response.json({positions:[]});
  const lib=load(`../app/api/${route}/route.ts`,{'@/lib/collectedBackend':{proxyBackend:(path,ttl)=>{assert.equal(path,'movements/latest');assert.equal(ttl,0);return expected;}}});
  assert.equal(await lib.GET(),expected);
 }
});

test('map renderer has no external tiles, bundled datasets or local simulations',()=>{
 const source=fs.readFileSync(new URL('../app/components/MapComponent.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/calculate\w+Mobility|calculateLocalTraffic|BASELINE_|VERIFIED_|tileLayer\("https?:/);
 assert.match(source,/schedule_prediction/);
 assert.match(source,/valid_until/);
 assert.match(source,/document.hidden/);
});

test('proxy does not extend the upstream cache lifetime', async () => {
 const lib=load('../lib/collectedBackend.ts',{'@/env':env},{fetch:async()=>Response.json([],{headers:{'cache-control':'public, max-age=2','x-data-expires-at':new Date(Date.now()+60000).toISOString()}})});
 const response=await lib.proxyBackend('collected/example',300);
 assert.equal(response.headers.get('cache-control'),'public, max-age=2, s-maxage=2');
});

test('shared header has no invented sensor-count default', () => {
 const source=fs.readFileSync(new URL('../app/components/SiteHeader.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/sensorCount\s*\?\?\s*\d/);
});

test('departure proxy preserves stop namespace and bounds cache', async () => {
 let seen;
 const lib=load('../app/api/buses/stops/[stopId]/departures/route.ts',{'@/lib/collectedBackend':{proxyBackend:(path,ttl)=>{seen={path,ttl};return Response.json({departures:[]});}}});
 await lib.GET({url:'https://site.example/api/buses/stops/shared/departures?source=rail%26other'}, {params:Promise.resolve({stopId:'shared'})});
 assert.equal(seen.path,'transport/stops/shared/departures?source=rail%26other');
 assert.equal(seen.ttl,10);
});

test('full event archive bypasses the per-entry Next cache and preserves query options',async()=>{
 let call;
 const lib=load('../lib/collectedBackend.ts',{'@/env':env},{fetch:async(url,options)=>{call={url,options};return Response.json([]);}});
 await lib.collectedFetch('https://vps.example/api/v1/social/events?include_past=true');
 assert.equal(call.url.pathname,'/api/v1/collected/social/events');
 assert.equal(call.url.searchParams.get('include_past'),'true');
 assert.equal(call.options.cache,'no-store');
 assert.equal(call.options.next,undefined);
});
