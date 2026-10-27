import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, extra = {}, modules = {}) {
  const context = { exports: {}, Date, Number, Map, Set, Array, Object, Response, URL,
    require(id) { if (id in modules) return modules[id]; throw new Error(`Unexpected dependency ${id}`); }, ...extra };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const data = load("../lib/bahnData.ts");
const now = Date.now();
const expiry = new Date(now + 60000).toISOString();
const object = { id: "lift", provider_id: "diid:lift", name: null, type: "LiftEquipment", coordinates: null };
const station = { id: "station", provider_id: "dhid:station", name: "Biblis", type: "StopPlace", coordinates: null,
  eva_numbers: ["8000503"], ds100_codes: ["FBL"], eva_number: "8000503", station_number: "1", components: [object] };
const facility = { ...object, station_id: "station", eva_number: "8000503", status: "available", status_basis: "reported", description: null };
function response(kind, items, overrides = {}) {
  return Response.json({ [kind]: items }, { headers: {
    "x-source-updated-at": new Date(now - 1000).toISOString(),
    "x-collected-at": new Date(now).toISOString(), "x-data-expires-at": expiry,
    ...overrides,
  } });
}

test("unknown and missing facility reports never imply availability; expiration wins", () => {
  assert.equal(data.facilityStatus(undefined, expiry, now).tone, "unknown");
  assert.equal(data.facilityStatus({ ...facility, status_basis: "not_reported" }, expiry, now).tone, "unknown");
  assert.equal(data.facilityStatus({ ...facility, status: "unknown" }, expiry, now).tone, "unknown");
  assert.equal(data.facilityStatus(facility, expiry, now).label, "Verfügbar");
  assert.equal(data.facilityStatus(facility, expiry, Date.parse(expiry)).tone, "stale");
  assert.equal(data.facilityStatus(facility, "invalid", now).tone, "stale");
  assert.equal(data.facilityStatus({ ...facility, status: "notAvailable" }, expiry, now).label, "Nicht verfügbar");
  assert.equal(data.facilityStatus({ ...facility, status: "partiallyAvailable" }, expiry, now).label, "Teilweise verfügbar");
});

test("map positions use only own reported coordinates, without assigning a platform to a station or lift", () => {
  const positioned = { ...object, id: "equipment-place", type: "EquipmentPlace", coordinates: { latitude: 49.68, longitude: 8.44 } };
  const markers = data.infrastructureMarkers([{ ...station, components: [object, positioned] }], {
    data: [facility], expiresAt: expiry,
  }, now);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].id, "equipment-place");
  assert.equal(markers[0].statusLabel, "Keine Statusmeldung");
  assert.equal(markers[0].latitude, 49.68);
  for (const coordinate of [{ latitude: NaN, longitude: 8 }, { latitude: 91, longitude: 8 }, { latitude: "49", longitude: 8 }]) {
    assert.equal(data.validCoordinates(coordinate), false);
  }
});

test("search finds station names and official identifiers, including no matches", () => {
  for (const query of [" bIbLiS ", "8000503", "fbl"]) assert.equal(data.filterStations([station], query).length, 1);
  assert.equal(data.filterStations([station], "missing").length, 0);
});

test("client uses same-origin API and retains source metadata", async () => {
  let requested;
  const lib = load("../lib/bahnData.ts", { fetch: async path => { requested = path; return response("stations", [station]); } });
  const snapshot = await lib.fetchBahn("stations");
  assert.equal(requested, "/api/bahn/stations");
  assert.equal(snapshot.data[0].eva_numbers[0], "8000503");
  assert.equal(snapshot.expiresAt, expiry);
});

test("expired, future, malformed and failed responses are rejected", async () => {
  const cases = [
    () => response("facilities", [facility], { "x-data-expires-at": new Date(now - 1000).toISOString() }),
    () => response("facilities", [facility], { "x-source-updated-at": new Date(now + 600000).toISOString() }),
    () => Response.json({ facilities: [facility] }),
    () => Response.json({ detail: "expired" }, { status: 503 }),
    () => response("facilities", [{ ...facility, status: "invented" }]),
    () => response("facilities", [facility, facility]),

  ];
  for (const makeResponse of cases) {
    const lib = load("../lib/bahnData.ts", { fetch: async () => makeResponse() });
    await assert.rejects(lib.fetchBahn("facilities"));
  }
  const invalidInventory = load("../lib/bahnData.ts", { fetch: async () => response("stations", [
    { ...station, components: [{ ...object, coordinates: { latitude: 500, longitude: 8 } }] },
  ]) });
  await assert.rejects(invalidInventory.fetchBahn("stations"));
});

