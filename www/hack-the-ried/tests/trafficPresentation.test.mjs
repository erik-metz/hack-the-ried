import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(new URL("../lib/trafficPresentation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { trafficFeatureVisible, corridorLabel } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("map excludes planned, historical and stale traffic in every category", () => {
  for (const category of ["all", "warning", "roadworks", "closure"]) {
    for (const event_status of ["planned", "ended", "resolved"]) {
      assert.equal(trafficFeatureVisible({ event_status, source_category: category }, category), false);
    }
    assert.equal(trafficFeatureVisible({ kind: "corridor", is_stale: true }, category), false);
  }
  assert.equal(trafficFeatureVisible({ kind: "corridor" }, "closure"), true);
  assert.equal(trafficFeatureVisible({ event_status: "active", source_category: "roadworks" }, "roadworks"), true);
  assert.equal(trafficFeatureVisible({ event_status: "active", source_category: "roadworks" }, "closure"), false);
  assert.equal(trafficFeatureVisible({ closure_type: "partial" }, "all"), true);
});
test("unknown values do not become zero-minute delays or full closures", () => {
  assert.equal(corridorLabel("unknown", null), "⚪ Unbekannt");
  assert.equal(corridorLabel("sluggish", null), "🟡 Einschränkung");
  assert.equal(corridorLabel("closure", null), "⛔ Gesperrt");
  assert.equal(corridorLabel("congestion", 15), "🔴 +15 Min.");
  assert.match(corridorLabel("clear", null), /Keine Störung gemeldet/);
});
