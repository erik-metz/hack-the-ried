import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const icons = await import("lucide-react");
const context = { exports: {}, require: (id) => id === "lucide-react" ? icons : require(id) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../app/components/OfficialStatisticsClient.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
for (const count of [1, 4]) {
  test(`preserve source markers, zero and reference period in ${count}-record view`, () => {
    const html = renderToStaticMarkup(React.createElement(context.exports.default, {
      domain: "social", title: "Amtliche Tabellen",
      data: { edition: "2030", publication_month: "November 2030", source_url: "https://example.org/source.xlsx", tables: [{
        id: "19", title: "Kommunales Personal am 30. Juni 2029",
        records: Array.from({ length: count }, (_, index) => ({ municipality_id: String(index), name: `Kommune ${index}`, values: [
          { label: "Beschäftigte (Anzahl)", value: null, source_marker: "gesperrt", cell: `A${index}` },
          { label: "Nullwert", value: 0, source_marker: null, cell: `B${index}` },
        ] })),
      }] },
    }));
    assert.match(html, /gesperrt/);
    assert.match(html, /30\. Juni 2029/);
    assert.match(html, /November 2030/);
    assert.match(html, />0</);
    assert.doesNotMatch(html, /31\.12\.2024|Rechnungsergebnis 2024|Erhebung 2024/);
  });
}

test("missing and zero values do not receive a positive comparison bar", () => {
  const html = renderToStaticMarkup(React.createElement(context.exports.default, {
    domain: "social", title: "Vergleich",
    data: { edition: "2025", publication_month: "2025", source_url: "https://example.org", tables: [{
      id: "19", title: "Personal", records: [100, null, 0].map((value, index) => ({
        municipality_id: String(index), name: String(index), values: [{ label: "Anzahl", value, source_marker: null, cell: String(index) }],
      })),
    }] },
  }));
  assert.equal((html.match(/style="width:0%"/g) ?? []).length, 2);
});
