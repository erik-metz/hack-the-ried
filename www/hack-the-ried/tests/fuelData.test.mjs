import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const context = { exports: {}, Date, Set, Number, Math, Object, Array, Infinity };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/fuelData.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { decodeFuel, fuelFresh, compareFuel, formatFuelPrice } = context.exports;
const telemetry = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/telemetryData.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, telemetry);
test("shared measurement selector names fuel types and retains price units", () => {
  for (const [fuel, label] of [["e5", "Super E5"], ["e10", "Super E10"], ["diesel", "Diesel"]]) {
    const reading = { metric: `fuel_${fuel}`, unit: "€/l" };
    assert.equal(telemetry.exports.metricLabel(reading), label);
    assert.equal(telemetry.exports.unitLabel(reading.unit), "€/l");
    assert.equal(telemetry.exports.seriesKey(reading), JSON.stringify([`fuel_${fuel}`, "€/l"]));
  }
});
const station = { id: "a", name: "A", brand: "", street: "", houseNumber: "", postCode: "", place: "", latitude: 49.62, longitude: 8.46, is_open: true, e5: 1789, e10: null, diesel: 1699 };
const snapshot = { stations: [station], center: [49.62, 8.46], radius_km: 25, fetched_at: "2026-10-07T10:00:00Z" };
test("freshness uses acquisition time and excludes future timestamps", () => {
  const now = Date.parse(snapshot.fetched_at);
  assert.equal(fuelFresh(snapshot, now + 900001), false);
  assert.equal(fuelFresh(snapshot, now - 1), false);
  assert.equal(fuelFresh(snapshot, now + 300000), true);
});
test("decode rejects corrupt snapshots, duplicate IDs and boolean prices", () => {
  assert.equal(decodeFuel(snapshot).stations.length, 1);
  for (const stations of [[station, station], [{ ...station, e5: false }], [{ ...station, latitude: NaN }]]) {
    assert.throws(() => decodeFuel({ ...snapshot, stations }));
  }
});
test("sort puts missing prices last and retains input order", () => {
  const b = { ...station, id: "b", name: "B", e10: 1709 };
  const input = [station, b];
  assert.equal(compareFuel(input, "e10", "price", snapshot.center)[0].id, "b");
  assert.equal(input[0].id, "a");
  assert.equal(formatFuelPrice(1789), "1,789 €/l");
  assert.equal(formatFuelPrice(null), "Nicht verfügbar");
});
