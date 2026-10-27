import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const aircraftContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/aircraftPresentation.ts', import.meta.url), 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, aircraftContext);
const context = { exports: {}, Date, Math, Number, Set, require: () => aircraftContext.exports };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/mobilityData.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const model = context.exports;
const now = Date.parse('2026-10-05T10:00:00Z');
test('OGN gliders retain their source and do not label GPS reports as pressure height', () => {
  const position={id:'aircraft:ogn:F:ABC123',kind:'aircraft',source_id:'ogn-ried',ogn_category:1,
    registration:'D-TEST',latitude:49.65,longitude:8.45,basis:'observed',
    timestamp:new Date(now).toISOString(),valid_until:new Date(now+60000).toISOString(),
    altitude_ogn_m:914.4,vertical_rate_ogn_mps:.51};
  const node=model.mobilityNodes([position],[],now)[0];
  assert.equal(node.name,'Segelflugzeug / Motorsegler D-TEST');
  assert.match(node.address,/Open Glider Network/);
  assert.deepEqual(Array.from(node.readings,r=>r.metric),['altitude_ogn','vertical_rate_ogn','latitude','longitude']);
  assert.equal(model.mobilityNodes([position],[],now+60000).length,0);
});
const crossing = { id:'a',entity_id:'crossing:a',name:'Gate',barrier:'half',latitude:49.64,longitude:8.45,
  status:'closed',timestamp:new Date(now).toISOString(),valid_until:new Date(now+30000).toISOString(),members:['a','b'] };
const feature = (id, barrier, longitude=8.45) => ({geometry:{type:'Point',coordinates:[longitude,49.64]},properties:{id,barrier,name:'Gate'}});
test('unbarriered and unmapped crossings are excluded, track nodes are grouped', () => {
  const geometry = {features:[feature('a','half'),feature('b','half',8.4501),feature('c','no'),feature('d','nicht erfasst'),feature('e','half',8.451)]};
  const sites=model.crossingSites(geometry,[crossing],now);
  assert.equal(sites.length,2);
  assert.equal(sites[0].status,'closed');
  assert.equal(sites[1].status,'unknown');
});
test('expired barrier estimate becomes unknown and cannot produce an open reading', () => {
  assert.equal(model.crossingStatus(crossing,now+30000),'unknown');
  assert.equal(model.mobilityNodes([], [crossing], now+30000)[0].readings.length,0);
  assert.equal(model.mobilityNodes([], [crossing], now)[0].readings[0].value,2);
});
test('vehicle clicks use canonical entities and offer speed, delay and paired coordinates', () => {
  const nodes=model.mobilityNodes([{id:'trip',kind:'train',latitude:49.64,longitude:8.45,timestamp:crossing.timestamp,valid_until:crossing.valid_until,basis:'schedule_prediction',speed_kmh:80,delay_seconds:120}],[],now);
  assert.equal(nodes[0].id,'movement:trip');
  assert.deepEqual(Array.from(nodes[0].readings,r=>r.metric),['speed','delay','latitude','longitude']);
  assert.match(nodes[0].address,/prognose/);
});
test('reported ships retain name, AIS source and canonical telemetry, then expire', () => {
  const ship={id:'ais:211276280',kind:'ship',name:'HELENE',latitude:49.75521,longitude:8.472255,
    timestamp:crossing.timestamp,valid_until:crossing.valid_until,basis:'observed',speed_kmh:1.3};
  const node=model.mobilityNodes([ship],[],now)[0];
  assert.equal(node.id,'movement:ais:211276280');
  assert.equal(node.name,'Schiff HELENE');
  assert.match(node.address,/AISstream/);
  const mapNode=model.mobilityNodes([{...ship,source_id:'rhein-map'}],[],now)[0];
  assert.match(mapNode.address,/AIS-Kartenposition/);
  assert.doesNotMatch(mapNode.address,/AISstream/);
  assert.equal(node.readings[0].value,1.3);
  assert.equal(model.mobilityNodes([ship],[],now+30000).length,0);
});
test('aircraft expose observed telemetry with separate altitude references and expire', () => {
  const aircraft={id:'aircraft:3c6488',kind:'aircraft',name:'DLH1WP',latitude:49.65,longitude:8.45,
    timestamp:crossing.timestamp,valid_until:crossing.valid_until,basis:'observed',speed_kmh:463,
    altitude_baro_m:3048,altitude_geom_m:3200,vertical_rate_mps:-5.08};
  const node=model.mobilityNodes([aircraft],[],now)[0];
  assert.equal(node.id,'movement:aircraft:3c6488');
  assert.equal(node.name,'Flugzeug · Kategorie unbekannt DLH1WP');
  assert.match(node.address,/adsb.lol/);
  assert.deepEqual(Array.from(node.readings,r=>r.metric),['speed','altitude_baro','altitude_geom','vertical_rate','latitude','longitude']);
  assert.equal(model.mobilityNodes([aircraft],[],now+30000).length,0);
});
const trails={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/aircraftTrail.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,trails);
test('aircraft traces deduplicate, bound history and break on gaps and implausible jumps', () => {
  const {updateAircraftTrail}=trails.exports;
  const first={stamp:now,lat:49.65,lng:8.45};
  let trail=updateAircraftTrail([],first,now);
  assert.equal(updateAircraftTrail(trail,first,now+10000).length,1);
  trail=updateAircraftTrail(trail,{...first,stamp:now+15000,lat:49.66},now+15000);
  assert.equal(trail.length,2);
  assert.equal(updateAircraftTrail(trail,{...first,stamp:now+90000},now+90000).length,1);
  assert.equal(updateAircraftTrail(trail,{...first,stamp:now+30000,lat:50.65},now+30000).length,1);
  for(let i=2;i<20;i++) trail=updateAircraftTrail(trail,{...first,stamp:now+i*1000},now+i*1000);
  assert.ok(trail.length<=12);
  assert.equal(updateAircraftTrail(trail,{...first,stamp:NaN},now+200000).length,0);
});