test("Next proxies preserve the publication boundary and distinct cache lifetimes", async () => {
  for (const [kind, ttl] of [["stations", 300], ["facilities", 0]]) {
    const expected = response(kind, []);
    const route = load(`../app/api/bahn/${kind}/route.ts`, {}, {
      "@/lib/collectedBackend": { proxyBackend(path, seconds) {
        assert.equal(path, `collected/transport/bahn/${kind}`);
        assert.equal(seconds, ttl);
        return expected;
      } },
    });
    assert.equal(await route.GET(), expected);
  }
});

const sensorData = load("../lib/bahnSensors.ts", {}, { "./bahnData": data });
const place = { ...object, id: "place", provider_id: "place:1", type: "EquipmentPlace", coordinates: { latitude: 49.68, longitude: 8.44 }, equipment_refs: ["diid:lift"] };

test("explicit equipment-place locations use the lift's state and retain provenance", () => {
  const joined = { ...station, components: [object, place] };
  const locations = data.objectLocations(joined, object);
  assert.equal(locations.length, 1);
  assert.equal(locations[0].basis, "equipment_place");
  assert.equal(locations[0].objectId, "place");
  assert.equal(object.coordinates, null);
  const markers = data.infrastructureMarkers([joined], { data: [facility], expiresAt: expiry }, now);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].id, "lift");
  assert.equal(markers[0].statusLabel, "Verfügbar");
  assert.match(markers[0].positionLabel, /referenzierten/);
  assert.equal(data.objectLocations({ ...station, components: [{ ...place, equipment_refs: ["different"] }] }, object).length, 0);
  assert.equal(data.objectLocations(joined, { ...object, coordinates: { latitude: 50, longitude: 9 } })[0].basis, "own");
});

test("sensor radius compares unrounded distances, excludes unlocated stations and exposes ambiguity", () => {
  const a = { ...station, components: [place] };
  const b = { ...a, id: "other-station" };
  const sensor = { id: "sensor", name: "Messstelle", latitude: 49.68, longitude: 8.44, readings: [] };
  const candidates = sensorData.sensorCandidates([a, b, { ...station, id: "unlocated" }], a.id, [sensor], 100);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].distanceMeters, 0);
  assert.equal(candidates[0].referenceObjectId, "place");
  assert.equal(candidates[0].stationIds.length, 2);
  assert.equal(sensorData.sensorCandidates([station], station.id, [sensor], 100).length, 0);
  const offset = { ...sensor, latitude: 49.6809 };
  const distance = sensorData.distanceMeters(sensor.latitude, sensor.longitude, offset.latitude, offset.longitude);
  assert.ok(distance > 100 && distance < 101);
  assert.equal(sensorData.sensorCandidates([a], a.id, [offset], 100).length, 0);
  assert.equal(sensorData.sensorCandidates([a], a.id, [offset], 500).length, 1);
  assert.equal(sensorData.sensorCandidates([a], a.id, [{ ...sensor, latitude: NaN }], 500).length, 0);
  assert.equal(sensorData.sensorCandidates([a], a.id, [sensor], Infinity).length, 0);
});

test("sensor inventory validates freshness, excludes invalid positions and preserves reading timestamps", async () => {
  const body = { generated_at: new Date().toISOString(), sensors: [
    { id: "s", friendly_name: "Messstelle", latitude: 49.68, longitude: 8.44, readings: [{ metric: "temperature", value: 23, unit: "°C", timestamp: "2025-01-01T00:00:00Z" }] },
    { id: "missing", friendly_name: "Unverortet", latitude: null, longitude: null, readings: [] },
  ] };
  const sensors = load("../lib/bahnSensors.ts", { fetch: async () => Response.json(body) }, { "./bahnData": data });
  const result = await sensors.fetchSensorInventory();
  assert.equal(result.sensors.length, 1);
  assert.equal(result.unlocated, 1);
  assert.equal(result.sensors[0].readings[0].timestamp, "2025-01-01T00:00:00Z");
  body.generated_at = "2020-01-01T00:00:00Z";
  await assert.rejects(() => sensors.fetchSensorInventory(), /Aktualität/);
  body.generated_at = new Date().toISOString(); body.sensors.push(body.sensors[0]);
  await assert.rejects(() => sensors.fetchSensorInventory(), /unvollständig/);
});

