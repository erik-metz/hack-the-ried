import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const output=ts.transpileModule(fs.readFileSync('lib/autobahnRestAreas.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const lib=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const now=Date.now(), observedAt=new Date(now-1000).toISOString();
const area={id:'a',providerId:'DE-HE-670009',road:'A67',name:'Lorsch W',lat:49.643301,lng:8.552061,direction:null,carCapacity:26,lorryCapacity:32,providerBlocked:false,providerFuture:false};
const body=(records=[area])=>({road:'A67',kind:'parking_lorry',complete:true,timestampBasis:'collector_observed',sourceUpdatedAt:null,observedAt,records});
const reading=(metric,value,time=observedAt)=>({metric,value,unit:'count',timestamp:time});
const node={id:'rast-de-he-670009',name:'Lorsch West',lat:area.lat,lng:area.lng,readings:[reading('parking_free',0),reading('parking_capacity',42)]};
test('rest decoder preserves zero and unknowns; rejects incomplete, duplicate, invalid and expired data',()=>{
 const [r]=lib.decodeRestAreas(body([{...area,carCapacity:0,lorryCapacity:null,raw:{secret:1}}]),'A67',now);
 assert.equal(r.carCapacity,0);assert.equal(r.lorryCapacity,null);assert.equal(r.raw,undefined);
 assert.deepEqual(lib.decodeRestAreas(body([]),'A67',now),[]);
 for(const b of [{...body(),complete:false},{...body(),observedAt:new Date(now-72*3600000).toISOString()},body([area,area]),body([{...area,lorryCapacity:-1}]),body([{...area,lat:NaN}]),body([{...area,carCapacity:1.5}])]) assert.throws(()=>lib.decodeRestAreas(b,'A67',now));
 assert.throws(()=>lib.decodeRestAreas(body(),'A5',now));
});
test('rest matching requires exact unique DATEX identity and consistent location',()=>{
 assert.equal(lib.restAreaMatch(area,[node]),node);
 for(const nodes of [[{...node,id:'rast-de-he-670010'}],[node,node],[{...node,lat:49.8}]]) assert.equal(lib.restAreaMatch(area,nodes),undefined);
});
test('rest occupancy preserves zero and capacity conflict; stale values never appear current',()=>{
 const r={...area,observedAt};const rows=lib.restAreaRows(r,[node],now).join('\n');
 assert.match(rows,/0 freie LKW/);assert.match(rows,/26 PKW · 32 LKW/);assert.match(rows,/Kapazität: 42 LKW/);assert.match(rows,/Kapazitätsabweichung/);
 for(const time of [new Date(now-30*60000).toISOString(),'bad',new Date(now+60000).toISOString()]) {
  const text=lib.restAreaRows(r,[{...node,readings:[reading('parking_free',5,time)]}],now).join('\n');
  assert.match(text,/Keine aktuelle LKW-Belegung/);assert.doesNotMatch(text,/5 freie/);
 }
 assert.match(lib.restAreaRows(r,[],now).join('\n'),/Keine eindeutige Zuordnung/);
});
function route(readCollected) {
 const ctx={exports:{},Response,require:id=>id.endsWith('autobahnChargers')?{AUTOBAHN_ROADS:['A67','A5','A6']}:id.endsWith('autobahnRestAreas')?lib:{readCollected}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/autobahn-rest-areas/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,ctx);
 return ctx.exports.GET;
}
test('rest endpoint preserves partial failure and distinguishes empty success from outage',async()=>{
 const response=await route(async path=>{if(!path.includes('A67'))throw Error();return body();})();
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.areas.length,1);assert.deepEqual(result.unavailableRoads,['A5','A6']);
 assert.equal((await route(async()=>{throw Error();})()).status,503);
 const empty=await route(async path=>({...body([]),road:path.split('/')[2]}))();assert.equal(empty.status,200);assert.deepEqual((await empty.json()).areas,[]);
});

test('map renders only inventory locations without an existing occupancy marker, with the shared parking icon',()=>{
 const unmatched={...area,id:'other',providerId:'DE-HE-670010',observedAt};
 const markers=[];let stateIndex=0,effectIndex=0;
 const map={attributionControl:{addAttribution(){},removeAttribution(){}}};
 const ctx={exports:{},require:id=>{
  if(id==='react') return {useState:()=>[[{areas:[{...area,observedAt},unmatched],unavailableRoads:[]},false,now][stateIndex++],()=>{}],useEffect:fn=>{if(effectIndex++===1)fn();}};
  if(id==='react/jsx-runtime') return {jsx:()=>null,jsxs:()=>null};
  if(id==='leaflet') return {layerGroup:()=>({addTo(){return this;},remove(){}}),divIcon:options=>options,marker:(coords,options)=>{markers.push({coords,options});return {bindPopup(){return this;},addTo(){return this;}};}};
  if(id.endsWith('autobahnRestAreas'))return lib;
  if(id.endsWith('mapData'))return {CATEGORIES:{parking:{color:'#a78bfa'}}};
  if(id.endsWith('mapMarker'))return {createMarkerContent:(...args)=>({sharedParkingIcon:args})};
  if(id.endsWith('mapPresentation'))return {detailCard:()=>({})};
  throw Error(id);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/components/MapRestAreaLayer.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,ctx);
 ctx.exports.default({map,nodes:[node]});
 assert.equal(markers.length,1);
 assert.equal(markers[0].options.title,`Autobahn-Inventar · ${unmatched.name}`);
 assert.equal(markers[0].options.icon.className,'map-sensor-icon');
 assert.deepEqual(Array.from(markers[0].options.icon.iconAnchor),[16,16]);
 assert.equal(markers[0].options.icon.html.sharedParkingIcon[0],'parking');
});
