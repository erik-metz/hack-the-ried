import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// 1. Load environmentData
const envSource = fs.readFileSync(new URL("../lib/environmentData.ts", import.meta.url), "utf8");
const envContext = { exports: {}, Date, Set, Number, JSON, Math };
vm.runInNewContext(
  ts.transpileModule(envSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  envContext
);
const envData = envContext.exports;

// 2. Load mapData
const mapSource = fs.readFileSync(new URL("../lib/mapData.ts", import.meta.url), "utf8");
const mapContext = { exports: {}, Date, Set, Number, JSON, Math, Array, Object };
vm.runInNewContext(
  ts.transpileModule(mapSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  mapContext
);
const mapData = mapContext.exports;

test("DEFAULT_PROTECTED_AREAS contains key Ried nature reserves", () => {
  const areas = envData.DEFAULT_PROTECTED_AREAS;
  assert.ok(areas.length >= 4, "Expected at least 4 protected areas");

  const names = areas.map((a) => a.name.toLowerCase()).join(" ");
  assert.ok(names.includes("altrhein"), "Should contain Lampertheimer Altrhein");
  assert.ok(names.includes("biedensand"), "Should contain Biedensand");
  assert.ok(names.includes("bürstädter wald"), "Should contain Bürstädter Wald");
  assert.ok(names.includes("wasserschutzgebiet"), "Should contain Wasserschutzgebiet");

  for (const a of areas) {
    assert.ok(a.area_hectares > 0, `${a.name} should have positive area`);
    assert.ok(a.geojson && a.geojson.coordinates, `${a.name} should have valid GeoJSON`);
  }
});

test("DEFAULT_AGRICULTURE_STATS covers asparagus, vegetables and grains for Bürstadt & Lampertheim", () => {
  const stats = envData.DEFAULT_AGRICULTURE_STATS;
  assert.ok(stats.length >= 8, "Expected rich agricultural crop distribution");

  const bstStats = stats.filter((s) => s.municipality === "Bürstadt");
  const laStats = stats.filter((s) => s.municipality === "Lampertheim");

  assert.ok(bstStats.length >= 4, "Bürstadt should have multiple crop profiles");
  assert.ok(laStats.length >= 4, "Lampertheim should have multiple crop profiles");

  const bstCrops = bstStats.map((s) => s.crop_name.toLowerCase()).join(" ");
  assert.ok(bstCrops.includes("spargel"), "Bürstadt must have Spargel");
  assert.ok(bstCrops.includes("gemüse"), "Bürstadt must have Freilandgemüse");

  const laCrops = laStats.map((s) => s.crop_name.toLowerCase()).join(" ");
  assert.ok(laCrops.includes("spargel"), "Lampertheim must have Spargel");
  assert.ok(laCrops.includes("gemüse"), "Lampertheim must have Freilandgemüse");
});

test("DEFAULT_FLOOD_GAUGES includes Rhine Worms and Weschnitz gauges with valid alarm stages", () => {
  const gauges = envData.DEFAULT_FLOOD_GAUGES;
  assert.ok(gauges.length >= 2, "Expected at least 2 gauges");

  const worms = gauges.find((g) => g.id === "pegel-rhein-worms");
  assert.ok(worms, "Must include Worms Rhine gauge");
  assert.equal(worms.water_body, "Rhein");
  assert.ok(worms.alarm_level_1_m > 0);
  assert.ok(worms.alarm_level_2_m > worms.alarm_level_1_m);
  assert.ok(worms.alarm_level_3_m > worms.alarm_level_2_m);

  const weschnitz = gauges.find((g) => g.id === "pegel-weschnitz-lorsch");
  assert.ok(weschnitz, "Must include Weschnitz gauge");
  assert.equal(weschnitz.water_body, "Weschnitz");
});

test("categoriesFor categorizes groundwater and river gauge sensors under water", () => {
  const gwSensor = {
    id: "gw-bst-boxheimerhof",
    friendly_name: "Grundwassermessstelle Boxheimerhof",
    latitude: 49.6295,
    longitude: 8.4810,
    readings: [{ metric: "groundwater_depth_m", value: 2.15, unit: "m", timestamp: "2026-09-17T12:00:00Z" }],
  };
  const categories = mapData.categoriesFor(gwSensor);
  assert.ok(categories.includes("water"), "Groundwater sensor must be categorized under water");

  const pegelSensor = {
    id: "pegel-rhein-worms",
    friendly_name: "Rheinpegel Worms",
    latitude: 49.6315,
    longitude: 8.3755,
    readings: [{ metric: "river_gauge_m", value: 2.78, unit: "m", timestamp: "2026-09-17T12:00:00Z" }],
  };
  const pegelCategories = mapData.categoriesFor(pegelSensor);
  assert.ok(pegelCategories.includes("water"), "River gauge must be categorized under water");
});

test("valueLabel formats groundwater depth and nitrate metrics correctly", () => {
  const depthReading = { metric: "groundwater_depth_m", value: 2.15, unit: "m", timestamp: "2026-09-17T12:00:00Z" };
  assert.equal(mapData.valueLabel(depthReading), "2,2 m Flurabstand");

  const nitrateReading = { metric: "groundwater_nitrate_mg_l", value: 28.4, unit: "mg/l", timestamp: "2026-09-17T12:00:00Z" };
  assert.equal(mapData.valueLabel(nitrateReading), "28,4 mg/l Nitrat");

  const riverReading = { metric: "river_gauge_m", value: 2.78, unit: "m", timestamp: "2026-09-17T12:00:00Z" };
  assert.equal(mapData.valueLabel(riverReading), "2,8 m Pegel");
});
