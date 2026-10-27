import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("SiteFooter keeps the bottom navigation", () => {
  const footerSource = fs.readFileSync(
    new URL("../app/components/SiteFooter.tsx", import.meta.url),
    "utf8"
  );
  for (const href of ["/", "/regionalatlas", "/daten", "/quellen"]) {
    assert.ok(footerSource.includes(`href="${href}"`));
  }
});

test("All 8 public & admin pages render the unified SiteFooter", () => {
  const pages = [
    "../app/page.tsx",
    "../app/daten/page.tsx",
    "../app/regionalatlas/page.tsx",
    "../app/demografie/page.tsx",
    "../app/wirtschaft/page.tsx",
    "../app/haushalt/page.tsx",
    "../app/statistik/page.tsx",
    "../app/bauen-wohnen/page.tsx",
    "../app/admin/AdminClientGate.tsx",
    "../app/quellen/page.tsx",
  ];

  for (const pageRel of pages) {
    const pageSource = fs.readFileSync(new URL(pageRel, import.meta.url), "utf8");
    assert.ok(
      pageSource.includes("<SiteFooter") || pageSource.includes("<SiteFooter />"),
      `Page ${pageRel} must render <SiteFooter />`
    );
  }
});

test("Quellen page renders collected status without invented totals", () => {
  const source = fs.readFileSync(new URL("../app/quellen/page.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('proxyBackend("collection/status", 30)'));
  assert.ok(source.includes('sources.map'));
  assert.ok(source.includes('source.last_success_at'));
  assert.ok(source.includes('source.interval_seconds'));
  assert.ok(source.includes('nicht erreichbar'));
  assert.doesNotMatch(source, /345\.600|475\.000|14\.500/);
});

// Exercise the status interpretation against representative collector reports.
const { default: ts } = await import("typescript");
const { default: vm } = await import("node:vm");
const compiled = ts.transpileModule(fs.readFileSync(new URL("../app/quellen/sourceStatus.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exported = {};
vm.runInNewContext(compiled, { exports: exported, URL, Date, Intl });
const now = Date.parse("2026-10-07T10:00:00Z");
const report = (overrides = {}) => ({
  source_id: "emf", source_url: "https://example.org", enabled: true,
  status: "success", received_at: "2026-10-07T09:59:00Z", interval_seconds: 300,
  processed_at: "2026-10-07T09:59:01Z", completion_recorded: true,
  item_count: 425, item_count_unit: "sites", ...overrides,
});

test("Only completed imports count as confirmed processing", () => {
  assert.equal(exported.getSourceStatus(report(), now).label, "Erfolgreich verarbeitet");
  assert.equal(exported.formatItemCount(report()), "425 Standorte");
  assert.equal(exported.formatItemCount(report({ item_count: 282, item_count_unit: "gateways" })), "282 Gateways");
  assert.equal(exported.getSourceStatus(report({ processed_at: null, last_success_at: "2026-10-07T09:59:00Z" }), now).group, "attention");
  assert.equal(exported.getSourceStatus(report({ status: "received", http_status: 200 }), now).label, "Verarbeitung offen");
  assert.equal(exported.getSourceStatus(report({ completion_recorded: false }), now).group, "attention");
});

test("Partial results and zero counts never appear as full success", () => {
  const partial = report({ status: "partial", item_count: 0, error: "No usable regional observations produced" });
  assert.equal(exported.getSourceStatus(partial, now).tone, "warning");
  assert.match(exported.getSourceStatus(partial, now).description, /keine verwertbaren/);
  assert.equal(exported.formatItemCount(partial), "0 Standorte");
  assert.equal(exported.formatItemCount(report({ item_count: null })), "Datenmenge nicht gemeldet");
  assert.equal(exported.formatItemCount(report({ item_count: -1 })), "Datenmenge nicht gemeldet");
  assert.equal(exported.getSourceStatus(report({ item_count: 0 }), now).group, "attention");
  assert.doesNotMatch(exported.getSourceStatus(report({ status: "partial", error: "some details unavailable" }), now).description, /Versuch ist fehlgeschlagen/);
});

test("Provider access failures are distinguished from local database failures", () => {
  assert.equal(exported.getSourceStatus(report({ status: "failed", error: "HTTP 401" }), now).label, "Abruffehler");
  assert.equal(exported.getSourceStatus(report({ status: "failed", http_status: 200, error: "ForeignKeyViolation" }), now).label, "Speicherfehler");
  assert.equal(exported.getSourceStatus(report({ status: "failed", error_stage: "processing" }), now).label, "Verarbeitungsfehler");
});

test("Inactive and planned sources are separate from failures", () => {
  const inactive = report({ status: "not_configured", enabled: false, received_at: "2020-01-01" });
  assert.equal(exported.getSourceStatus(inactive, now).group, "inactive");
  assert.equal(exported.getSourceStatus(inactive, now).stale, false);
  assert.equal(exported.isPlaceholderSource(report({ source_id: "economy-published-source", enabled: false })), true);
  assert.equal(exported.isPlaceholderSource(report({ source_id: "economy-published-source", enabled: true })), false);
  assert.match(exported.getSourceStatus(report({ source_id: "aisstream-rhein" }), now).description, /vollständige Abdeckung.*nicht/);
});

test("Freshness follows the configured interval with a grace period", () => {
  for (const [interval, threshold] of [[15, 75], [300, 600], [86400, 172800], [604800, 1209600]]) {
    const base = report({ interval_seconds: interval, received_at: new Date(now - threshold * 1000).toISOString() });
    assert.equal(exported.isSourceStale(base, now), false);
    assert.equal(exported.isSourceStale(base, now + 1000), true);
  }
  assert.equal(exported.isSourceStale(report({ interval_seconds: null }), now), false);
  assert.equal(exported.isSourceStale(report({ received_at: "invalid" }), now), false);
  const rows = [report(), report({ status: "failed" }), report({ status: "received" }), report({ enabled: false })];
  assert.deepEqual(JSON.parse(JSON.stringify(exported.summarizeSources(rows, now))), { success: 1, attention: 1, unknown: 1, inactive: 1 });
});

test("Invalid responses and unsafe provider links are rejected", () => {
  assert.equal(exported.parseSourcesResponse({ sources: [report(), report()] }), null);
  assert.equal(exported.parseSourcesResponse({ sources: [{ source_id: "broken" }] }), null);
  assert.equal(exported.parseSourcesResponse({ sources: [] }).length, 0);
  assert.equal(exported.safeSourceUrl("javascript:alert(1)"), null);
  assert.equal(exported.safeSourceUrl("https://user:password@example.org"), null);
  assert.equal(exported.safeSourceUrl("https://example.org"), "https://example.org/");
  assert.equal(exported.formatTimestamp("invalid"), "Nicht gemeldet");
  assert.match(exported.formatTimestamp("2026-10-07T10:00:00Z"), /12:00:00/);
  assert.equal(exported.formatInterval(86400), "Jeden Tag");
});
