import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const context = { exports: {}, require: createRequire(import.meta.url) };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(new URL("../app/termine/RegularOffers.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText, context);
const RegularOffers = context.exports.default;
const offer = { id: "tv-lauftreff", title: "TV-Lauftreff", organizer: "TV Groß-Rohrheim", municipality: "Groß-Rohrheim", weekday: "Mittwoch", start_local: "19:00", venue_name: "Eingang Bürgerhalle, Groß-Rohrheim", description: "Endzeit und Kosten nicht veröffentlicht.", source_url: "https://tv-grossrohrheim.de/angebot/lauftreff/" };

test("weekly offer shows time, local meeting place and original source without dated occurrences", () => {
  const html = renderToStaticMarkup(RegularOffers({ offers: [offer], unavailable: false }));
  assert.match(html, /Mittwoch, 19:00 Uhr/);
  assert.match(html, /Eingang Bürgerhalle, Groß-Rohrheim/);
  assert.match(html, /href="https:\/\/tv-grossrohrheim.de\/angebot\/lauftreff\/"/);
  assert.match(html, /Endzeit und Kosten nicht veröffentlicht/);
  assert.doesNotMatch(html, /2026|\.ics|kostenlos/);
});

test("unavailable publication displays status instead of a fallback offer", () => {
  const html = renderToStaticMarkup(RegularOffers({ offers: [], unavailable: true }));
  assert.match(html, /role="status"/);
  assert.match(html, /derzeit nicht abrufbar/);
  assert.doesNotMatch(html, /TV-Lauftreff|keine regelmäßigen Angebote/);
});

test("published course end times are shown while running offers retain unknown ends", () => {
  const html = renderToStaticMarkup(RegularOffers({ offers: [{ ...offer, id: "dance", title: "Line Dance", start_local: "18:30", end_local: "19:30" }, offer], unavailable: false }));
  assert.match(html, /18:30–19:30 Uhr/);
  assert.match(html, /Mittwoch, 19:00 Uhr/);
  assert.doesNotMatch(html, /19:00–/);
});
