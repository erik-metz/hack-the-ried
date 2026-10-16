import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/mapData.ts", import.meta.url), "utf8");
const context = { exports: {}, Date, Set, Number, JSON };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const model = context.exports;
const now = Date.parse("2026-09-14T12:00:00Z");
const reading = (metric, value = 18, unit = "°C", timestamp = "2026-09-14T11:30:00Z") => ({ metric, value, unit, timestamp });
const sensor = (readings, extras = {}) => ({ id: "station", friendly_name: "Station", latitude: 49.6, longitude: 8.4, readings, ...extras });

test("multi-metric station belongs to several themes but appears only once", () => {
  const nodes = model.toMapNodes([sensor([reading("temperature"), reading("air_quality_index", 1, "index")])]);
  assert.deepEqual([...nodes[0].categories], ["weather", "air"]);
  assert.equal(model.visibleNodes(nodes, ["weather", "air"], "category").length, 1);
  assert.equal(model.visibleNodes(nodes, ["parking"], "category").length, 0);
  assert.equal(model.visibleNodes(nodes, [], "category").length, 0);
});
test("soil temperatures are distinguished from air temperatures", () => {
  const nodes = model.toMapNodes([sensor([reading("temperature")], { friendly_name: "Bodentemperatur Domwiese" })]);
  assert.deepEqual([...nodes[0].categories], ["soil"]);
});
test("legacy metadata fallback has unknown freshness and usable source categories", () => {
  const nodes = model.toMapNodes([sensor([], { description: "Smart City; urn:ngsi-ld:ParkingSpotSum:123" })]);
  assert.deepEqual([...nodes[0].categories], ["parking"]);
  assert.equal(model.readingFreshness(undefined, now), "unknown");
});
test("measurement age is independent of fetch time; parking is a state, never online", () => {
  assert.equal(model.readingFreshness(reading("temperature"), now), "fresh");
  assert.equal(model.readingFreshness(reading("temperature", 18, "°C", "2026-01-01T00:00:00Z"), now), "stale");
  assert.equal(model.readingFreshness(reading("parking_free", 0, "count", "2026-01-01T00:00:00Z"), now), "state");
  assert.equal(model.readingFreshness(reading("temperature", 18, "°C", "2027-01-01T00:00:00Z"), now), "unknown");
});
test("temperature mode excludes incompatible units and respects categories", () => {
  const nodes = model.toMapNodes([sensor([reading("temperature")]), sensor([reading("temperature", 70, "F")], { id: "fahrenheit" })]);
  assert.equal(model.visibleNodes(nodes, ["weather"], "temperature").length, 1);
  assert.equal(model.visibleNodes(nodes, ["soil"], "temperature").length, 0);
});
test("hidden and invalid-coordinate sensors are not exposed on the map", () => {
  assert.equal(model.toMapNodes([sensor([], { is_hidden: true }), sensor([], { latitude: null }), sensor([], { longitude: 200 })]).length, 0);
});
test("stored filters are validated and support an intentionally empty selection", () => {
  assert.deepEqual([...model.parseStoredCategories('["weather","weather"]')], ["weather"]);
  assert.equal(model.parseStoredCategories('["nonexistent"]') .length, model.DEFAULT_MAP_CATEGORIES.length);
  assert.equal(model.parseStoredCategories("[]").length, 0);
  assert.equal(model.parseStoredCategories("bad json").length, model.DEFAULT_MAP_CATEGORIES.length);
});
test("temperature bins agree with the displayed legend, parking zero stays visible", () => {
  const bins = [-1, 0, 10, 20, 30].map(model.temperatureColor);
  assert.equal(new Set(bins).size, 5);
  assert.equal(model.valueLabel(reading("parking_free", 0, "count")), "0 frei");
});

