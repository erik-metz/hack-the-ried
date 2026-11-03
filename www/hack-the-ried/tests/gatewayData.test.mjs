import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{},Date,Number,Math,Map};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/gatewayData.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {gatewayChartRows,formatGatewayValue}=context.exports;
const point=(time,value,statistic='value')=>({time,value,quality:value===null?'missing':'valid',unit:'°C',dimensions:{statistic}});
test('hourly means use sample weights and extrema remain visible',()=>{
  const rows=gatewayChartRows([point('2026-11-03T00:00:00Z',200,'sum'),point('2026-11-03T00:00:00Z',5,'count'),point('2026-11-03T00:00:00Z',30,'min'),point('2026-11-03T00:00:00Z',50,'max')],'hour');
  assert.equal(rows[0].value,40);assert.deepEqual(Array.from(rows[0].range),[30,50]);
});
test('missing intervals interrupt charts and never become zero',()=>{
  const rows=gatewayChartRows([point('2026-11-03T00:00:00Z',40),point('2026-11-03T00:04:00Z',42)],'minute');
  assert.equal(rows.length,3);assert.equal(rows[1].value,null);
  assert.equal(gatewayChartRows([point('2026-11-03T00:00:00Z',null)],'minute')[0].value,null);
  assert.equal(formatGatewayValue(null,'boolean'),'Unbekannt');
});
test('radio distributions combine packet sums and counts rather than means',()=>{
  const rows=gatewayChartRows([point('2026-11-03T00:00:00Z',-300,'sum'),point('2026-11-03T00:00:00Z',3,'count')],'hour');
  assert.equal(rows[0].value,-100);
});