const boards = load("../lib/bahnBoards.ts", {}, { "./bahnData": data });
const boardEvent = { journey_id: "opaque-journey", event_id: "event-1", event_type: "departure", eva_number: "8000503",
  scheduled_at: "2026-10-06T12:00:00Z", time: "2026-10-06T12:04:00Z", time_basis: "PREVIEW", cancelled: false,
  delay_seconds: 240, platform: "2", description: "RE 70", direction: "Mannheim Hbf", gtfs_link: { status: "unmapped" } };
function risResponse(events, overrides = {}) {
  const headers = { "x-source-updated-at": new Date().toISOString(), "x-collected-at": new Date().toISOString(), "x-data-expires-at": expiry, ...overrides };
  return Response.json({ contract: "ris-boards-netz-1.8.2", timestamp_basis: "fetched", window_start: "2026-10-06T11:55:00Z", window_end: "2026-10-06T13:00:00Z", eva_numbers: ["8000503"], events }, { headers });
}

test("RIS time bases distinguish schedule, forecast and actual reports; station joins use EVA", () => {
  assert.equal(boards.boardTimeBasis(boardEvent), "Prognose");
  assert.equal(boards.boardTimeBasis({ ...boardEvent, time_basis: "SCHEDULE" }), "Nur Fahrplan");
  assert.equal(boards.boardTimeBasis({ ...boardEvent, time_basis: "REAL" }), "Gemeldete Ist-Zeit");
  const board = { events: [boardEvent, { ...boardEvent, eva_number: "other" }] };
  assert.equal(boards.eventsForStation(board, ["8000503"]).length, 1);
  assert.equal(boards.eventsForStation(board, ["8000360"]).length, 0);
});

test("RIS client preserves exact instance links and handles unconfigured or expired publications", async () => {
  let events = [{ ...boardEvent, gtfs_link: { status: "matched", schedule_source: "gtfs", trip_id: "opaque-trip", service_date: "2026-10-05", basis: "explicit_crosswalk_and_exact_schedule" } }];
  let mode = "ok";
  const client = load("../lib/bahnBoards.ts", { fetch: async url => {
    assert.equal(url, "/api/bahn/boards");
    if (mode === "missing") return new Response(null, { status: 404 });
    if (mode === "not-collected") return Response.json({ detail: "Source not collected yet" }, { status: 503 });
    if (mode === "unavailable") return Response.json({ error: "Backend data unavailable" }, { status: 503 });
    if (mode === "stored-expired") return Response.json({ detail: "Stored source data expired" }, { status: 503 });
    if (mode === "expired") return risResponse(events, { "x-data-expires-at": "2020-01-01T00:00:00Z" });
    return risResponse(events);
  } }, { "./bahnData": data });
  const result = await client.fetchBahnBoard();
  assert.equal(result.data.events[0].gtfs_link.service_date, "2026-10-05");
  mode = "missing"; assert.equal(await client.fetchBahnBoard(), null);
  mode = "not-collected"; assert.equal(await client.fetchBahnBoard(), null);
  for (const failure of ["unavailable", "stored-expired"]) {
    mode = failure; await assert.rejects(() => client.fetchBahnBoard(), /nicht erreichbar/);
  }
  mode = "expired"; await assert.rejects(() => client.fetchBahnBoard(), /Aktualität/);
  mode = "ok"; events = [{ ...boardEvent, gtfs_link: { status: "matched" } }];
  await assert.rejects(() => client.fetchBahnBoard(), /Fahrtzuordnung/);
});

test("RIS client rejects invented zero-delay live status, wrong stations and duplicate events", async () => {
  for (const events of [[{ ...boardEvent, time_basis: "SCHEDULE" }], [{ ...boardEvent, eva_number: "wrong" }], [boardEvent, boardEvent], [{ ...boardEvent, time: "2026-10-06T12:00:00" }]]) {
    const client = load("../lib/bahnBoards.ts", { fetch: async () => risResponse(events) }, { "./bahnData": data });
    await assert.rejects(() => client.fetchBahnBoard());
  }
});