test("parking popup combines counts, preserves zero and derives missing availability", () => {
  const counts = (free, occupied, capacity) => [reading("parking_free", free, "count"), reading("parking_occupied", occupied, "count"), reading("parking_capacity", capacity, "count")];
  assert.equal(model.parkingSummary(counts(3, 7, 10)).summary, "3 von 10 Stellplätzen frei");
  assert.equal(model.parkingSummary(counts(0, 10, 10)).summary, "0 von 10 Stellplätzen frei");
  assert.equal(model.parkingSummary(counts(1, 0, 1)).summary, "1 von 1 Stellplatz frei");
  assert.equal(model.parkingSummary(counts(3, 7, 10).slice(1)).summary, "3 von 10 Stellplätzen frei");
  assert.equal(model.parkingSummary(counts(3, 7, 10).slice(0, 2)).summary, "3 von 10 Stellplätzen frei");
});

test("parking popup does not invent a total from asynchronous or invalid counts", () => {
  const free = reading("parking_free", 3, "count");
  const occupied = reading("parking_occupied", 7, "count", "2026-09-13T11:30:00Z");
  assert.equal(model.parkingSummary([free, occupied]).summary, "3 Stellplätze frei");
  assert.ok(model.parkingSummary([free]).details.includes("Gesamtzahl nicht gemeldet"));
  const bad = model.parkingSummary([free, reading("parking_capacity", 2, "count")]);
  assert.equal(bad.summary, "3 Stellplätze frei");
  assert.ok(bad.details.includes("Die gemeldeten Anzahlen sind widersprüchlich."));
  assert.equal(model.parkingSummary([reading("parking_free", -1, "count")]), undefined);
  assert.equal(model.parkingSummary([reading("parking_free", 1.5, "count")]), undefined);
  assert.equal(model.parkingSummary([reading("temperature")]), undefined);
});

test("station inventory includes parking groups without placing them at invented coordinates", () => {
  const input = [sensor([reading("parking_free", 3, "count")], { latitude: null, longitude: null })];
  assert.equal(model.toStationNodes(input).length, 1);
  assert.equal(model.toMapNodes(input).length, 0);
  assert.equal(model.toStationNodes([sensor([], {is_hidden:true})]).length, 0);
});

test("parking spots at the same station are combined into one station node with aggregate counts and x/y frei label", () => {
  const spots = [
    sensor([reading("parking_free", 1, "count"), reading("parking_occupied", 0, "count"), reading("parking_capacity", 1, "count")], { id: "p1", friendly_name: "Bahnhofsallee", latitude: 49.642, longitude: 8.451 }),
    sensor([reading("parking_free", 1, "count"), reading("parking_occupied", 0, "count"), reading("parking_capacity", 1, "count")], { id: "p2", friendly_name: "Bahnhofsallee", latitude: 49.642, longitude: 8.451 }),
    sensor([reading("parking_free", 1, "count"), reading("parking_occupied", 0, "count"), reading("parking_capacity", 1, "count")], { id: "p3", friendly_name: "Bahnhofsallee", latitude: 49.642, longitude: 8.451 }),
    sensor([reading("parking_free", 0, "count"), reading("parking_occupied", 1, "count"), reading("parking_capacity", 1, "count")], { id: "p4", friendly_name: "Bahnhofsallee", latitude: 49.642, longitude: 8.451 }),
    sensor([reading("parking_free", 1, "count"), reading("parking_occupied", 0, "count"), reading("parking_capacity", 1, "count")], { id: "p5", friendly_name: "Bahnhofsallee", latitude: 49.642, longitude: 8.451 }),
  ];
  const stations = model.toStationNodes(spots);
  assert.equal(stations.length, 1);
  assert.equal(stations[0].name, "Bahnhofsallee");
  assert.equal(stations[0].isAggregate, true);
  const free = stations[0].readings.find(r => r.metric === "parking_free");
  const occupied = stations[0].readings.find(r => r.metric === "parking_occupied");
  const capacity = stations[0].readings.find(r => r.metric === "parking_capacity");
  assert.equal(free?.value, 4);
  assert.equal(occupied?.value, 1);
  assert.equal(capacity?.value, 5);
  assert.equal(model.valueLabel(free, stations[0].readings), "4/5 frei");
  assert.equal(model.parkingSummary(stations[0].readings).summary, "4 von 5 Stellplätzen frei");
});

