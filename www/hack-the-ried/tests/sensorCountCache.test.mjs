import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/sensorCountCache.ts", import.meta.url), "utf8");
function load(storage = new Map(), blocked = false) {
  const events = new Map();
  const context = { exports: {}, window: {
    localStorage: {
      getItem(key) { if (blocked) throw Error("blocked"); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error("blocked"); storage.set(key, value); },
    },
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name) => events.delete(name),
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { ...context.exports, events };
}

test("successful count persists across page reloads, including zero", () => {
  const storage = new Map();
  const cache = load(storage);
  assert.equal(cache.readSensorCount(), undefined);
  cache.saveSensorCount(42);
  assert.equal(load(storage).readSensorCount(), 42);
  cache.saveSensorCount(0);
  assert.equal(load(storage).readSensorCount(), 0);
});

test("invalid data cannot replace the last successful count", () => {
  const storage = new Map();
  const cache = load(storage);
  cache.saveSensorCount(42);
  for (const value of [undefined, null, -1, 1.5, NaN, Infinity, "7"]) cache.saveSensorCount(value);
  assert.equal(cache.readSensorCount(), 42);
  storage.set("hack-the-ried:sensor-count:v1", "broken");
  assert.equal(cache.readSensorCount(), 42);
  assert.equal(load(storage).readSensorCount(), undefined);
});

test("disabled storage keeps count during navigation and notifies subscribers", () => {
  const cache = load(new Map(), true);
  let notifications = 0;
  const unsubscribe = cache.subscribeSensorCount(() => notifications++);
  cache.saveSensorCount(12);
  assert.equal(cache.readSensorCount(), 12);
  assert.equal(notifications, 1);
  cache.events.get("storage")({ key: "unrelated" });
  assert.equal(notifications, 1);
  cache.events.get("storage")({ key: "hack-the-ried:sensor-count:v1" });
  assert.equal(notifications, 2);
  unsubscribe();
  cache.saveSensorCount(13);
  assert.equal(notifications, 2);
});
