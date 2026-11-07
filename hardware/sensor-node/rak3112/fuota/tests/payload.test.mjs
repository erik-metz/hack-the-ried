import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../dummy/payload-formatter.js', import.meta.url), 'utf8'), context);
const decode = (bytes, fPort=42) => JSON.parse(JSON.stringify(context.decodeUplink({bytes, fPort})));
test('identifies A and B and preserves full uint32 counter', () => {
  assert.deepEqual(decode([1,1,0,111,0,0,0,1]), {data:{test_firmware:1,test_value:111,counter:1}});
  assert.deepEqual(decode([1,2,0,222,255,255,255,255]), {data:{test_firmware:2,test_value:222,counter:4294967295}});
});
test('rejects other ports, truncated payloads, trailing data and other formats', () => {
  const valid = [1,1,0,111,0,0,0,1];
  for (const bytes of [[], valid.slice(1), [...valid,0], [2,...valid.slice(1)]]) {
    assert.equal(decode(bytes).errors.length, 1);
  }
  assert.equal(decode(valid, 10).errors.length, 1);
});
test('decodes transfer status and targeted repair list', () => {
  assert.deepEqual(decode([1,1,0,0,0,123,0,0,0,1,0,0,0,3,0,0,0,2],43),
    {data:{fuota_state:1,session:123,received_blocks:1,total_blocks:3,missing_blocks:[0,2]}});
});