test("parking valueLabel formats x/y frei when capacity is available and preserves fallback", () => {
  const withCap = [reading("parking_free", 4, "count"), reading("parking_capacity", 5, "count"), reading("parking_occupied", 1, "count")];
  assert.equal(model.valueLabel(withCap[0], withCap), "4/5 frei");
  const zeroCap = [reading("parking_free", 0, "count"), reading("parking_capacity", 5, "count"), reading("parking_occupied", 5, "count")];
  assert.equal(model.valueLabel(zeroCap[0], zeroCap), "0/5 frei");
  const noCap = [reading("parking_free", 3, "count")];
  assert.equal(model.valueLabel(noCap[0], noCap), "3 frei");
  // Backward compatibility when second argument is omitted
  assert.equal(model.valueLabel(withCap[0]), "4 frei");
});

test("rast-monitor rest areas are categorized under parking and provide truck parking summary", () => {
  const rastSensor = sensor(
    [
      reading("parking_free", 20, "count"),
      reading("parking_occupied", 57, "count"),
      reading("parking_capacity", 77, "count"),
      reading("parking_occupancy_pct", 74, "%"),
    ],
    {
      id: "rast-de-he-670010",
      friendly_name: "Rastplatz Lorsch Ost (A67)",
      latitude: 49.64408,
      longitude: 8.553497,
      description: "LKW-Rastplatz A67 Lorsch Ost · Fahrtrichtung Darmstadt · 77 Stellplätze · rast-monitor.de",
      entity_type: "truck_parking",
    }
  );
  const nodes = model.toStationNodes([rastSensor]);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "Rastplatz Lorsch Ost (A67)");
  assert.deepEqual([...nodes[0].categories], ["parking"]);
  const summary = model.parkingSummary(nodes[0].readings);
  assert.ok(summary);
  assert.equal(summary.summary, "20 von 77 Stellplätzen frei");
  assert.ok(summary.details.includes("57 Stellplätze belegt"));
});

test("opensensemap stations are categorized under weather and air and provide environmental readings", () => {
  const osemSensor = sensor(
    [
      reading("temperature", 21.5, "°C"),
      reading("relative_humidity", 65, "%"),
      reading("PM10", 14.2, "µg/m³"),
      reading("PM25", 7.8, "µg/m³"),
    ],
    {
      id: "osem-58cd22d8c877fb0011774898",
      friendly_name: "senseBox: Bürstadt Wetterstation",
      latitude: 49.6425,
      longitude: 8.4552,
      description: "openSenseMap / senseBox Station 'Bürstadt Wetterstation' · Quelle: openSenseMap",
      entity_type: "environmental_sensor",
    }
  );
  const nodes = model.toStationNodes([osemSensor]);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "senseBox: Bürstadt Wetterstation");
  assert.deepEqual([...nodes[0].categories], ["weather", "air"]);
  assert.equal(nodes[0].readings.length, 4);
});

test("uba air quality stations are categorized under air and format readings", () => {
  const ubaSensor = sensor(
    [
      reading("PM10", 16.5, "µg/m³"),
      reading("PM25", 8.2, "µg/m³"),
      reading("NO2", 22.1, "µg/m³"),
      reading("O3", 45.0, "µg/m³"),
      reading("air_quality_index", 2, "index"),
    ],
    {
      id: "uba-DEHE043",
      friendly_name: "UBA Riedstadt (DEHE043)",
      latitude: 49.828,
      longitude: 8.502,
      description: "Umweltbundesamt Luftmessstation Riedstadt",
      entity_type: "air_quality_station",
    }
  );
  const nodes = model.toStationNodes([ubaSensor]);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "UBA Riedstadt (DEHE043)");
  assert.deepEqual([...nodes[0].categories], ["air"]);
  assert.equal(nodes[0].readings.length, 5);
});

