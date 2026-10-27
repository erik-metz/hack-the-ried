import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const icons = await import("lucide-react");
function load(path, dependencies = {}) {
  const context = { exports: {}, require: id => dependencies[id] ?? require(id) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const aggregates = load("../lib/topicAggregates.ts");
const estateData = load("../lib/realestateData.ts", { "./collectedBackend": {}, "@/env": { env: {} } });
const dependencies = { "lucide-react": icons, "@/lib/topicAggregates": aggregates, "@/lib/urlState": {}, "@/lib/realestateData": estateData };
const Demographics = load("../app/demografie/DemographicsClient.tsx", dependencies).default;
const Estate = load("../app/bauen-wohnen/BauenWohnenClient.tsx", dependencies).default;

test("empty demographic dashboard renders missing indicators without synthetic zero or age percentages", () => {
  const html = renderToStaticMarkup(React.createElement(Demographics, { summaries: [], municipalities: [], ageStructure: {}, commuters: [], facilities: [] }));
  assert.match(html, /nicht verfügbar/);
  assert.doesNotMatch(html, /NaN|Infinity|17,8%|60,2%|22,0%|2024\/2025/);
  assert.match(html, /0 erfasste Beziehungen/);
});
test("empty housing dashboard renders missing indicators without made-up region prices or counts", () => {
  const html = renderToStaticMarkup(React.createElement(Estate, { summaries: [], housingStock: [], borisZones: [], permits: [], benchmarks: [], developmentPlans: [] }));
  assert.match(html, /nicht verfügbar/);
  assert.doesNotMatch(html, /NaN|Infinity|100,8|3\.100|42–44|3,4 %/);
  assert.match(html, /style="width:0%/);
});
test("population dashboard displays negative migration with the correct sign and actual year", () => {
  const ids = ["buerstadt", "lampertheim", "biblis", "gross-rohrheim"];
  const html = renderToStaticMarkup(React.createElement(Demographics, {
    summaries: ids.map(municipality_id => ({ municipality_id, year: 2031, total_population: 100, foreign_share_pct: 10,
      schools_count: 1, kitas_count: 1, births: 0, deaths: 0, inflow: 0, outflow: 1, net_migration: -1 })),
    municipalities: ids.map(id => ({ id, area_sqkm: 10 })), ageStructure: {}, commuters: [], facilities: [],
  }));
  assert.match(html, /2031/);
  assert.match(html, />-4</);
  assert.doesNotMatch(html, /\+-4/);
});
