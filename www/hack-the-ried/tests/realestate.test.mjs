import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Load realestateData in isolated VM
const reSource = fs.readFileSync(new URL("../lib/realestateData.ts", import.meta.url), "utf8");
const reContext = {
  exports: {},
  require: (id) => {
    if (id === "./collectedBackend") return { collectedFetch: globalThis.fetch };
    if (id === "@/env") return { env: { BACKEND_API_URL: "http://localhost:8000" } };
    throw new Error(`Unknown require in test context: ${id}`);
  },
  Date,
  Set,
  Number,
  JSON,
  Math,
  Array,
  Object,
  Intl,
  fetch: globalThis.fetch,
  AbortSignal: globalThis.AbortSignal,
  URL: globalThis.URL,
};

vm.runInNewContext(
  ts.transpileModule(reSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  reContext
);

const realestate = reContext.exports;

test("BASELINE_REALESTATE_SUMMARIES covers all key Ried municipalities", () => {
  const summaries = realestate.BASELINE_REALESTATE_SUMMARIES;
  assert.ok(summaries.length >= 6, "Expected at least 6 Ried municipalities in summary");

  const towns = summaries.map((s) => s.municipality);
  assert.ok(towns.includes("Lampertheim"), "Must include Lampertheim");
  assert.ok(towns.includes("Bürstadt"), "Must include Bürstadt");
  assert.ok(towns.includes("Biblis"), "Must include Biblis");
  assert.ok(towns.includes("Groß-Rohrheim"), "Must include Groß-Rohrheim");
  assert.ok(towns.includes("Einhausen"), "Must include Einhausen");
  assert.ok(towns.includes("Lorsch"), "Must include Lorsch");

  for (const s of summaries) {
    assert.ok(s.total_dwellings > 1000, `${s.municipality} has realistic dwelling count`);
    assert.ok(s.vacancy_rate_pct >= 1.0 && s.vacancy_rate_pct <= 6.0, `${s.municipality} vacancy rate realistic`);
    assert.ok(s.avg_land_value_residential >= 250, `${s.municipality} land value realistic`);
    assert.ok(s.avg_rent_cold_sqm >= 7.0 && s.avg_rent_cold_sqm <= 15.0, `${s.municipality} rent realistic`);
  }
});

test("BASELINE_HOUSING_STOCK includes age distribution and heating breakdown", () => {
  const stock = realestate.BASELINE_HOUSING_STOCK;
  assert.ok(stock.length >= 6, "Expected housing stock for all Ried towns");

  for (const h of stock) {
    assert.ok(h.age_distribution, `${h.municipality} must have age distribution`);
    assert.ok(h.heating_energy, `${h.municipality} must have heating energy breakdown`);
    assert.ok(h.heating_energy.gas > 0, `${h.municipality} gas heating present`);
    assert.ok(h.heating_energy.oil > 0, `${h.municipality} oil heating present`);
    assert.ok(h.heating_energy.heat_pump > 0, `${h.municipality} heat pump present`);
  }
});

test("BASELINE_BORIS_ZONES has valid polygons and pricing", () => {
  const zones = realestate.BASELINE_BORIS_ZONES;
  assert.ok(zones.length >= 6, "Expected at least 6 BORIS zones");

  for (const z of zones) {
    assert.ok(z.land_value_eur_sqm > 0, "Land value must be positive");
    assert.ok(z.center_lat >= 49.5 && z.center_lat <= 49.8, "Latitude within Ried geofence");
    assert.ok(z.center_lng >= 8.3 && z.center_lng <= 8.7, "Longitude within Ried geofence");
    assert.ok(z.geometry?.coordinates?.[0]?.length >= 3, "Valid polygon coordinates");
  }
});

test("BASELINE_DEVELOPMENT_PLANS has valid coordinates and legally sound status", () => {
  const plans = realestate.BASELINE_DEVELOPMENT_PLANS;
  assert.ok(plans.length >= 6, "Expected at least 6 development plans");

  const validStatuses = ["rechtskraeftig", "in_aufstellung", "im_verfahren"];
  for (const p of plans) {
    assert.ok(validStatuses.includes(p.status), `Valid status for ${p.plan_name}: ${p.status}`);
    assert.ok(p.center_lat >= 49.5 && p.center_lat <= 49.8, "Latitude within Ried geofence");
    assert.ok(p.center_lng >= 8.3 && p.center_lng <= 8.7, "Longitude within Ried geofence");
    assert.ok(p.area_hectares > 0, "Hectares must be positive");
  }
});

test("Formatting and color helpers produce expected outputs", () => {
  const euroM2 = realestate.formatEuro(480, true);
  assert.match(euroM2, /480.*€\/m²/);

  const euroTotal = realestate.formatEuro(285000);
  assert.match(euroTotal, /285\.000.*€/);

  // BORIS Colors
  assert.equal(realestate.getBorisZoneColor(15, "Landwirtschaft"), "#84cc16");
  assert.equal(realestate.getBorisZoneColor(180, "Gewerbefläche"), "#8b5cf6");
  assert.equal(realestate.getBorisZoneColor(600, "Wohnbaufläche"), "#ef4444");
  assert.equal(realestate.getBorisZoneColor(480, "Wohnbaufläche"), "#f97316");
  assert.equal(realestate.getBorisZoneColor(380, "Wohnbaufläche"), "#f59e0b");
  assert.equal(realestate.getBorisZoneColor(280, "Wohnbaufläche"), "#06b6d4");

  // Land use colors
  assert.equal(realestate.getLandUseColor("forest"), "#15803d");
  assert.equal(realestate.getLandUseColor("agriculture"), "#84cc16");
  assert.equal(realestate.getLandUseColor("water"), "#0284c7");
  assert.equal(realestate.getLandUseColor("settlement"), "#f59e0b");
  assert.equal(realestate.getLandUseColor("industrial"), "#7c3aed");
  assert.equal(realestate.getLandUseColor("traffic"), "#64748b");
});

test("Published BORIS section renders original zero values and historical reference date", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { renderToStaticMarkup } = require("react-dom/server");
  const source = fs.readFileSync(new URL("../app/components/BorisPublishedSection.tsx", import.meta.url), "utf8");
  const context = { exports: {}, require, Set };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  const Component = context.exports.default;
  const unavailable = renderToStaticMarkup(Component({ zones: null }));
  assert.match(unavailable, /Noch keine gespeicherten/);
  const rendered = renderToStaticMarkup(Component({ zones: [{ id: "official-1", municipality: "Biblis", district: null,
    zone_code: "123", stichtag: "2024-01-01", land_value_eur_sqm: 0, zone_type: "LW", development_status: "LF" }] }));
  assert.match(rendered, /Historischer Stichtag: 2024-01-01/);
  assert.match(rendered, /keine aktuellen Immobilienverkaufspreise/);
  assert.match(rendered, />0<\/td>/);
  assert.match(rendered, /<td[^>]*>LW<\/td>/);
});
