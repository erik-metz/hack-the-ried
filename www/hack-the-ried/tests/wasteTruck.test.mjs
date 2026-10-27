import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Transpile and load railMobility first (since wasteTruckMobility imports haversineMeters and interpolatePolyline)
const railSource = fs.readFileSync(new URL("../lib/railMobility.ts", import.meta.url), "utf8");
const railContext = { exports: {}, Date, Set, Number, Math, JSON, Array };
vm.runInNewContext(
  ts.transpileModule(railSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  railContext
);
const railExports = railContext.exports;

// Transpile and load roadRoutes
const roadSource = fs.readFileSync(new URL("../lib/roadRoutes.ts", import.meta.url), "utf8");
const roadContext = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(roadSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  roadContext
);
const roadExports = roadContext.exports;

// Transpile and load wasteTruckMobility
const wasteSource = fs.readFileSync(new URL("../lib/wasteTruckMobility.ts", import.meta.url), "utf8");
const wasteContext = {
  exports: {},
  require: (id) => {
    if (id === "./railMobility") return railExports;
    if (id === "./roadRoutes") return roadExports;
    throw new Error(`Unknown require in test context: ${id}`);
  },
  Date,
  Set,
  Number,
  Math,
  JSON,
  Array,
};
vm.runInNewContext(
  ts.transpileModule(wasteSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  wasteContext
);
const wasteTruckMobility = wasteContext.exports;

test("ZAKB waste fractions cover all regular household waste streams and Schadstoffmobil", () => {
  const fractions = wasteTruckMobility.WASTE_FRACTIONS;
  assert.ok(fractions.restmuell, "Restmüll must be defined");
  assert.ok(fractions.biomuell, "Biomüll must be defined");
  assert.ok(fractions.papier, "Altpapier must be defined");
  assert.ok(fractions.gelber_sack, "Gelber Sack must be defined");
  assert.ok(fractions.umweltmobil, "Umweltmobil must be defined");

  assert.equal(fractions.restmuell.name, "Restmüll");
  assert.equal(fractions.biomuell.name, "Biomüll");
  assert.equal(fractions.papier.name, "Altpapier");
  assert.equal(fractions.gelber_sack.name, "Gelber Sack");
  assert.equal(fractions.umweltmobil.name, "Umweltmobil");
});

test("ZAKB depots include Hüttenfeld headquarters and Ried Wertstoffhöfe with valid coordinates", () => {
  const depots = wasteTruckMobility.ZAKB_DEPOTS;
  assert.ok(depots.length >= 4, "Must include at least 4 ZAKB facilities");

  const ids = depots.map((d) => d.id);
  assert.ok(ids.includes("zakb-huettenfeld"), "Energiepark Hüttenfeld must be included");
  assert.ok(ids.includes("zakb-buerstadt"), "Bürstadt Wertstoffhof must be included");
  assert.ok(ids.includes("zakb-lampertheim"), "Lampertheim Wertstoffhof must be included");
  assert.ok(ids.includes("zakb-biblis"), "Biblis Wertstoffhof must be included");

  for (const depot of depots) {
    // Check Ried coordinate bounds (lat 49.56 to 49.72, lng 8.40 to 8.60)
    assert.ok(depot.lat >= 49.56 && depot.lat <= 49.72, `Depot ${depot.id} lat ${depot.lat} out of bounds`);
    assert.ok(depot.lng >= 8.40 && depot.lng <= 8.60, `Depot ${depot.id} lng ${depot.lng} out of bounds`);
    assert.ok(depot.address && depot.address.length > 5, `Depot ${depot.id} must have an address`);
  }
});

test("ZAKB tours cover Bürstadt, Lampertheim, Hofheim (Ried), and Biblis", () => {
  const tours = wasteTruckMobility.ZAKB_TOURS;
  assert.ok(tours.length >= 8, "Must have tours for each fraction and area");

  const municipalities = new Set(tours.map((t) => t.municipality));
  assert.ok(municipalities.has("Bürstadt"), "Bürstadt must have a collection tour");
  assert.ok(municipalities.has("Lampertheim"), "Lampertheim must have a collection tour");
  assert.ok(municipalities.has("Hofheim (Ried)"), "Hofheim (Ried) must have a collection tour");
  assert.ok(municipalities.has("Biblis"), "Biblis must have a collection tour");
  assert.ok(municipalities.has("Rosengarten"), "Rosengarten must have a collection tour");
  assert.ok(municipalities.has("Nordheim"), "Nordheim must have a collection tour");
  assert.ok(municipalities.has("Groß-Rohrheim"), "Groß-Rohrheim must have a collection tour");

  for (const tour of tours) {
    // License plate must be Kreis Bergstraße (HP-)
    assert.ok(tour.licensePlate.startsWith("HP-"), `License plate ${tour.licensePlate} must start with HP-`);
    assert.ok(tour.track.length > 5, `Tour ${tour.id} track must have polyline coordinates`);
    assert.ok(tour.waypoints.length >= 3, `Tour ${tour.id} must have at least 3 collection waypoints`);
  }
});

test("calculateWasteTruckMobility generates valid live trucks within Ried bounds", () => {
  const t0 = Date.parse("2026-09-15T08:00:00Z");
  const { trucks, depots } = wasteTruckMobility.calculateWasteTruckMobility(t0);

  assert.ok(Array.isArray(trucks) && trucks.length > 0);
  assert.ok(Array.isArray(depots) && depots.length > 0);

  for (const truck of trucks) {
    // Geofence check
    assert.ok(truck.lat >= 49.56 && truck.lat <= 49.73, `Truck ${truck.id} lat ${truck.lat} outside Ried boundary`);
    assert.ok(truck.lng >= 8.35 && truck.lng <= 8.60, `Truck ${truck.id} lng ${truck.lng} outside Ried boundary`);

    // Valid statuses
    assert.ok(
      ["collecting", "bin_emptying", "transit"].includes(truck.status),
      `Invalid truck status: ${truck.status}`
    );

    // Speed checks
    if (truck.status === "bin_emptying") {
      assert.equal(truck.speedKmh, 0, "Emptying truck must be stopped (0 km/h)");
      assert.ok(truck.emptyCountdownSec !== undefined && truck.emptyCountdownSec >= 0);
      assert.ok(truck.emptyProgress !== undefined && truck.emptyProgress >= 0 && truck.emptyProgress <= 1);
    } else {
      assert.ok(truck.speedKmh > 0, "Moving truck must have positive speed");
    }

    // Fill level
    assert.ok(truck.loadPercent >= 0 && truck.loadPercent <= 100);

    // Open data transparency note
    assert.ok(truck.predictionBasis.includes("ZAKB"), "Must mention ZAKB in prediction basis");
  }
});

test("truck stops at collection waypoints and calculates emptying countdown gauge", () => {
  let foundEmptying = false;
  let foundCollecting = false;
  let foundTransit = false;

  // Step through time intervals to ensure all operational states are exercised
  for (let s = 0; s < 1200; s += 20) {
    const timeMs = Date.parse("2026-09-15T07:30:00Z") + s * 1000;
    const { trucks } = wasteTruckMobility.calculateWasteTruckMobility(timeMs);

    for (const truck of trucks) {
      if (truck.status === "bin_emptying") {
        foundEmptying = true;
        assert.ok(truck.emptyCountdownSec !== undefined && truck.emptyCountdownSec >= 0);
        assert.ok(truck.emptyProgress !== undefined && truck.emptyProgress >= 0 && truck.emptyProgress <= 1);
      }
      if (truck.status === "collecting") {
        foundCollecting = true;
      }
      if (truck.status === "transit") {
        foundTransit = true;
      }
    }
  }

  assert.ok(foundEmptying, "Must find trucks emptying bins at collection waypoints");
  assert.ok(foundCollecting, "Must find trucks actively collecting along streets");
  assert.ok(foundTransit, "Must find trucks in depot transit");
});

test("createWasteTruckMarkerContent renders beacon, badge, truck icon, and countdown gauge safely without innerHTML", () => {
  function element(tag) {
    return {
      tag,
      style: { setProperty() {} },
      children: [],
      attrs: {},
      setAttribute(key, value) { this.attrs[key] = value; },
      append(...nodes) { this.children.push(...nodes); },
      set innerHTML(_) { throw new Error("HTML parsing is forbidden for markers"); },
    };
  }
  const document = { createElement: element, createElementNS: (_, tag) => element(tag) };

  const markerSource = fs.readFileSync(new URL("../lib/mapMarker.ts", import.meta.url), "utf8");
  const markerContext = {
    exports: {},
    require: (id) => {
      if (id === "./mapData") return {};
      throw new Error(`Unknown require in marker test: ${id}`);
    },
    document,
    Math,
    String,
  };
  vm.runInNewContext(
    ts.transpileModule(markerSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    markerContext
  );
  const { createWasteTruckMarkerContent } = markerContext.exports;

  // 1. In motion / collecting
  const movingContent = createWasteTruckMarkerContent({
    fraction: "restmuell",
    fractionLabel: "Restmüll",
    binColor: "#475569",
    accentColor: "#f97316",
    licensePlate: "HP-ZK 102",
    status: "collecting",
    speedKmh: 14,
    currentStreet: "Nibelungenstraße",
    nextStreet: "Mainstraße",
    expectedTimeWindow: "07:30 – 08:30 Uhr",
    loadPercent: 42,
  });

  assert.ok(movingContent.className.includes("waste-truck-marker"));
  assert.ok(movingContent.className.includes("waste-truck-collecting"));
  // Beacon is first child
  assert.equal(movingContent.children[0].className, "truck-beacon truck-beacon-active");
  // Truck SVG is second child
  assert.equal(movingContent.children[1].tag, "svg");
  // Badge is third child
  assert.equal(movingContent.children[2].textContent, "Restmüll");
  // Sublabel is fourth child
  assert.equal(movingContent.children[3].textContent, "Nibelungenstraße");

  // 2. Stopped for bin emptying / compaction (dwell)
  const emptyingContent = createWasteTruckMarkerContent({
    fraction: "biomuell",
    fractionLabel: "Biomüll",
    binColor: "#16a34a",
    accentColor: "#22c55e",
    licensePlate: "HP-ZK 214",
    status: "bin_emptying",
    speedKmh: 0,
    currentStreet: "Kaiserstraße",
    nextStreet: "Ernst-Ludwig-Straße",
    expectedTimeWindow: "08:15 – 09:15 Uhr",
    loadPercent: 65,
    emptyCountdownSec: 28,
    emptyProgress: 0.62,
  });

  assert.ok(emptyingContent.className.includes("waste-truck-bin_emptying"));
  assert.equal(emptyingContent.children[0].className, "truck-beacon truck-beacon-rapid");
  // Gauge container is present for dwelling vehicle
  const gaugeContainer = emptyingContent.children.find((c) => c.className === "truck-gauge-container");
  assert.ok(gaugeContainer, "Must include truck-gauge-container when emptying bins");
  const gaugeText = gaugeContainer.children.find((c) => c.className === "truck-gauge-text");
  assert.equal(gaugeText.textContent, "28s");
});

// Production routes are covered by collectedData.test.mjs; local simulation utilities are legacy fixtures.

test("waste truck route tracks use high-density road polylines from OpenStreetMap/OSRM", () => {
  assert.ok(wasteTruckMobility.ROUTE_BUERSTADT.length > 200, "Bürstadt track must have >200 dense road points");
  assert.ok(wasteTruckMobility.ROUTE_LAMPERTHEIM.length > 200, "Lampertheim track must have >200 dense road points");
  assert.ok(wasteTruckMobility.ROUTE_HOFHEIM.length > 200, "Hofheim track must have >200 dense road points");
  assert.ok(wasteTruckMobility.ROUTE_BIBLIS.length > 200, "Biblis track must have >200 dense road points");
  assert.ok(wasteTruckMobility.ROUTE_UMWELTMOBIL.length > 200, "Umweltmobil track must have >200 dense road points");
});

