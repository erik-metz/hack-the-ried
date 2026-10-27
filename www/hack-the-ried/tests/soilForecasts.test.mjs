import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {}, Map, Set, Number };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/soilForecasts.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { soilDays } = context.exports;
function rows() {
  return Array.from({ length: 24 }, (_, i) => {
    const start = new Date(Date.UTC(2026, 9, 6, i));
    return { metric: 'reference_evapotranspiration', value: .2, quality: 'valid', dimensions: {},
      period_start: start.toISOString(), valid_at: new Date(+start + 3600_000).toISOString() };
  });
}
test('daily totals use interval start and include the midnight ending interval', () => {
  const result = soilDays(rows());
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-10-06');
  assert.ok(Math.abs(result[0].et0 - 4.8) < 1e-10);
});
test('missing, partial and duplicate hours never become a daily total', () => {
  assert.equal(soilDays(rows().slice(1))[0].et0, null);
  const missing = rows(); missing[0].value = null; missing[0].quality = 'missing';
  assert.equal(soilDays(missing)[0].et0, null);
  const duplicate = rows(); duplicate[0] = duplicate[1];
  assert.equal(soilDays(duplicate)[0].et0, null);
});
