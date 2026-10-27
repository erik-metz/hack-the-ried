import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Transpile mapData.ts first
const mapDataSource = fs.readFileSync(new URL("../lib/mapData.ts", import.meta.url), "utf8");
const mapDataContext = { exports: {}, Date, Set, Number, JSON, Math, String, Object, Array, RegExp };
vm.runInNewContext(
  ts.transpileModule(mapDataSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  mapDataContext
);
const mapData = mapDataContext.exports;

// Transpile urlState.ts
const urlStateSource = fs.readFileSync(new URL("../lib/urlState.ts", import.meta.url), "utf8");
const urlStateContext = {
  exports: {},
  require: (id) => {
    if (id === "./mapData" || id.endsWith("mapData")) return mapData;
    throw new Error(`Cannot find module '${id}'`);
  },
  Date,
  Set,
  Number,
  JSON,
  Math,
  String,
  Object,
  Array,
  RegExp,
};
vm.runInNewContext(
  ts.transpileModule(urlStateSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  urlStateContext
);
const urlState = urlStateContext.exports;

// Transpile mapPresets.ts
const mapPresetsSource = fs.readFileSync(new URL("../lib/mapPresets.ts", import.meta.url), "utf8");
const mapPresetsContext = {
  exports: {},
  require: (id) => {
    if (id === "./urlState" || id.endsWith("urlState")) return urlState;
    if (id === "./mapData" || id.endsWith("mapData")) return mapData;
    throw new Error(`Cannot find module '${id}'`);
  },
  Date,
  Set,
  Number,
  JSON,
  Math,
  String,
  Object,
  Array,
  Boolean,
  RegExp,
};
vm.runInNewContext(
  ts.transpileModule(mapPresetsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  mapPresetsContext
);
const mapPresets = mapPresetsContext.exports;

test("mapPresets covers all 32 MAP_LAYER_IDS with definitions and categories", () => {
  assert.equal(urlState.MAP_LAYER_IDS.length, 32);
  for (const layerId of urlState.MAP_LAYER_IDS) {
    const def = mapPresets.LAYER_DEFINITIONS[layerId];
    assert.ok(def, `Layer definition missing for ${layerId}`);
    assert.equal(def.id, layerId);
    assert.ok(def.label);
    assert.ok(def.icon);
    assert.ok(def.description);
    assert.ok(["mobility", "environment", "infrastructure", "planning"].includes(def.category));
  }
});

test("mapPresets covers 4 categories with valid items", () => {
  const mobility = mapPresets.getLayersByCategory("mobility");
  const environment = mapPresets.getLayersByCategory("environment");
  const infrastructure = mapPresets.getLayersByCategory("infrastructure");
  const planning = mapPresets.getLayersByCategory("planning");

  assert.equal(mobility.length, 11);
  assert.equal(environment.length, 8);
  assert.equal(infrastructure.length, 6);
  assert.equal(planning.length, 7);
  assert.equal(mobility.length + environment.length + infrastructure.length + planning.length, 32);
});

test("mapPresets defines all presets with full layer dictionaries", () => {
  for (const presetId of mapPresets.PRESET_IDS) {
    const preset = mapPresets.LAYER_PRESETS[presetId];
    assert.ok(preset);
    assert.equal(preset.id, presetId);
    for (const layerId of urlState.MAP_LAYER_IDS) {
      assert.equal(typeof preset.layers[layerId], "boolean", `Preset ${presetId} missing layer ${layerId}`);
    }
  }
});

test("detectActivePreset identifies default and custom states", () => {
  assert.equal(mapPresets.detectActivePreset(urlState.DEFAULT_MAP_LAYERS), "default");

  const sensorsOnlyLayers = mapPresets.LAYER_PRESETS.sensors_only.layers;
  assert.equal(mapPresets.detectActivePreset(sensorsOnlyLayers), "sensors_only");

  const mobilityLayers = mapPresets.LAYER_PRESETS.mobility.layers;
  assert.equal(mapPresets.detectActivePreset(mobilityLayers), "mobility");

  // Custom modification
  const custom = { ...urlState.DEFAULT_MAP_LAYERS, boris: true };
  assert.equal(mapPresets.detectActivePreset(custom), "custom");
});

test("countActiveLayers and countCategoryActiveLayers compute accurate numbers", () => {
  const allActive = Object.fromEntries(urlState.MAP_LAYER_IDS.map((id) => [id, true]));
  assert.equal(mapPresets.countActiveLayers(allActive), 32);

  const noneActive = Object.fromEntries(urlState.MAP_LAYER_IDS.map((id) => [id, false]));
  assert.equal(mapPresets.countActiveLayers(noneActive), 0);

  const mobilityCounts = mapPresets.countCategoryActiveLayers("mobility", mapPresets.LAYER_PRESETS.mobility.layers);
  assert.equal(mobilityCounts.total, 11);
  assert.equal(mobilityCounts.active, 11);
});

test("LAYER_MIN_ZOOM and LAYER_DEFINITIONS minZoom correctly configure all 32 layers", () => {
  assert.ok(mapPresets.LAYER_MIN_ZOOM);
  for (const layerId of urlState.MAP_LAYER_IDS) {
    const minZoom = mapPresets.LAYER_MIN_ZOOM[layerId];
    assert.equal(typeof minZoom, "number", `LAYER_MIN_ZOOM missing for ${layerId}`);
    assert.ok(minZoom >= 8 && minZoom <= 19, `LAYER_MIN_ZOOM out of bounds for ${layerId}`);
    assert.equal(mapPresets.LAYER_DEFINITIONS[layerId].minZoom, minZoom);
  }
});

test("SENSOR_CATEGORY_MIN_ZOOM specifies valid zoom thresholds for all categories", () => {
  assert.ok(mapData.SENSOR_CATEGORY_MIN_ZOOM);
  for (const catId of mapData.CATEGORY_IDS) {
    const minZoom = mapData.SENSOR_CATEGORY_MIN_ZOOM[catId];
    assert.equal(typeof minZoom, "number", `SENSOR_CATEGORY_MIN_ZOOM missing for ${catId}`);
    assert.ok(minZoom >= 8 && minZoom <= 19, `SENSOR_CATEGORY_MIN_ZOOM out of bounds for ${catId}`);
  }
});


test("raster and context overlays restrict their overview by zoom", () => {
  for (const id of urlState.MAP_LAYER_IDS) {
    for (let zoom = 8; zoom <= 19; zoom++) {
      assert.equal(mapPresets.isLayerZoomRestricted(id, zoom),
        (["starkregen", "lora", "landcover", "floodrisk", "census", "monitoring", "nature", "charging", "warnings"].includes(id)) && zoom < mapPresets.LAYER_MIN_ZOOM[id],
        `${id} at zoom ${zoom}`);
    }
  }
});
