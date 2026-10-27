import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/streetClosures.ts", import.meta.url), "utf8");
const context = { exports: {}, Date, Set, Number, JSON, Math };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  context
);
const model = context.exports;

// Test reference time: 2026-09-16T12:00:00Z
const nowMs = Date.parse("2026-09-16T12:00:00Z");

test("covers all required Ried areas and towns", () => {
  const closures = model.VERIFIED_RIED_STREET_CLOSURES;
  assert.ok(closures.length >= 8, `Expected at least 8 closures, got ${closures.length}`);

  const municipalities = new Set(closures.map((c) => c.municipality.toLowerCase()));
  assert.ok(municipalities.has("lampertheim"));
  assert.ok(municipalities.has("bürstadt"));
  assert.ok(municipalities.has("biblis"));
  assert.ok(municipalities.has("groß-rohrheim"));

  // Check specific required districts & locations
  const allLocations = closures.map((c) => `${c.municipality} ${c.district} ${c.streetName}`.toLowerCase()).join(" ");
  assert.ok(allLocations.includes("rosengarten"), "Should include Rosengarten");
  assert.ok(allLocations.includes("wehrzollhaus"), "Should include Wehrzollhaus");
  assert.ok(allLocations.includes("hofheim"), "Should include Hofheim");
  assert.ok(allLocations.includes("nordheim"), "Should include Nordheim");
  assert.ok(allLocations.includes("wattenheim"), "Should include Wattenheim");
  assert.ok(allLocations.includes("biblis"), "Should include Biblis");
  assert.ok(allLocations.includes("groß-rohrheim"), "Should include Groß-Rohrheim");
  assert.ok(allLocations.includes("bobstadt"), "Should include Bobstadt");
  assert.ok(allLocations.includes("bürstadt"), "Should include Bürstadt");
  assert.ok(allLocations.includes("lampertheim"), "Should include Lampertheim");
});

test("accurately determines active vs upcoming scheduled closures", () => {
  const inDenGaerten = model.VERIFIED_RIED_STREET_CLOSURES.find(
    (c) => c.id === "closure-lampertheim-in-den-gaerten"
  );
  assert.ok(inDenGaerten);
  assert.equal(model.isClosureActive(inDenGaerten, nowMs), true);

  const huettenfeldScheduled = model.VERIFIED_RIED_STREET_CLOSURES.find(
    (c) => c.id === "closure-huettenfeld-kreisel-l3110"
  );
  assert.ok(huettenfeldScheduled);
  // Starts on Sept 21, so on Sept 16 it is NOT yet active
  assert.equal(model.isClosureActive(huettenfeldScheduled, nowMs), false);
});

test("filters closures by status correctly", () => {
  const closures = model.VERIFIED_RIED_STREET_CLOSURES;
  const activeOnly = model.filterClosures(closures, { status: "active" }, nowMs);
  const scheduledOnly = model.filterClosures(closures, { status: "scheduled" }, nowMs);
  const all = model.filterClosures(closures, { status: "all" }, nowMs);

  assert.ok(activeOnly.length > 0);
  assert.ok(scheduledOnly.length > 0);
  assert.equal(activeOnly.length + scheduledOnly.length, all.length);

  for (const c of activeOnly) {
    assert.equal(model.isClosureActive(c, nowMs), true);
  }
  for (const c of scheduledOnly) {
    assert.equal(model.isClosureActive(c, nowMs), false);
  }
});

test("filters closures by municipality and search term", () => {
  const closures = model.VERIFIED_RIED_STREET_CLOSURES;
  const lampertheimOnly = model.filterClosures(closures, { municipality: "Lampertheim" }, nowMs);
  assert.ok(lampertheimOnly.length >= 3);
  for (const c of lampertheimOnly) {
    assert.equal(c.municipality, "Lampertheim");
  }

  const buerstadtOnly = model.filterClosures(closures, { municipality: "Bürstadt" }, nowMs);
  assert.ok(buerstadtOnly.length >= 2);

  const searchResults = model.filterClosures(closures, { search: "Hospitalstraße" }, nowMs);
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].streetName, "Hospitalstraße");
});

test("closure colors reflect severity and status", () => {
  const inDenGaerten = model.VERIFIED_RIED_STREET_CLOSURES.find(
    (c) => c.id === "closure-lampertheim-in-den-gaerten"
  );
  assert.equal(model.getClosureColor(inDenGaerten, nowMs), "#ef4444"); // Full closure red

  const rosengarten = model.VERIFIED_RIED_STREET_CLOSURES.find(
    (c) => c.id === "closure-rosengarten-wehrzollhaus-b47"
  );
  assert.equal(model.getClosureColor(rosengarten, nowMs), "#f97316"); // Partial closure orange

  const scheduled = model.VERIFIED_RIED_STREET_CLOSURES.find(
    (c) => c.id === "closure-huettenfeld-kreisel-l3110"
  );
  assert.equal(model.getClosureColor(scheduled, nowMs), "#f59e0b"); // Scheduled amber
});

test("all closures lie within the Ried coordinate bounding box", () => {
  const closures = model.VERIFIED_RIED_STREET_CLOSURES;
  for (const c of closures) {
    const [lat, lon] = c.coordinates;
    assert.ok(lat >= 49.54 && lat <= 49.75, `Lat ${lat} of ${c.id} out of bounds`);
    assert.ok(lon >= 8.33 && lon <= 8.60, `Lon ${lon} of ${c.id} out of bounds`);

    if (c.segmentGeometry) {
      for (const [sLat, sLon] of c.segmentGeometry) {
        assert.ok(sLat >= 49.54 && sLat <= 49.75);
        assert.ok(sLon >= 8.33 && sLon <= 8.60);
      }
    }
  }
});

test("formatClosureDateRange produces localized date strings", () => {
  const range = model.formatClosureDateRange("2026-09-16T06:00:00Z", "2026-10-23T18:00:00Z");
  assert.ok(range.includes("16.09.2026"));
  assert.ok(range.includes("23.10.2026"));
});
