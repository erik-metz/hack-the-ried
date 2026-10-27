import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {}, Map, Set, Number, Math };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/pollenForecasts.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { pollenDays } = context.exports;
function rows() {
  return Array.from({length:24}, (_,i) => ({ valid_at: new Date(Date.UTC(2026,9,6,i)).toISOString(),
    dimensions: {species:'grass'}, quality:'valid', value:0 }));
}
test('a complete reported zero day remains zero', () => {
  assert.equal(pollenDays(rows())[0].peak,0);
});
test('missing, partial and duplicated hours are not a daily peak', () => {
  const missing = rows(); missing[0].value=null; missing[0].quality='missing';
  assert.equal(pollenDays(missing)[0].peak,null);
  assert.equal(pollenDays(missing)[0].hours,23);
  assert.equal(pollenDays(rows().slice(1))[0].peak,null);
  const duplicate=rows(); duplicate[0]=duplicate[1];
  assert.equal(pollenDays(duplicate)[0].peak,null);
});
test('species are never mixed for a peak', () => {
  const grass=rows(); grass[0].value=7;
  const birch=rows().map(r=>({...r, dimensions:{species:'birch'},value:2}));
  const result=pollenDays([...grass,...birch]);
  assert.equal(result.find(r=>r.species==='grass').peak,7);
  assert.equal(result.find(r=>r.species==='birch').peak,2);
});
