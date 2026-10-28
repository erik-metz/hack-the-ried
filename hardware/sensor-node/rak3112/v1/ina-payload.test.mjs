import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import vm from 'node:vm';

const directory = mkdtempSync(join(tmpdir(), 'rak-ina-'));
after(() => rmSync(directory, { recursive: true, force: true }));
function compile(source, output, extra = []) {
  const result = spawnSync('c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', ...extra,
    fileURLToPath(new URL(`../tools/${source}`, import.meta.url)), '-o', output], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
}
const executable = join(directory, 'encode');
compile('compact_payload_fixture.cpp', executable, ['-DRAK_INA226']);
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('./payload-formatter.js', import.meta.url), 'utf8'), context);
const decode = bytes => JSON.parse(JSON.stringify(context.decodeUplink({fPort:10,bytes})));
function encode(metrics) {
  const input = `300 222 ${metrics.length}\n` + metrics.map(m => m.join(' ')).join('\n');
  const result = spawnSync(executable, {input,encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split(/\s+/).map(Number);
}
const ina = [[36,4990,5000,5010,1200],[37,10000,12500,15000,1200],
  [38,100000,125000,150000,1200],[39,499000,625000,751500,1200]];
const originalCodes = [...Array.from({length:21},(_,i)=>i+1),29,30,31,32,33];

test('INA identity, signed conversions, microamp precision and saturation checks', () => {
  const fixture = join(directory, 'ina');
  compile('ina226_fixture.cpp', fixture);
  assert.equal(spawnSync(fixture).status, 0);
});

test('all 30 channels including INA fit in 204 bytes with statistics', () => {
  const bytes = encode([...originalCodes.map(code => [code,90,100,110,300]),...ina]);
  assert.equal(bytes[0], 8);
  assert.equal(bytes.length, 204);
  const data = decode(bytes).data;
  assert.equal(data.firmware_version, 14);
  assert.equal(data.measurements.length, 30);
  assert.deepEqual(data.window_statistics.slice(-4), [
    {metric:'bus_voltage',unit:'mV',min_value:4990,mean_value:5000,max_value:5010,sample_count:1200},
    {metric:'shunt_voltage',unit:'µV',min_value:10000,mean_value:12500,max_value:15000,sample_count:1200},
    {metric:'current',unit:'mA',min_value:100,mean_value:125,max_value:150,sample_count:1200},
    {metric:'power',unit:'mW',min_value:499,mean_value:625,max_value:751.5,sample_count:1200}
  ]);
});

test('INA alone and negative current/power retain signs and sub-mA values', () => {
  const bytes = encode([[38,-25,-25,-25,1],[39,-125,-125,-125,1]]);
  assert.deepEqual(decode(bytes).data.measurements, [
    {metric:'current',unit:'mA',value:-0.025},{metric:'power',unit:'mW',value:-0.125}
  ]);
  assert.ok(decode([7,...bytes.slice(1)]).errors);
  for (let length = 0; length < bytes.length; ++length) assert.ok(decode(bytes.slice(0,length)).errors);
});

test('firmware v14 emits compatible format 7 when INA measurements are absent', () => {
  const bytes = encode(originalCodes.map(code => [code,90,100,110,300]));
  assert.equal(bytes[0], 7);
  assert.equal(bytes.length, 165);
  assert.equal(decode(bytes).data.measurements.length, 26);
});

test('legacy INA scale remains whole mA/mW outside format 8', () => {
  const result = decode([3,38,0,0,0,125,39,0,0,2,113]);
  assert.deepEqual(result.data.measurements,[
    {metric:'current',unit:'mA',value:125},{metric:'power',unit:'mW',value:625}
  ]);
});
