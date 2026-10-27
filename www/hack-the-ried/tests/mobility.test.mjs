import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/railMobility.ts", import.meta.url), "utf8");
const context = { exports: {}, Date, Set, Number, Math, JSON, Array };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  context
);
const mobility = context.exports;

test("only active operated Bahnübergänge are included, decommissioned ones excluded", () => {
  const crossings = mobility.ACTIVE_LEVEL_CROSSINGS;
  assert.equal(crossings.length, 4, "Must contain exactly the 4 active Bahnübergänge");

  const ids = crossings.map((c) => c.id);
  assert.ok(ids.includes("bu-buerstadt-mainstr"), "Mainstraße must be included");
  assert.ok(ids.includes("bu-buerstadt-waldgarten"), "Waldgartenstraße must be included");
  assert.ok(ids.includes("bu-biblis-kirchstr"), "Kirchstraße must be included");
  assert.ok(ids.includes("bu-hofheim-bibliser-weg"), "Bibliser Weg must be included");

  // Decommissioned / closed ones must NOT be present
  assert.ok(!ids.includes("bu-bobstadt"), "Bobstadt BÜ 26 (removed) must not be included");
  assert.ok(!ids.includes("bu-biblis-pfaffenaue"), "Pfaffenaue (closed) must not be included");
  assert.ok(!ids.includes("bu-biblis-kreuz"), "Beim Kreuz (removed) must not be included");
  assert.ok(!ids.includes("bu-lampertheim"), "Lampertheim grade-separated crossings must not be included");
});

test("all level crossings have valid coordinates within the Ried area", () => {
  for (const c of mobility.ACTIVE_LEVEL_CROSSINGS) {
    assert.ok(c.lat >= 49.58 && c.lat <= 49.72, `Crossing ${c.id} lat ${c.lat} out of Ried range`);
    assert.ok(c.lng >= 8.39 && c.lng <= 8.52, `Crossing ${c.id} lng ${c.lng} out of Ried range`);
    assert.ok(c.dailyClosureCountAvg > 0, "dailyClosureCountAvg must be positive");
    assert.ok(c.avgClosureDurationSec > 0, "avgClosureDurationSec must be positive");
  }
});

test("all stations have valid EVA numbers and coordinates", () => {
  const stations = mobility.RIED_STATIONS;
  assert.ok(stations.length >= 5);

  const evaMap = Object.fromEntries(stations.map((s) => [s.id, s.evaNumber]));
  assert.equal(evaMap["biblis"], "8000072");
  assert.equal(evaMap["bobstadt"], "8001034");
  assert.equal(evaMap["lampertheim"], "8003666");
  assert.equal(evaMap["hofheim"], "8002900");
});

test("calculateRiedMobility generates valid trains and respects Ried geofence", () => {
  const t0 = Date.parse("2026-09-15T08:00:00Z");
  const { trains, crossings } = mobility.calculateRiedMobility(t0);

  assert.ok(crossings.length === 4);
  assert.ok(Array.isArray(trains));

  for (const train of trains) {
    // Check geofence
    assert.ok(train.lat >= 49.56 && train.lat <= 49.74, `Train ${train.id} lat ${train.lat} outside Ried boundary`);
    assert.ok(train.lng >= 8.38 && train.lng <= 8.55, `Train ${train.id} lng ${train.lng} outside Ried boundary`);

    if (train.status === "stopped") {
      assert.equal(train.speedKmh, 0, "Stopped train must have 0 speed");
      assert.ok(train.currentStationName, "Stopped train must specify currentStationName");
      assert.ok(train.dwellTimeRemainingSec !== undefined && train.dwellTimeRemainingSec >= 0);
      assert.ok(train.dwellProgress !== undefined && train.dwellProgress >= 0 && train.dwellProgress <= 1);
    } else {
      assert.equal(train.status, "moving");
      assert.ok(train.speedKmh > 0, "Moving train must have positive speed");
    }
  }
});

test("station dwell changes status to stopped and computes countdown gauge correctly", () => {
  // Cycle through 100 intervals across 30 minutes to verify transition between moving and stopped
  let foundStopped = false;
  let foundMoving = false;
  let foundGaugeProgress = false;

  for (let m = 0; m < 30; m++) {
    const timeMs = Date.parse("2026-09-15T08:00:00Z") + m * 60 * 1000 + 15 * 1000;
    const { trains } = mobility.calculateRiedMobility(timeMs);
    for (const train of trains) {
      if (train.status === "stopped") {
        foundStopped = true;
        if (train.dwellProgress !== undefined && train.dwellProgress > 0 && train.dwellProgress <= 1) {
          foundGaugeProgress = true;
        }
      }
      if (train.status === "moving") {
        foundMoving = true;
      }
    }
  }

  assert.ok(foundStopped, "Must find trains dwelling at stations");
  assert.ok(foundMoving, "Must find trains moving between stations");
  assert.ok(foundGaugeProgress, "Departure gauge progress must be computed for dwelling trains");
});

test("level crossings transition to closing_soon or closed when train is nearby", () => {
  let foundClosedOrClosing = false;
  // Sample across 30 minutes
  for (let s = 0; s < 1800; s += 15) {
    const timeMs = Date.parse("2026-09-15T08:00:00Z") + s * 1000;
    const { crossings } = mobility.calculateRiedMobility(timeMs);
    for (const c of crossings) {
      if (c.status === "closed" || c.status === "closing_soon") {
        foundClosedOrClosing = true;
        assert.ok(c.nextTrainLine, "Must report next train line when closing/closed");
        break;
      }
    }
    if (foundClosedOrClosing) break;
  }

  assert.ok(foundClosedOrClosing, "Level crossings must transition to closing or closed during train passages");
});