test("nextbike stations are categorized under bikes and format x/y Räder availability", () => {
  const stationSensor = sensor(
    [
      reading("bike_available", 4, "count"),
      reading("bike_racks_free", 6, "count"),
      reading("bike_capacity", 10, "count"),
      reading("bike_ebikes", 1, "count"),
    ],
    {
      id: "nextbike-10047180",
      friendly_name: "VRNnextbike Bahnhof Lampertheim",
      latitude: 49.5988,
      longitude: 8.4776,
    }
  );

  const categories = model.categoriesFor(stationSensor);
  assert.deepEqual([...categories], ["bikes"]);

  const nodes = model.toMapNodes([stationSensor]);
  assert.equal(nodes.length, 1);
  assert.deepEqual([...nodes[0].categories], ["bikes"]);

  const bikeAvail = nodes[0].readings.find(r => r.metric === "bike_available");
  assert.equal(model.valueLabel(bikeAvail, nodes[0].readings), "4/10 Räder");

  const summary = model.bikeSummary(nodes[0].readings);
  assert.ok(summary);
  assert.equal(summary.summary, "4 von 10 Leihrädern verfügbar");
  assert.ok(summary.details.some(d => d.includes("6 freie Rückgabepositionen")));
  assert.ok(summary.details.some(d => d.includes("1 E-Bike / Pedelec")));
});

test("nextbike virtual station with 0 racks displays count and warns when empty or full", () => {
  const virtualStation = [
    reading("bike_available", 3, "count"),
    reading("bike_racks_free", 0, "count"),
    reading("bike_capacity", 0, "count"),
  ];
  assert.equal(model.valueLabel(virtualStation[0], virtualStation), "3 Räder");
  const summary = model.bikeSummary(virtualStation);
  assert.equal(summary.summary, "3 Leihräder verfügbar");

  const emptyStation = [
    reading("bike_available", 0, "count"),
    reading("bike_racks_free", 10, "count"),
    reading("bike_capacity", 10, "count"),
  ];
  const emptySummary = model.bikeSummary(emptyStation);
  assert.equal(emptySummary.isEmpty, true);
  assert.ok(emptySummary.details.some(d => d.includes("Station leer")));

  const fullStation = [
    reading("bike_available", 10, "count"),
    reading("bike_racks_free", 0, "count"),
    reading("bike_capacity", 10, "count"),
  ];
  const fullSummary = model.bikeSummary(fullStation);
  assert.equal(fullSummary.isFull, true);
  assert.ok(fullSummary.details.some(d => d.includes("Station voll")));
});


test("normalizeParkingName strips spot numbers, letters and prefixes", () => {
  assert.equal(model.normalizeParkingName("Kaiserstraße Nr. 2"), "Kaiserstraße");
  assert.equal(model.normalizeParkingName("Kaiserstraße Nr. 15"), "Kaiserstraße");
  assert.equal(model.normalizeParkingName("Wilhelmstraße 42 L"), "Wilhelmstraße");
  assert.equal(model.normalizeParkingName("Wilhelmstraße 46 R"), "Wilhelmstraße");
  assert.equal(model.normalizeParkingName("Hallenbadparkplatz Links"), "Hallenbadparkplatz");
  assert.equal(model.normalizeParkingName("lub2-parking-81"), "lub2-parking");
  assert.equal(model.normalizeParkingName("Bodentemperatur Kaiserstraße Nr. 2"), "Kaiserstraße");
});

