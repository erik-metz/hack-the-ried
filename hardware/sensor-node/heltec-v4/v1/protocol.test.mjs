import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
const context=vm.createContext({});vm.runInContext(readFileSync(join(here,'payload-formatter.js'),'utf8'),context);
const decode=bytes=>JSON.parse(JSON.stringify(context.decodeUplink({fPort:44,bytes})));
test('real C++ GPS encoder decodes signed coordinates, altitude, battery and full counter',()=>{
 const dir=mkdtempSync(join(tmpdir(),'heltec-protocol-'));
 try {
  const source='#include <cstdio>\n#include "gps_packet.h"\nint main(){tracker::Sample s;s.position=s.altitude=s.hdop=s.battery=true;s.latitude=-123456789;s.longitude=1799999999;s.altitudeMetres=-123;s.hdopHundredths=99;s.batteryMv=4111;s.satellites=12;s.ageSeconds=2;uint8_t out[24];tracker::encode(out,s,0xffffffff,2);for(auto x:out)printf("%u ",x);s.position=false;tracker::encode(out,s,1,1);for(auto x:out)printf("%u ",x);}';
  writeFileSync(join(dir,'test.cpp'),source);execFileSync('c++',['-std=c++11','-I',here,join(dir,'test.cpp'),'-o',join(dir,'run')]);
  const bytes=execFileSync(join(dir,'run'),{encoding:'utf8'}).trim().split(/\s+/).map(Number);
  const d=decode(bytes.slice(0,24));assert.deepEqual(d.errors,[]);
  assert.equal(d.data.latitude,-12.3456789);assert.equal(d.data.longitude,179.9999999);
  assert.equal(d.data.altitude,-123);assert.equal(d.data.counter,4294967295);assert.equal(d.data.battery_v,4.111);assert.equal(d.data.test_value,222);
  const nofix=decode(bytes.slice(24));assert.deepEqual(nofix.errors,[]);assert.equal(nofix.data.gps_fix,false);
  assert.equal(nofix.data.latitude,undefined);assert.equal(nofix.data.altitude,undefined);assert.equal(nofix.warnings.length,1);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('rejects malformed and stale packets, unknown flags and impossible coordinates',()=>{
 const b=[1,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,1,111];
 assert.deepEqual(decode(b).errors,[]);
 for(const bad of [b.slice(1),[...b,0],b.map((v,i)=>i===1?128:v),b.map((v,i)=>i===21?10:v),b.map((v,i)=>i===6?127:v)]) assert.ok(decode(bad).errors.length);
});
