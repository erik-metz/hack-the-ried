import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {}, Map, Set, Number, Math };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/dischargeForecasts.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { dischargeDays, DISCHARGE_STATS } = context.exports;
const rows = () => DISCHARGE_STATS.map(stat => ({entity_id:'worms', valid_at:'2026-10-06T00:00:00Z',
  dimensions:{statistic:stat,snapshot_sha256:'one'}, unit:'m3/s',quality:'valid',value:0}));
test('reported zero is retained for every ensemble statistic', () => {
  const day=dischargeDays(rows())[0];
  for (const stat of DISCHARGE_STATS) assert.equal(day[stat],0);
});
test('missing and duplicate statistics remain unavailable', () => {
  const sample=rows(); sample[0].quality='missing';sample[0].value=null;
  const day=dischargeDays([...sample,sample[1]])[0];
  assert.equal(day.control,null);assert.equal(day.mean,null);assert.equal(day.median,0);
});
test('snapshots and entities cannot be combined', () => {
  const mixed=rows();mixed[0].dimensions.snapshot_sha256='two';
  assert.equal(dischargeDays(mixed)[0].median,null);
  const other=rows().map(r=>({...r,entity_id:'other',value:7}));
  const days=dischargeDays([...rows(),...other]);
  assert.equal(days.length,2);assert.equal(days.find(d=>d.entity_id==='other').median,7);
});
test('invalid units and negative values are not shown as discharge', () => {
  const sample=rows();sample[0].unit='m';sample[1].value=-1;
  const day=dischargeDays(sample)[0];assert.equal(day.control,null);assert.equal(day.mean,null);
});
