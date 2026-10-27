import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function compile(path, deps={}) {
  const ctx={exports:{},URLSearchParams,require:id=>{const key=id.split('/').pop();if(deps[key])return deps[key];throw new Error(id);}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  return ctx.exports;
}
const context=compile('../lib/contextLayers.ts');
const sources=compile('../lib/supplementaryLayers.ts',{contextLayers:context});
const lib=compile('../lib/supplementaryPresentation.ts',{supplementaryLayers:sources});
const now=Date.parse('2026-10-10T00:00:00Z');
const point=p=>({type:'Feature',properties:p,geometry:{type:'Point',coordinates:[8.4,49.6]}});
const collection=features=>({type:'FeatureCollection',features});
test('charger reconciliation prefers direct register data and merges only new BNetzA IDs',()=>{
 const direct=collection([point({id:'bnetza-123',name:'Direkt',totalPoints:4}),point({bnetzaId:'00124',name:'Zweiter'})]);
 const esri=collection([point({Ladeeinrichtungs_ID:123,name:'Alt'}),point({Ladeeinrichtungs_ID:124}),point({Ladeeinrichtungs_ID:125}),point({OBJECTID:9})]);
 const result=lib.mergedChargers(direct,esri);
 assert.equal(result.features.length,3);
 assert.equal(result.features[0].properties.name,'Direkt');
 assert.equal(result.features[0].properties.totalPoints,4);
 assert.equal(result.features[2].properties.register_source,'esri');
 assert.equal(direct.features[0].properties.register_source,undefined);
});
test('missing direct collection still allows identified Esri stations; unrelated primary points remain',()=>{
 assert.equal(lib.mergedChargers(undefined,collection([point({Ladeeinrichtungs_ID:0})])).features.length,1);
 assert.equal(lib.mergedChargers(collection([point({name:'Ohne Kennung'})]),null).features.length,1);
});
test('warning freshness expires even when the browser stops polling',()=>{
 const snapshot={...collection([]),checked_at:new Date(now).toISOString(),source_updated_at:new Date(now-60*60000).toISOString()};
 assert.equal(lib.warningsFresh(snapshot,now),true);
 assert.equal(lib.warningsFresh(snapshot,now+121000),false);
 assert.equal(lib.warningsFresh({...snapshot,source_updated_at:new Date(now-91*60000).toISOString()},now),false);
 assert.equal(lib.warningsFresh({...snapshot,checked_at:new Date(now+60000).toISOString()},now),false);
 assert.equal(lib.warningsFresh(null,now),false);
});
test('client rejects warnings without timestamps and malformed combined geometry',()=>{
 assert.throws(()=>lib.decodeSupplementarySnapshot('warnings',collection([])));
 assert.throws(()=>lib.decodeSupplementarySnapshot('monitoring',collection([{...point({}),geometry:null}])));
 assert.equal(lib.decodeSupplementarySnapshot('monitoring',collection([point({FID:1})])).features.length,1);
});
test('popup text retains zero, labels missing values and never invents charger availability',()=>{
 const rows=lib.supplementaryRows('chargers',{register_id:'5',totalPoints:0,maxPowerKw:null,register_source:'direct'},now).join('\n');
 assert.match(rows,/Ladepunkte: 0/);assert.match(rows,/unbekannt/);assert.match(rows,/Live-Belegung nicht verfügbar/);
 assert.equal(lib.supplementaryTitle('monitoring',{NAME:'<script>bad</script>'}),'<script>bad</script>');
 assert.match(lib.supplementaryRows('monitoring',{},now).join(),/keine Live-Messwerte/);
});
test('upcoming warnings and warning severity remain explicit',()=>{
 assert.match(lib.supplementaryRows('warnings',{ONSET:new Date(now+60000).toISOString()},now)[0],/Kommende/);
 assert.notEqual(lib.supplementaryColor('warnings',{SEVERITY:'Extreme'}),lib.supplementaryColor('warnings',{SEVERITY:'Minor'}));
 assert.equal(lib.supplementaryColor('warnings',{SEVERITY:'unknown'}),'#94a3b8');
});
