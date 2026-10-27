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
  URLSearchParams: globalThis.URLSearchParams,
};
vm.runInNewContext(
  ts.transpileModule(statsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  statsContext
);
const regionalStats = statsContext.exports;

test("BASELINE_EVENTS covers all 4 core Ried municipalities with authentic events", () => {
  const events = regionalStats.BASELINE_EVENTS;
  assert.ok(events.length >= 10, "Expected comprehensive event catalog");

  const municipalities = new Set(events.map((e) => e.municipality));
  assert.ok(municipalities.has("Bürstadt"), "Must include Bürstadt");
  assert.ok(municipalities.has("Lampertheim"), "Must include Lampertheim");
  assert.ok(municipalities.has("Biblis"), "Must include Biblis");
  assert.ok(municipalities.has("Groß-Rohrheim"), "Must include Groß-Rohrheim");
});

test("BASELINE_EVENTS contains authentic festivals, stage acts and KAMÜ events", () => {
  const events = regionalStats.BASELINE_EVENTS;

  // Major traditional festivals
  const kerwe = events.find((e) => e.title.includes("Bürstädter Kerwe"));
  assert.ok(kerwe, "Must include Bürstädter Kerwe");
  assert.equal(kerwe.category, "festival");
  assert.equal(kerwe.is_free, true);

  const spargelfest = events.find((e) => e.title.includes("Lampertheimer Spargelfest"));
  assert.ok(spargelfest, "Must include Lampertheimer Spargelfest");
  assert.equal(spargelfest.status, "past");

  const gurkenfest = events.find((e) => e.title.includes("Bibliser Gurkenfest"));
  assert.ok(gurkenfest, "Must include Bibliser Gurkenfest");

  const rohremerKerb = events.find((e) => e.title.includes("Rohremer Kerb"));
  assert.ok(rohremerKerb, "Must include Rohremer Kerb");

  // Stage comedy & concert
  const chako = events.find((e) => e.title.includes("CHAKO"));
  assert.ok(chako, "Must include Chako Habekost at Bürgerhaus Bürstadt");
  assert.equal(chako.category, "theater");
  assert.equal(chako.is_free, false);

  const irishDance = events.find((e) => e.title.includes("Irish Dance"));
  assert.ok(irishDance, "Must include Dance Masters at Hans-Pfeiffer-Halle");

  // KAMÜ spotlight
  const kamue = events.find((e) => e.organizer === "KAMÜ Kulturzentrum");
  assert.ok(kamue, "Must include KAMÜ Kulturzentrum");
});

test("all event URLs are valid and do not have broken placeholder subpaths", () => {
  const events = regionalStats.BASELINE_EVENTS;
  for (const evt of events) {
    const url = evt.ticket_url || evt.event_url;
    if (url) {
      assert.doesNotThrow(() => new URL(url), `${evt.title} must have a valid URL`);
      assert.ok(!url.includes("/events/hackathon-kickoff"), "No broken placeholder paths");
      assert.ok(!url.includes("kamue.me/tickets"), "No fake ticket paths");
    }
  }
});

// Fetch failure and empty-state contracts are tested in collectedData.test.mjs.

test("generateIcsCalendar produces valid RFC 5545 calendar format", () => {
  const event = regionalStats.BASELINE_EVENTS.find((e) => e.title.includes("Bürstädter Kerwe"));
  assert.ok(event, "Bürstädter Kerwe event exists");

  const ics = regionalStats.generateIcsCalendar(event);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"), "Starts with BEGIN:VCALENDAR");
  assert.ok(ics.includes("VERSION:2.0"), "Includes VERSION:2.0");
  assert.ok(ics.includes(`SUMMARY:${event.title}`), "Includes SUMMARY");
  assert.ok(ics.includes(`LOCATION:${event.venue_name}`), "Includes LOCATION");
  assert.ok(ics.includes("DTSTART:"), "Includes DTSTART");
  assert.ok(ics.endsWith("END:VCALENDAR"), "Ends with END:VCALENDAR");
});

test("generateGoogleCalendarUrl produces valid Google Calendar web link", () => {
  const event = regionalStats.BASELINE_EVENTS.find((e) => e.title.includes("Bürstädter Kerwe"));
  assert.ok(event, "Bürstädter Kerwe event exists");

  const gcalUrl = regionalStats.generateGoogleCalendarUrl(event);
  assert.ok(gcalUrl.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE"), "Correct Google Calendar URL prefix");
  assert.ok(gcalUrl.includes("text="), "Includes text parameter");
  assert.ok(gcalUrl.includes("dates="), "Includes dates parameter");
  assert.ok(gcalUrl.includes("location="), "Includes location parameter");
  assert.doesNotThrow(() => new URL(gcalUrl), "Produces a syntactically valid URL");
});

test("BASELINE_EVENTS contains both scheduled upcoming events and archived past events", () => {
  const events = regionalStats.BASELINE_EVENTS;
  const pastEvents = events.filter((e) => e.status === "past");
  const upcomingEvents = events.filter((e) => e.status === "scheduled");

  assert.ok(pastEvents.length >= 5, `Expected at least 5 archived past events, got ${pastEvents.length}`);
  assert.ok(upcomingEvents.length >= 10, `Expected at least 10 upcoming scheduled events, got ${upcomingEvents.length}`);

  // Test geographical coordinates and expected visitors for sensor correlation
  const eventsWithCoords = events.filter((e) => typeof e.latitude === "number" && typeof e.longitude === "number");
  assert.ok(eventsWithCoords.length >= 10, "Multiple events should have geo coordinates for spatial mapping");

  const majorEvents = events.filter((e) => (e.expected_visitors || 0) > 1000);
  assert.ok(majorEvents.length >= 4, "Major festivals have visitor estimates for environmental correlation");
});


test("cancelled event export preserves the cancellation for personal calendars", () => {
  const event = { ...regionalStats.BASELINE_EVENTS[0], status: "cancelled" };
  const ics = regionalStats.generateIcsCalendar(event);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.doesNotMatch(ics, /STATUS:CONFIRMED/);
});