test("parking spots with individual spot numbers are grouped by street and merge companion puck temperatures", () => {
  const sensors = [
    sensor([reading("parking_free", 1, "count"), reading("parking_occupied", 0, "count"), reading("parking_capacity", 1, "count")], {
      id: "p1", friendly_name: "Kaiserstraße Nr. 1", latitude: 49.5941, longitude: 8.4677,
      description: "Smart City; urn:ngsi-ld:ParkingSpotSum:IoT-Plan-Nwave-lub-parking-62"
    }),
    sensor([reading("parking_free", 0, "count"), reading("parking_occupied", 1, "count"), reading("parking_capacity", 1, "count")], {
      id: "p2", friendly_name: "Kaiserstraße Nr. 2", latitude: 49.5942, longitude: 8.4679,
      description: "Smart City; urn:ngsi-ld:ParkingSpotSum:IoT-Plan-Nwave-lub-parking-67"
    }),
    sensor([reading("parking_free", 1, "count"), reading("parking_occupied", 0, "count"), reading("parking_capacity", 1, "count")], {
      id: "p3", friendly_name: "Kaiserstraße Nr. 3", latitude: 49.5943, longitude: 8.4678,
      description: "Smart City; urn:ngsi-ld:ParkingSpotSum:IoT-Plan-Nwave-lub-parking-71"
    }),
    // Companion puck temperature sensors
    sensor([reading("temperature", 14.5, "°C")], {
      id: "t1", friendly_name: "Bodentemperatur Kaiserstraße Nr. 2", latitude: 49.5942, longitude: 8.4679,
      description: "Smart City; urn:ngsi-ld:WeatherObserved:IoT-Plan-Nwave-lub-parking-67"
    }),
    sensor([reading("temperature", 15.5, "°C")], {
      id: "t2", friendly_name: "Bodentemperatur Kaiserstraße Nr. 3", latitude: 49.5943, longitude: 8.4678,
      description: "Smart City; urn:ngsi-ld:WeatherObserved:IoT-Plan-Nwave-lub-parking-71"
    }),
  ];

  const stations = model.toStationNodes(sensors);
  // All 3 parking spots + 2 temperature pucks should collapse into 1 clean station
  assert.equal(stations.length, 1);
  const station = stations[0];
  assert.equal(station.name, "Kaiserstraße");
  assert.deepEqual([...station.categories], ["parking", "soil"]);
  assert.equal(station.isAggregate, true);

  // Centroid latitude: (49.5941 + 49.5942 + 49.5943) / 3 = 49.5942
  assert.ok(Math.abs(station.lat - 49.5942) < 0.0001);
  assert.ok(Math.abs(station.lng - 8.4678) < 0.0001);

  const free = station.readings.find(r => r.metric === "parking_free");
  const occupied = station.readings.find(r => r.metric === "parking_occupied");
  const capacity = station.readings.find(r => r.metric === "parking_capacity");
  const soilTemp = station.readings.find(r => r.metric === "soil_temperature");

  assert.equal(free?.value, 2);
  assert.equal(occupied?.value, 1);
  assert.equal(capacity?.value, 3);
  assert.equal(model.valueLabel(free, station.readings), "2/3 frei");
  // Soil temperature is averaged: (14.5 + 15.5) / 2 = 15.0 °C
  assert.equal(soilTemp?.value, 15);
  assert.equal(soilTemp?.unit, "°C");
});

test("traffic and all soil metrics have dedicated categories", () => {
  assert.deepEqual([...model.categoriesFor(sensor([reading("traffic_cars_hourly", 10, "count")]))], ["traffic"]);
  assert.deepEqual([...model.categoriesFor(sensor([reading("soil_tension_30cm", 10, "kPa")]))], ["soil"]);
});

test("co-located traffic intersection sensors are offset along their respective directional road arms", () => {
  const sensors = [
    sensor([reading("traffic_cars_hourly", 180, "count")], { id: "t1", friendly_name: "Kaiserstr. Nord", latitude: 49.594875, longitude: 8.46886, entity_type: "TrafficFlowObservedSumHourly" }),
    sensor([reading("traffic_cars_hourly", 23, "count")], { id: "t2", friendly_name: "Wilhelmstr. Ost", latitude: 49.594875, longitude: 8.46886, entity_type: "TrafficFlowObservedSumHourly" }),
    sensor([reading("traffic_cars_hourly", 44, "count")], { id: "t3", friendly_name: "Wilhelmstr. West", latitude: 49.594875, longitude: 8.46886, entity_type: "TrafficFlowObservedSumHourly" }),
    sensor([reading("traffic_cars_hourly", 399, "count")], { id: "t4", friendly_name: "Kaiserstr. Süd", latitude: 49.594875, longitude: 8.46886, entity_type: "TrafficFlowObservedSumHourly" }),
  ];

  const nodes = model.toStationNodes(sensors);
  assert.equal(nodes.length, 4);

  const nord = nodes.find(n => n.name === "Kaiserstr. Nord");
  const sued = nodes.find(n => n.name === "Kaiserstr. Süd");
  const ost = nodes.find(n => n.name === "Wilhelmstr. Ost");
  const west = nodes.find(n => n.name === "Wilhelmstr. West");

  // All 4 sensors must now have distinct coordinates on their road arms
  assert.ok(nord.lat > 49.594875, "Nord arm should be offset North");
  assert.ok(sued.lat < 49.594875, "Süd arm should be offset South");
  assert.ok(ost.lng > 8.46886, "Ost arm should be offset East");
  assert.ok(west.lng < 8.46886, "West arm should be offset West");

  // Value labels are formatted compactly as / h
  assert.equal(model.valueLabel(nord.readings[0]), "180 / h");
  assert.equal(model.valueLabel(sued.readings[0]), "399 / h");
  assert.equal(model.valueLabel(reading("traffic_cars_daily_city", 5000, "count")), "5.000 / Tag");
});

