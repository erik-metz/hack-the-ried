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
function load(path) {
  const context = { exports: {}, require: id => {
    if (id === "lucide-react") return icons;
    if (id === "@/lib/eventCalendar") return { filterCalendarEvents: () => [] };
    if (id.startsWith("@/lib/")) return {};
    if (id.startsWith("./") || id.startsWith("../components/")) return { default: () => null, __esModule: true };
    return require(id);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports.default;
}
const Social = load("../app/statistik/StatistikClient.tsx");
const Budget = load("../app/haushalt/HaushaltClient.tsx");
const Overview = load("../app/regionalatlas/page.tsx");
const summary = { municipality: "Bürstadt", unemployment_rate: 0, unemployed_count: 0,
  gp_doctors_per_10k: null, total_clubs_count: null };
function social(summaries, wasteStats = []) {
  return renderToStaticMarkup(React.createElement(Social, { summaries, wasteStats, facilities: [], events: [], now: 0 }));
}
test("missing municipal waste figures are not replaced by other municipalities or fixed examples", () => {
  const html = social([summary], [{ municipality: "Lampertheim", fraction: "total", recycling_rate_percent: 99.9, kg_per_capita: 999, weight_tons: 9999 }]);
  assert.doesNotMatch(html, /99[,.]9|9999|9\.999|68\.4|373\.9|6\.365|374 kg/);
  assert.match(html, /0\.0 %/);
  assert.doesNotMatch(html, /Unter Hessen-Schnitt/);
});
test("unknown selected municipality does not display another municipality's summary", () => {
  const html = social([{ ...summary, municipality: "Lampertheim", unemployed_count: 123456 }]);
  assert.doesNotMatch(html, /123\.456/);
});
test("missing budget year does not display a different year or municipality", () => {
  const html = renderToStaticMarkup(React.createElement(Budget, {
    budgets: [{ municipality: "Bürstadt", fiscal_year: 2025, record_type: "plan", total_revenue_eur: 123456789 }],
    spending: [], comparisons: [], elections: [], devPlans: [], permits: [],
  }));
  assert.match(html, /2024.*liegt kein gespeicherter Haushaltsplan/);
  assert.doesNotMatch(html, /123\.456\.789|51\.6|6\.420|12\.450/);
});
test("atlas overview describes available datasets without fabricated headline figures", () => {
  const html = renderToStaticMarkup(React.createElement(Overview));
  assert.doesNotMatch(html, /42\.850|85\.000|65%|22 im Kreis|30\+ Standorte/);
  assert.match(html, /Bezugszeit/);
});
