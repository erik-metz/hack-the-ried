import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// 1. Load mapData
const mapSource = fs.readFileSync(new URL("../lib/mapData.ts", import.meta.url), "utf8");
const mapContext = { exports: {}, Date, Set, Number, JSON, Math, Array, Object };
vm.runInNewContext(
  ts.transpileModule(mapSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  mapContext
);
const mapData = mapContext.exports;

// 2. Load regionalStats
const statsSource = fs.readFileSync(new URL("../lib/regionalStats.ts", import.meta.url), "utf8");
const statsContext = {
  exports: {},
  require: (id) => {
    if (id === "./collectedBackend") return { collectedFetch: globalThis.fetch };
    if (id === "@/env") return { env: { BACKEND_API_URL: "http://localhost:8000" } };
    if (id === "./mapData") return mapData;
    throw new Error(`Unknown require in test context: ${id}`);
  },
  Date,
  Set,
  Number,
  JSON,
  Math,
  Array,
  Object,
  fetch: globalThis.fetch,
  AbortSignal: globalThis.AbortSignal,
  URL: globalThis.URL,
};
vm.runInNewContext(
  ts.transpileModule(statsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  statsContext
);
const regionalStats = statsContext.exports;

test("BASELINE_SOCIAL_SUMMARIES covers Bürstadt, Lampertheim, Biblis, and Bergstraße benchmarks", () => {
  const summaries = regionalStats.BASELINE_SOCIAL_SUMMARIES;
  assert.ok(summaries.length >= 4, "Expected at least 4 municipality profiles");

  const bst = summaries.find((s) => s.municipality === "Bürstadt");
  const la = summaries.find((s) => s.municipality === "Lampertheim");
  const bib = summaries.find((s) => s.municipality === "Biblis");

  assert.ok(bst, "Bürstadt must be present");
  assert.ok(la, "Lampertheim must be present");
  assert.ok(bib, "Biblis must be present");

  assert.ok(bst.unemployment_rate > 2 && bst.unemployment_rate < 8, "Bürstadt unemployment rate realistic");
  assert.ok(bst.gp_doctors_per_10k > 0, "Bürstadt must have GP doctors per 10k");
  assert.ok(bst.total_clubs_count >= 50, "Bürstadt must have active clubs count");
  assert.ok(bst.recycling_rate_percent > 60, "Bürstadt must have high recycling rate");

  assert.ok(la.unemployment_rate > 2 && la.unemployment_rate < 8, "Lampertheim unemployment rate realistic");
  assert.ok(la.pharmacies_count >= 5, "Lampertheim must have pharmacies");
});

test("BASELINE_WASTE_STATS covers all key waste fractions and recycling rates > 65%", () => {
  const waste = regionalStats.BASELINE_WASTE_STATS;
  assert.ok(waste.length >= 12, "Expected waste stream breakdown across municipalities");

  const bstWaste = waste.filter((w) => w.municipality === "Bürstadt");
  const fractions = new Set(bstWaste.map((w) => w.fraction));

  assert.ok(fractions.has("restmuell"), "Must include Restmüll");
  assert.ok(fractions.has("biomuell"), "Must include Biomüll");
  assert.ok(fractions.has("papier"), "Must include Papier");
  assert.ok(fractions.has("wertstoffe"), "Must include Wertstoffe");
  assert.ok(fractions.has("total"), "Must include Total");

  const total = bstWaste.find((w) => w.fraction === "total");
  assert.ok(total && total.recycling_rate_percent >= 65, "Recycling rate should exceed 65%");
  assert.ok(total && total.kg_per_capita > 300, "Total waste per capita realistic");
});

test("BASELINE_FACILITIES includes healthcare, KAMÜ culture center, sports and tourism", () => {
  const facs = regionalStats.BASELINE_FACILITIES;
  assert.ok(facs.length >= 10, "Expected at least 10 regional facilities");

  const kamue = facs.find((f) => f.id === "fac-kamue-kulturzentrum");
  assert.ok(kamue, "Must include KAMÜ Kulturzentrum");
  assert.equal(kamue.category, "culture_sports");
  assert.ok(kamue.extra_attributes?.is_kamue_hub, "Must flag KAMÜ hub");

  const notdienst = facs.filter((f) => f.category === "healthcare" && f.extra_attributes?.emergency_duty);
  assert.ok(notdienst.length >= 2, "Must include pharmacies with emergency duty status");

  const lorsch = facs.find((f) => f.id === "fac-tour-kloster-lorsch");
  assert.ok(lorsch, "Must include UNESCO Kloster Lorsch");
  assert.equal(lorsch.category, "tourism");

  const biedensand = facs.find((f) => f.id === "fac-tour-biedensand");
  assert.ok(biedensand, "Must include Naturschutzgebiet Biedensand");

  for (const f of facs) {
    assert.ok(f.latitude >= 49.5 && f.latitude <= 49.8, `${f.name} latitude within Ried bounding box`);
    assert.ok(f.longitude >= 8.35 && f.longitude <= 8.65, `${f.name} longitude within Ried bounding box`);
  }
});

test("facilitiesToStationNodes correctly maps categories and emergency duty readings", () => {
  const nodes = regionalStats.facilitiesToStationNodes(regionalStats.BASELINE_FACILITIES);
  assert.equal(nodes.length, regionalStats.BASELINE_FACILITIES.length);

  const kamueNode = nodes.find((n) => n.id === "fac-kamue-kulturzentrum");
  assert.ok(kamueNode, "KAMÜ node must exist");
  assert.equal(kamueNode.categories[0], "culture");

  const notdienstApo = nodes.find((n) => n.id === "fac-apo-bst-nibelungen");
  assert.ok(notdienstApo, "Notdienst pharmacy node must exist");
  assert.equal(notdienstApo.categories[0], "healthcare");
  const reading = notdienstApo.readings.find((r) => r.metric === "emergency_duty");
  assert.ok(reading, "Emergency duty reading must be mapped");
  assert.equal(reading.value, 1);
});

test("DEFAULT_FACILITIES_NODES and mergeDefaultFacilities in mapData seamlessly enrich map inventory", () => {
  const merged = mapData.mergeDefaultFacilities([]);
  assert.ok(merged.length >= 10, "Default facilities must be populated into empty inventory");

  const existing = [{ id: "fac-kamue-kulturzentrum", name: "Existing KAMÜ", categories: ["culture"], readings: [] }];
  const deduplicated = mapData.mergeDefaultFacilities(existing);
  const kamueCount = deduplicated.filter((n) => n.id === "fac-kamue-kulturzentrum").length;
  assert.equal(kamueCount, 1, "Existing node must not be duplicated");

  assert.ok(mapData.CATEGORY_IDS.includes("healthcare"), "healthcare in CATEGORY_IDS");
  assert.ok(mapData.CATEGORY_IDS.includes("culture"), "culture in CATEGORY_IDS");
  assert.ok(mapData.CATEGORY_IDS.includes("tourism"), "tourism in CATEGORY_IDS");
});

test("BASELINE_EVENTS contains upcoming regional events with KAMÜ Kulturzentrum", () => {
  const events = regionalStats.BASELINE_EVENTS;
  assert.ok(events.length >= 4, "Expected at least 4 upcoming events");

  const kamueEvent = events.find((e) => e.organizer === "KAMÜ Kulturzentrum");
  assert.ok(kamueEvent, "Must contain events hosted by KAMÜ");
  assert.ok(kamueEvent.title.includes("Hackathon") || kamueEvent.title.includes("Acoustic"), "Relevant event title");
});