const telemetryContext = { exports: {}, Date, Map, Number, JSON };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/telemetryData.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, telemetryContext);
const telemetry = telemetryContext.exports;
test("all measurements remain visible from inventory when history or latest request fails", () => {
  const snapshot = [reading("parking_free", 0, "count"), reading("parking_capacity", 10, "count"), reading("soil_tension", 20, "kPa")];
  assert.equal(telemetry.mergeReadings(snapshot, []).length, 3);
  const merged = telemetry.mergeReadings(snapshot, [reading("parking_free", 4, "count", "2026-09-14T11:45:00Z")]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(r => r.metric === "parking_free").value, 4);
  assert.equal(telemetry.metricLabel(reading("traffic_cars_hourly", 2, "count")), "PKW · Stundensumme");
  assert.equal(telemetry.unitLabel("count"), "Anzahl");
});

test("weather identity is not overridden by generic parking notes in source descriptions", () => {
  const nodes = model.toStationNodes([sensor([reading("temperature")], {
    entity_type: "WeatherObserved", source_entity_id: "urn:ngsi-ld:WeatherObserved:wettermanufaktur-123",
    description: "Smart City; Parking counts may describe a group; temperature may include soil sensors.",
  })]);
  assert.deepEqual([...nodes[0].categories], ["weather"]);
});

const presentationContext = { exports: {}, document: { createElement: () => ({ style: { setProperty: () => {} }, append: () => {}, setAttribute: () => {} }) }, Date, Set, Number, JSON };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/mapPresentation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, presentationContext);
const presentation = presentationContext.exports;

test("mapPresentation identifies roadwork and corridors with distinct symbols and colors", () => {
  assert.equal(presentation.mapSymbol("roadwork").symbol, "🚧");
  assert.equal(presentation.mapSymbol("roadwork").label, "Baustelle");
  assert.equal(presentation.mapSymbol("corridor").symbol, "🚗");
  assert.equal(presentation.mapSymbol("closures").symbol, "⛔");

  assert.equal(presentation.featureKind("closures", { cause_type: "roadwork" }), "roadwork");
  assert.equal(presentation.featureKind("closures", { closure_type: "partial", reason: "Kabelverlegung" }), "roadwork");
  assert.equal(presentation.featureKind("closures", { closure_type: "full", reason: "Vollsperrung" }), "closures");
  assert.equal(presentation.featureKind("traffic", { kind: "corridor" }), "corridor");
});

test("mapPresentation formats energy facilities as private solar with static hint", () => {
  assert.equal(presentation.mapSymbol("energy").symbol, "☀");
  assert.ok(presentation.mapSymbol("energy").label.includes("Solar"));

  const card = presentation.featureCard("energy", {
    name: "Energieanlage",
    facility_type: "Photovoltaik (Dachanlage)",
    operator: "Privat",
  });
  assert.ok(card);
});

const aircraftElement = tag => ({ tag, attrs: {}, children: [], dataset: {}, style: { setProperty() {} },
 setAttribute(key,value) { this.attrs[key]=value; }, append(...nodes) { this.children.push(...nodes); } });
