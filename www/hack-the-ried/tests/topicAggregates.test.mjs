import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/topicAggregates.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { demographicView, estateView, stockView, statNumber, signedStat } = context.exports;
const ids = ["buerstadt", "lampertheim", "biblis", "gross-rohrheim"];
const names = ["Bürstadt", "Lampertheim", "Biblis", "Groß-Rohrheim"];
const demographic = ids.map((municipality_id, i) => ({ municipality_id, name: names[i], year: 2028,
  total_population: [100, 300, 200, 400][i], foreign_share_pct: [10, 20, 30, 40][i],
  births: 0, deaths: 1, inflow: 2, outflow: 3, net_migration: -1, schools_count: 1, kitas_count: 2,
  avg_household_size: 2, population_density: 999 }));
const municipalities = ids.map(id => ({ id, area_sqkm: 10 }));
const stocks = names.map(municipality => ({ municipality, district: "Gesamtgemeinde", reference_year: 2027,
  total_buildings: 5, residential_buildings: 4, total_dwellings: 10, vacant_dwellings: 1,
  avg_living_space_sqm: 100, age_distribution: { old: 0, recent: 4 }, building_types: { detached: 2 }, heating_energy: { gas: 50 } }));

test("demography uses population weighting and total area, excluding districts and other towns", () => {
  const result = demographicView([...demographic, { ...demographic[0], municipality_id: "hofheim", total_population: 5000 }], municipalities, "all");
  assert.equal(result.total_population, 1000);
  assert.equal(result.foreign_share_pct, 29);
  assert.equal(result.population_density, 25);
  assert.equal(result.year, 2028);
  assert.equal(result.avg_household_size, null);
  assert.equal(result.births, 0);
  assert.equal(result.net_migration, -4);
});
test("incomplete, duplicate or mixed-year populations never become a regional total", () => {
  for (const rows of [demographic.slice(1), [...demographic, demographic[0]], demographic.map((r, i) => ({ ...r, year: i ? 2028 : 2027 })), []]) {
    assert.equal(demographicView(rows, municipalities, "all").total_population, null);
  }
});
test("missing and nonfinite measurements stay unknown without masking valid independent totals", () => {
  const rows = demographic.map((r, i) => i ? r : { ...r, births: null, foreign_share_pct: NaN });
  const result = demographicView(rows, municipalities.slice(1), "all");
  assert.equal(result.total_population, 1000);
  assert.equal(result.births, null);
  assert.equal(result.foreign_share_pct, null);
  assert.equal(result.population_density, null);
  assert.equal(demographicView(demographic, municipalities, "unknown").total_population, null);
});
test("undated property summaries never produce totals, sample means or fixed purchase prices", () => {
  const result = estateView([{ municipality: "Bürstadt", total_dwellings: 100, avg_apartment_buy_sqm: 5000 }], "all");
  assert.equal(result.total_dwellings, null);
  assert.equal(result.avg_apartment_buy_sqm, null);
  assert.equal(estateView([], "unknown").avg_rent_cold_sqm, null);
});
test("same-year municipal housing counts and dwelling-weighted living space are aggregated", () => {
  const rows = stocks.map((r, i) => i ? r : { ...r, total_dwellings: 30, avg_living_space_sqm: 200 });
  const result = stockView(rows, "all");
  assert.equal(result.total_dwellings, 60);
  assert.equal(result.avg_living_space_sqm, 150);
  assert.equal(result.vacancy_rate_pct, 4 / 60 * 100);
  assert.equal(result.age_distribution.old, 0);
  assert.equal(result.reference_year, 2027);
  assert.equal(result.heating_energy.gas, undefined);
});
test("stock aggregation rejects incomplete years, duplicate municipalities and partial class counts", () => {
  for (const rows of [[], stocks.slice(1), [...stocks, stocks[0]], stocks.map((r, i) => ({ ...r, reference_year: i ? 2027 : 2026 }))]) {
    assert.equal(stockView(rows, "all").total_dwellings, null);
  }
  const result = stockView(stocks.map((r, i) => i ? r : { ...r, age_distribution: { recent: 4 } }), "all");
  assert.equal(result.age_distribution.old, null);
  assert.equal(result.total_dwellings, 40);
});
test("districts do not replace missing whole municipality data", () => {
  assert.equal(stockView(stocks.map(r => ({ ...r, district: "Ortsteil" })), "all").total_dwellings, null);
  assert.equal(stockView(stocks, "unknown").total_dwellings, null);
  assert.equal(stockView(stocks, "Bürstadt").total_dwellings, 10);
});
test("zero denominators and invalid quantities do not generate Infinity or NaN", () => {
  const result = stockView(stocks.map(r => ({ ...r, total_dwellings: 0 })), "all");
  assert.equal(result.vacancy_rate_pct, null);
  assert.equal(result.avg_living_space_sqm, null);
  assert.equal(statNumber(NaN), "–");
  assert.equal(statNumber(null), "–");
  assert.equal(statNumber(0), "0");
  assert.equal(signedStat(-4), "-4");
  assert.equal(signedStat(4), "+4");
});
