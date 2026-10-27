import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const context = { exports: {}, Date, Number, Math, String, Array, Error };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/satelliteData.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { decodeSatellites, satelliteFresh, satelliteDetails } = context.exports;
const now = Date.parse("2026-10-06T08:00:00Z");
const sample = { id: "satellite:25544", norad_id: 25544, name: "ISS", latitude: 49.65, longitude: 8.45,
  altitude_km: 420, speed_km_s: 7.66, timestamp: new Date(now).toISOString(), element_epoch: "2026-10-06T07:00:00Z",
  element_age_seconds: 3600, basis: "model", source: "space-track" };
const body = positions => ({ positions, timestamp: sample.timestamp, last_import: sample.element_epoch });
test("satellite model coordinates remain at their real ground position, including outside the Ried", () => {
  const result = decodeSatellites(body([sample, { ...sample, id: "satellite:12345", norad_id: 12345, latitude: -30, longitude: 140 }]), now);
  assert.equal(result.positions.length, 2);
  assert.equal(result.positions[1].longitude, 140);
  assert.match(satelliteDetails(sample).join(" "), /berechnete Bodenprojektion/);
});
test("invalid geometry, wrong identity and non-model positions cannot reach Leaflet", () => {
  for (const change of [{ latitude: NaN }, { longitude: Infinity }, { latitude: 91 }, { id: "sensor:25544" },
    { basis: "observed" }, { element_age_seconds: 864001 }, { element_epoch: "invalid" }]) {
    assert.equal(decodeSatellites(body([{ ...sample, ...change }]), now).positions.length, 0);
  }
});
test("stale cached snapshots and expired positions cannot remain live", () => {
  assert.equal(satelliteFresh(sample, now + 4999), true);
  assert.equal(satelliteFresh(sample, now + 5000), false);
  assert.throws(() => decodeSatellites(body([sample]), now + 6000), /stale/);
  assert.equal(decodeSatellites(body([{ ...sample, timestamp: new Date(now-6000).toISOString() }]), now).positions.length, 0);
  assert.throws(() => decodeSatellites({ positions: [], timestamp: "invalid" }, now));
});

test("an empty regional view is ready when the backend has valid orbital data", () => {
  const empty = decodeSatellites({ ...body([]), status: "ready", catalog_count: 15000 }, now);
  assert.equal(empty.available, true);
  assert.equal(empty.catalog_count, 15000);
  assert.equal(empty.positions.length, 0);
  assert.equal(decodeSatellites({ ...body([]), status: "unavailable", catalog_count: 15000 }, now).available, false);
});

const observationContext = { exports: {}, Date, Number };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/currentObservation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, observationContext);
test("earth observations expire at UTC midnight and reject missing, invalid and future acquisitions", () => {
  const { isCurrentObservation } = observationContext.exports;
  const current = Date.parse("2026-10-10T12:00:00Z");
  assert.equal(isCurrentObservation("2026-10-10", current), true);
  assert.equal(isCurrentObservation("2026-10-10T11:00:00Z", current), true);
  for (const stamp of [undefined, "invalid", "2026-10-09T23:59:59Z", "2026-10-10T13:00:00Z"])
    assert.equal(isCurrentObservation(stamp, current), false);
  assert.equal(isCurrentObservation("2026-10-10T23:59:59Z", Date.parse("2026-10-11T00:00:00Z")), false);
});

const earthContext = { exports: {}, Date, Number };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/earthObservation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, earthContext);
const { latestRasterScenes, inFirmsWindow } = earthContext.exports;
const earthNow = Date.parse("2026-10-10T12:00:00Z");
test("RGB and NDVI select available archived rasters across midnight, excluding pending and future scenes", () => {
  const raster = { method: "sentinel-c1-scl20-v1" };
  const scenes = [{ id: "pending", date: "2026-10-10" }, { id: "available", date: "2026-10-05", raster },
    { id: "future", date: "2026-10-11", raster }, { id: "legacy", date: "2026-10-09", raster: { method: "heuristic" } }];
  for (const mode of ["rgb", "ndvi"]) assert.equal(latestRasterScenes(scenes, mode, earthNow)[0].id, "available");
});
test("temperature skips fully masked scenes and includes matching tiles of the last usable acquisition", () => {
  const raster = valid_pixels => ({ method: "ecostress-v003-clear-land70-v1", stats: { valid_pixels } });
  const scenes = [{ id: "cloudy", acquired_at: "2026-10-09T12:00:00Z", raster: raster(0) },
    { id: "a", acquired_at: "2026-10-08T12:00:00Z", raster: raster(10) },
    { id: "b", acquired_at: "2026-10-08T12:00:00Z", raster: raster(20) },
    { id: "old", acquired_at: "2026-10-07T12:00:00Z", raster: raster(30) }];
  assert.equal(latestRasterScenes(scenes, "ecostress", earthNow).map(s => s.id).join(","), "a,b");
  assert.equal(latestRasterScenes([scenes[0]], "ecostress", earthNow).length, 0);
});
test("FIRMS includes three UTC days and excludes future and expired detections", () => {
  for (const stamp of ["2026-10-08T00:00:00Z", "2026-10-09T23:00:00Z", "2026-10-10T11:00:00Z"])
    assert.equal(inFirmsWindow(stamp, earthNow), true);
  for (const stamp of ["2026-10-07T23:59:59Z", "2026-10-10T13:00:00Z", "invalid"])
    assert.equal(inFirmsWindow(stamp, earthNow), false);
});