const aircraftContext = { exports: {}, document: { createElement: aircraftElement, createElementNS: (_,tag) => aircraftElement(tag) } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/aircraftPresentation.ts", import.meta.url), "utf8"), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, aircraftContext);
const aircraftPresentation = aircraftContext.exports;
test("all received OGN and ADS-B flight categories have distinct original silhouettes", () => {
 const ogn = [1,2,3,5,6,7,8,9,11,12,13].map(ogn_category => aircraftPresentation.aircraftStyle({ogn_category}));
 assert.equal(new Set(ogn.map(c=>c.path)).size,ogn.length);
 const adsb = ['A1','A2','A3','A4','A5','A6','A7','B1','B2','B3','B4','B6','B7'].map(emitter_category => aircraftPresentation.aircraftStyle({emitter_category}));
 assert.equal(new Set(adsb.map(c=>c.path)).size,adsb.length);
 assert.equal(aircraftPresentation.aircraftStyle({emitter_category:'A7'}).key,'helicopter');
 assert.equal(aircraftPresentation.aircraftStyle({emitter_category:'B1'}).key,'glider');
 assert.equal(aircraftPresentation.aircraftStyle({ogn_category:1,emitter_category:'A3'}).key,'glider');
 for (const emitter_category of ['A0','B0','B5','C1','garbage',undefined]) {
  assert.equal(aircraftPresentation.aircraftStyle({emitter_category}).key,'unknown');
 }
});
test("aircraft marker rotates north-facing silhouettes and treats provider labels as text", () => {
 const label='<img src=x onerror=alert(1)>';
 const marker=aircraftPresentation.aircraftMarker({ogn_category:1,course_deg:90},label);
 assert.equal(marker.dataset.aircraftCategory,'glider');
 assert.equal(marker.children[0].style.transform,'rotate(90deg)');
 assert.equal(marker.children[1].textContent,label);
 assert.equal(marker.children[0].attrs['aria-hidden'],'true');
 assert.equal(aircraftPresentation.aircraftMarker({ogn_category:11,course_deg:90},'').children[0].style.transform,undefined);
 assert.equal(aircraftPresentation.aircraftMarker({ogn_category:1,course_deg:NaN},'').children[0].style.transform,undefined);
});


test("switching to temperature recovers a filter without temperature stations", () => {
  const nodes = model.toMapNodes([
    sensor([reading("temperature")]),
    sensor([reading("soil_temperature")], { id: "soil" }),
    sensor([reading("traffic_total_hourly", 20, "count")], { id: "traffic" }),
  ]);
  const categories = model.categoriesForMode(nodes, ["traffic"], "temperature");
  assert.ok(categories.includes("weather"));
  assert.ok(categories.includes("soil"));
  assert.equal(model.visibleNodes(nodes, categories, "temperature").length, 2);
  const selected = ["soil"];
  assert.equal(model.categoriesForMode(nodes, selected, "temperature"), selected);
  assert.equal(model.categoriesForMode(nodes, selected, "category"), selected);
  assert.equal(model.categoriesForMode([], selected, "temperature"), selected);
});

test("BORIS polygon popups expose original price units and historical reference date", () => {
  const element = () => ({ children: [], textContent: "", style: { setProperty() {} },
    append(...children) { this.children.push(...children); }, setAttribute() {} });
  const context = { exports: {}, document: { createElement: element }, Date, Set, Number, JSON };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/mapPresentation.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const card = context.exports.featureCard("boris", { land_value_eur_sqm: 4.7,
    stichtag: "2024-01-01", zone_code: "30190200", zone_type: "LW", development_status: "LF" });
  const text = node => [node.textContent, ...node.children.map(text)].join(" ");
  assert.match(text(card), /Bodenrichtwert: 4,7 €\/m²/);
  assert.match(text(card), /Historischer Stichtag: 2024-01-01/);
  assert.match(text(card), /Original-Nutzungscode: LW/);
  assert.match(text(card), /kein aktueller Immobilienverkaufspreis/);
});
