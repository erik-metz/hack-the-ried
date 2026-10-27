import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL('../app/components/AdoptedBudgetSection.tsx',import.meta.url),'utf8');
async function render(budget,review) {
 const context={exports:{},Date,require(id){
  if(id==='@/lib/collectedBackend')return{readCollected:async(dataset)=>{const data=dataset.includes('budget-review')?review:budget;if(!data)throw Error('Unavailable');return data;}};
  return require(id);
 }};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 return renderToStaticMarkup(await context.exports.default());
}
const budget={municipality:'Biblis',fiscal_year:2026,adopted_at:'2026-02-11T00:00:00Z',source_url:'https://example.org/plan.pdf',source_page:4,quality:'reconciled',total_revenue_eur:1234,total_expense_eur:1000,net_result_eur:234};
test('only reconciled budget totals are rendered, with document provenance',async()=>{
 const html=await render(budget,budget);
 assert.match(html,/1\.234/);
 assert.match(html,/plan\.pdf#page=4/);
 assert.match(html,/Planwerte, keine laufenden/);
});
test('a newer failed review suppresses cached old budget totals',async()=>{
 const html=await render(budget,{...budget,quality:'needs_review'});
 assert.match(html,/rechnerisch nicht überein/);
 assert.doesNotMatch(html,/1\.234/);
});
test('missing publication does not invent a source discrepancy or zero budget',async()=>{
 assert.match(await render(null,null),/kein gespeicherter Haushaltsplan/);
 const html=await render(null,budget);
 assert.match(html,/Kennzahlen sind aktuell nicht verfügbar/);
 assert.doesNotMatch(html,/rechnerisch nicht überein/);
});
