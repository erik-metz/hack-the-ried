import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../lib/autobahnChargers.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const lib = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const now = Date.now();
const observedAt = new Date(now - 1000).toISOString();
const record = (id='a') => ({ id, providerId:id, name:'A67 | Mannheim | Lorsch West', road:'A67', lat:49.64, lng:8.55, direction:'Mannheim', totalPoints:2, maxPointPowerKw:300, connectorTypes:['CCS','CHAdeMO'], providerBlocked:false, providerFuture:false });
const body = (records=[record()], road='A67') => ({ records, road, kind:'electric_charging_station', complete:true, timestampBasis:'collector_observed', sourceUpdatedAt:null, observedAt });
const fc = features => ({ type:'FeatureCollection', features });
const point = (id,lng=8.55,lat=49.64) => ({ type:'Feature', geometry:{type:'Point',coordinates:[lng,lat]}, properties:{register_id:id,name:'Register',totalPoints:4} });
test('decoding retains unknowns and reported point power without inventing occupancy',()=>{
 const [offer]=lib.decodeAutobahnOffers(body([{...record(),totalPoints:null,maxPointPowerKw:0}]),'A67',now);
 assert.equal(offer.totalPoints,null);assert.equal(offer.maxPointPowerKw,0);
 assert.equal(offer.availablePoints,undefined);assert.equal(offer.raw,undefined);
 assert.equal(lib.decodeAutobahnOffers(body([]),'A67',now).length,0);
});
test('invalid or stale source responses never become a successful empty inventory',()=>{
 for(const payload of [{},body([record(),record()]),{...body(),complete:false},{...body(),observedAt:new Date(now-72*3600000).toISOString()},body([{...record(),lat:NaN}]),body([{...record(),totalPoints:2.5}])]) assert.throws(()=>lib.decodeAutobahnOffers(payload,'A67',now));
 assert.throws(()=>lib.decodeAutobahnOffers(body(),'A5',now));
 const offers=lib.decodeAutobahnOffers(body(),'A67',now);
 assert.equal(lib.freshAutobahnOffers({offers},now+72*3600000).length,0);
});
test('co-located offers share a marker without losing IDs; opposite directions stay separate',()=>{
 const offers=lib.decodeAutobahnOffers(body([record('a'),record('b'),{...record('c'),direction:'Darmstadt'}]),'A67',now);
 const register=fc([point('123'),point('124',8.5501),point('far',8.7)]);
 const map=lib.autobahnChargerCollection(offers,register);
 assert.equal(map.features.length,2);
 assert.deepEqual(map.features[0].properties.offers.map(o=>o.id),['a','b']);
 assert.deepEqual(map.features[0].properties.candidates.map(c=>c.id),['123','124']);
 assert.equal(map.features[0].properties.reconciliation,'proximity_only');
 assert.equal(map.features[0].properties.totalPoints,undefined);
 assert.equal(register.features[0].properties.totalPoints,4);
 assert.match(lib.autobahnChargerRows(map.features[0].properties).join('\n'),/unbestätigt/);
 assert.match(lib.autobahnChargerRows(map.features[0].properties).join('\n'),/nicht addiert/);
});
test('missing register is unknown coverage, not proof of no registration',()=>{
 const map=lib.autobahnChargerCollection(lib.decodeAutobahnOffers(body(),'A67',now),fc([]));
 assert.match(lib.autobahnChargerRows(map.features[0].properties).join('\n'),/keine Aussage über eine Registrierung/);
});
function route(readCollected) {
 const ctx={exports:{},Response,require:id=>id.endsWith('autobahnChargers')?lib:{readCollected}};
 const source=fs.readFileSync(new URL('../app/api/autobahn-chargers/route.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 return ctx.exports.GET;
}
test('route preserves valid roads and marks partial failures instead of discarding all offers',async()=>{
 const calls=[];
 const get=route(async path=>{calls.push(path);if(path.includes('/A5/'))throw Error('offline');return path.includes('/A6/')?body([],'A6'):body();});
 const response=await get();assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.offers.length,1);assert.deepEqual(data.unavailableRoads,['A5']);
 assert.equal(calls.length,3);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('all failed scopes produce 503 while complete empty lists remain successful',async()=>{
 assert.equal((await route(async()=>{throw Error('offline');})()).status,503);
 const response=await route(async path=>body([],path.split('/')[2]))();
 assert.equal(response.status,200);assert.deepEqual((await response.json()).unavailableRoads,[]);
});
