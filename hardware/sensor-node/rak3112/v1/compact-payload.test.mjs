import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import vm from 'node:vm';

const directory = mkdtempSync(join(tmpdir(), 'rak-compact-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const executable = join(directory, 'encode');
const build = spawnSync('c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
  fileURLToPath(new URL('../tools/compact_payload_fixture.cpp', import.meta.url)), '-o', executable], { encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr);
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('./payload-formatter.js', import.meta.url), 'utf8'), context);
const decode = bytes => JSON.parse(JSON.stringify(context.decodeUplink({ fPort: 10, bytes })));
const encode = (metrics, seconds = 300, capacity = 222) => {
  const input = `${seconds} ${capacity} ${metrics.length}\n` + metrics.map(m => m.join(' ')).join('\n');
  const result = spawnSync(executable, { input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? result.stdout.trim().split(/\s+/).map(Number) : [];
};
const record = (code, tag, value) => [(tag << 6) | code, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
// code, min, mean, max, samples. Full current hardware, realistic values and scales.
const metrics = [
  [1,-125,223,310,300],[2,400,511,700,300],[3,0,6,130,150],
  [4,420,778,1400,60],[5,1700,2264,2700,60],[6,3000,4850,6000,60],
  [7,-900,-399,-120,18750],
  ...Array.from({length:10}, (_, i) => [8+i,10,20+i,40,60]),
  [18,-1250,2218,3100,30],[19,4000,6113,7000,30],[20,10000,10176,10300,30],
  [21,5685,12000000,15000000,29],[29,1,100,250,290],[30,1,5,30,290],
  [31,0,6226,1500000,150],[32,0,12,100,150],[33,0,3113,10000,150]
];
const meanOnly = code => (code >= 8 && code <= 17) || code === 32 || code === 33;
const groupCountCode = code => code <= 2 ? 50 : code === 3 || code === 32 ? 53 :
  [4,5,6].includes(code) ? 51 : code === 7 ? 57 : code <= 17 ? 59 :
  code <= 20 ? 55 : code === 21 ? 56 : code <= 30 ? 52 : 54;

test('real C++ encoder preserves all 26 metrics and statistics in 165 bytes', () => {
  const bytes = encode(metrics);
  assert.equal(bytes.length, 165);
  const decoded = decode(bytes);
  assert.equal(decoded.data.version, 7);
  assert.equal(decoded.data.firmware_version, 13);
  assert.equal(decoded.data.window_seconds, 300);
  assert.equal(decoded.data.measurements.length, 26);
  assert.deepEqual(decoded.data.sound_events, []);
  // Compare every field against the proven legacy decoder, one metric at a time.
  const expected = metrics.map(([code,min,mean,max,count]) => {
    const records = meanOnly(code) ? record(code,1,mean) :
      [...record(code,0,min),...record(code,1,mean),...record(code,2,max)];
    return decode([6,13,0,1,44,...records,...record(groupCountCode(code),3,count)]).data.window_statistics[0];
  });
  assert.deepEqual(decoded.data.window_statistics, expected);
});

test('handles each sensor separately, absent metrics, and all sensor subsets', () => {
  for (let seed = 1; seed < 64; ++seed) {
    const subset = metrics.filter((_, i) => ((seed * (i+7)) % 11) < 5);
    const result = decode(encode(subset));
    assert.equal(result.data.measurements.length, subset.length);
  }
  for (const metric of metrics) assert.equal(decode(encode([metric])).data.measurements.length, 1);
});

test('wide bitmap retains int32 values and scale without truncation', () => {
  const cases = [[1,-40000,-33000,40000,1],[4,65535,70000,100000,1],
    [21,0,17000000,2147483647,1],[31,0,17000000,20000000,1],
    [7,-2147483648,-100,2147483647,1]];
  for (const metric of cases) {
    const bytes = encode([metric]);
    const bit = 1 << ((metric[0]-1) % 8);
    assert.ok(bytes[11+((metric[0]-1) >> 3)] & bit);
    const scale = metric[0] === 1 || metric[0] === 7 || metric[0] === 31 ? 0.1 : 1;
    const stats = decode(bytes).data.window_statistics[0];
    assert.equal(stats.mean_value, Math.round(metric[2]*scale*1000)/1000);
    assert.equal(stats.min_value, Math.round(metric[1]*scale*1000)/1000);
    assert.equal(stats.max_value, Math.round(metric[3]*scale*1000)/1000);
  }
});

test('encodes sample counts above uint16 and rejects unrepresentable input', () => {
  assert.equal(decode(encode([[7,-500,-300,-100,100000]])).data.window_statistics[0].sample_count, 100000);
  for (const args of [[[],300],[[[1,0,1,2,1]],0],[[[1,0,1,2,0]],300],
    [[[1,0,1,2,16777216]],300],[[[22,0,1,2,1]],300],[[[1,2,1,3,1]],300],
    [metrics,300,164]]) assert.deepEqual(encode(...args), []);
});

test('full sensor summary leaves room for 19 compact audio classes', () => {
  const bytes = encode(metrics);
  for (let c = 0; c < 19; ++c) bytes.push(c, 2, 88);
  assert.equal(bytes.length, 222);
  assert.equal(decode(bytes).data.sound_events.length, 19);
  assert.deepEqual(decode(bytes).data.sound_events[0], {class_id:0,class:'dog',count:2,max_score:0.88});
});

test('rejects truncation, unsupported bits, inconsistent bitmaps and malformed audio', () => {
  const bytes = encode(metrics);
  for (let length = 0; length < bytes.length; ++length) assert.ok(decode(bytes.slice(0,length)).errors, `length ${length}`);
  const mutations = [
    b => { b[10] |= 128; }, b => { b[16] |= 128; },
    b => { b.push(0); }, b => { b.push(50,1,90); }, b => { b.push(0,0,90); },
    b => { b.push(0,1,101); }, b => { b.push(0,1,90,0,1,80); },
    b => { b[2]=b[3]=b[4]=0; }, b => { b[17]=256; }, b => { b.push(...Array(60).fill(0)); }
  ];
  for (const mutate of mutations) { const b = [...bytes]; mutate(b); assert.ok(decode(b).errors); }
});
