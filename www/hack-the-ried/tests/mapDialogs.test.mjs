import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
class Element {
  constructor(text) { this.text = text; }
  isEqualNode(other) { return this.text === other.text; }
}
const context = { exports: {}, HTMLElement: Element };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/mapDialogs.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
test("polling preserves dialog DOM while changed readings still update", () => {
  let popup, tooltip;
  let popupUpdates = 0, tooltipUpdates = 0;
  const marker = {
    getPopup: () => popup && { getContent: () => popup },
    getTooltip: () => tooltip && { getContent: () => tooltip },
    bindPopup: (content, options) => { popup = content; assert.equal(options.autoPan, false); },
    bindTooltip: (content, options) => { tooltip = content; assert.equal(options.direction, "top"); },
    setPopupContent: content => { popup = content; popupUpdates++; },
    setTooltipContent: content => { tooltip = content; tooltipUpdates++; },
  };
  const update = (detail = "speed 30", title = "Bus") => context.exports.updateMarkerDialogs(marker, new Element(detail), new Element(title));
  update();
  const originalPopup = popup, originalTooltip = tooltip;
  for (let i = 0; i < 60; i++) update();
  assert.equal(popup, originalPopup);
  assert.equal(tooltip, originalTooltip);
  assert.equal(popupUpdates, 0);
  assert.equal(tooltipUpdates, 0);
  update("speed 40");
  assert.equal(popupUpdates, 1);
  assert.equal(tooltipUpdates, 0);
  update("speed 40", "Bus delayed");
  assert.equal(popupUpdates, 1);
  assert.equal(tooltipUpdates, 1);
});
