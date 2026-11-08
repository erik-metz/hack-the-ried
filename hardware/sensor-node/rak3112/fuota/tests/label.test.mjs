import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const helper=fileURLToPath(new URL('../label_formatter.py',import.meta.url));
for(const number of [1,2,3,4,5]) test(`RAK${number} labels the received value, not a forced 222`,()=>{
 const c=vm.createContext({});vm.runInContext(execFileSync('python3',[helper,String(number)],{encoding:'utf8'}),c);
 for(const value of [111,222]) {
  const data=c.decodeUplink({fPort:42,bytes:[1,value===111?1:2,0,value,0,0,0,9]}).data;
  assert.equal(data.message,`rak${number}-${value}`);assert.equal(data.counter,9);assert.equal(data.rak_number,number);
 }
 assert.ok(c.decodeUplink({fPort:42,bytes:[1,2,0]}).errors);
});