test("non-stopping ICE, TGV, IC and Cargo trains traverse corridors without station stops and trigger Bahnübergänge", () => {
  let foundIce = false;
  let foundTgv = false;
  let foundIc = false;
  let foundRiedCargo = false;
  let foundNibCargo = false;
  let iceTriggeredBiblis = false;
  let nibCargoTriggeredCrossing = false;

  // Scan through a 60-minute window
  for (let s = 0; s < 3600; s += 15) {
    const timeMs = Date.parse("2026-09-15T08:00:00Z") + s * 1000;
    const { trains, crossings } = mobility.calculateRiedMobility(timeMs);

    for (const t of trains) {
      if (t.trainType === "ice") {
        foundIce = true;
        assert.equal(t.status, "moving", "Long-distance train must never stop at local Ried stations");
        assert.equal(t.currentStationName, undefined, "Express train must not dwell at any station");
        assert.ok(t.speedKmh >= 160, "Express train must travel at high speed >= 160 km/h");
        if (t.line.includes("TGV")) foundTgv = true;
        if (t.line.includes("IC") || t.line.includes("EC")) foundIc = true;
      }
      if (t.trainType === "cargo") {
        assert.equal(t.status, "moving", "Cargo train must never stop at passenger stations");
        assert.equal(t.currentStationName, undefined);
        if (t.corridor === "Riedbahn") foundRiedCargo = true;
        if (t.corridor === "Nibelungenbahn") foundNibCargo = true;
      }
    }

    const biblisCrossing = crossings.find((c) => c.id === "bu-biblis-kirchstr");
    if (biblisCrossing && (biblisCrossing.status === "closed" || biblisCrossing.status === "closing_soon")) {
      if (biblisCrossing.nextTrainLine?.includes("ICE")) {
        iceTriggeredBiblis = true;
      }
    }

    const buerstadtMainCrossing = crossings.find((c) => c.id === "bu-buerstadt-mainstr");
    if (buerstadtMainCrossing && (buerstadtMainCrossing.status === "closed" || buerstadtMainCrossing.status === "closing_soon")) {
      if (buerstadtMainCrossing.nextTrainLine?.includes("Cargo")) {
        nibCargoTriggeredCrossing = true;
      }
    }
  }

  assert.ok(foundIce, "Simulation must contain active ICE trains");
  assert.ok(foundTgv, "Simulation must contain international TGV trains");
  assert.ok(foundIc, "Simulation must contain IC/EC trains");
  assert.ok(foundRiedCargo, "Simulation must contain Riedbahn freight trains");
  assert.ok(foundNibCargo, "Simulation must contain Nibelungenbahn freight trains");
  assert.ok(iceTriggeredBiblis, "Non-stopping ICE train must trigger BÜ Kirchstraße closure/warning in Biblis");
  assert.ok(nibCargoTriggeredCrossing, "Non-stopping Nibelungenbahn Cargo train must trigger BÜ Mainstraße closure in Bürstadt");
});

test("polyline interpolation returns exact boundary points and valid headings", () => {
  const points = [
    [49.6, 8.4],
    [49.62, 8.42],
    [49.65, 8.45],
  ];

  const start = mobility.interpolatePolyline(points, 0);
  assert.equal(start.lat, 49.6);
  assert.equal(start.lng, 8.4);

  const end = mobility.interpolatePolyline(points, 1);
  assert.equal(end.lat, 49.65);
  assert.equal(end.lng, 8.45);

  const mid = mobility.interpolatePolyline(points, 0.5);
  assert.ok(mid.lat > 49.6 && mid.lat < 49.65);
  assert.ok(mid.lng > 8.4 && mid.lng < 8.45);
});

test("DEFAULT_CROSSING_NODES and mergeDefaultCrossings retain active crossings", () => {
  const mapDataSrc = fs.readFileSync(new URL("../lib/mapData.ts", import.meta.url), "utf8");
  const mapDataContext = { exports: {}, Date, Set, Number, Math, JSON, Array };
  vm.runInNewContext(
    ts.transpileModule(mapDataSrc, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    mapDataContext
  );
  const mapData = mapDataContext.exports;

  assert.equal(mapData.DEFAULT_CROSSING_NODES.length, 4);
  const initialNodes = [{ id: "sensor-1", name: "Sensor 1", locationName: "S1", address: "", lat: 49.6, lng: 8.4, categories: ["weather"], readings: [] }];
  const merged = mapData.mergeDefaultCrossings(initialNodes);
  assert.equal(merged.length, 5);
  assert.ok(merged.some((n) => n.id === "bu-buerstadt-mainstr"));

  // Idempotent when crossings already exist
  const mergedAgain = mapData.mergeDefaultCrossings(merged);
  assert.equal(mergedAgain.length, 5);
});

test("crossingStateLabel formats crossing states accurately", () => {
  const telemSrc = fs.readFileSync(new URL("../lib/telemetryData.ts", import.meta.url), "utf8");
  const telemContext = { exports: {}, Date, Set, Number, Math, JSON, Array, RegExp };
  vm.runInNewContext(
    ts.transpileModule(telemSrc, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    telemContext
  );
  const telem = telemContext.exports;

  assert.equal(telem.crossingStateLabel(0), "Offen (Frei)");
  assert.equal(telem.crossingStateLabel(1), "Schließt bald");
  assert.equal(telem.crossingStateLabel(2), "Geschlossen");

  assert.equal(telem.metricLabel({ metric: "crossing_state", unit: "state" }), "Schrankenzustand");
  assert.equal(telem.metricLabel({ metric: "closure_duration", unit: "s" }), "Schließdauer");
  assert.equal(telem.metricLabel({ metric: "crossing_closures", unit: "count" }), "Schließungen gesamt");
  assert.equal(telem.unitLabel("state"), "Zustand");
});

