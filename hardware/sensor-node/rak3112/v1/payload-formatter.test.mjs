import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./payload-formatter.js", import.meta.url), "utf8");
const context = vm.createContext({ Set });
vm.runInContext(source, context);
const decode = context.decodeUplink;

const record = (code, value) => {
  const bytes = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  return [code, ...bytes];
};

test("decodes every known metric in a version 3 TLV payload", () => {
  const result = decode({ fPort: 10, bytes: [3,
    ...record(1, -125), ...record(2, 503), ...record(3, 725), ...record(4, 420)],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "temperature", unit: "°C", value: -12.5 },
    { metric: "humidity", unit: "%", value: 50.3 },
    { metric: "uv_index", unit: "index", value: 7.25 },
    { metric: "co2", unit: "ppm", value: 420 },
  ]);
});

test("keeps unknown metric codes and raw values visible", () => {
  const result = decode({ bytes: [3, ...record(99, 1234), ...record(1, 180)] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.unknown_measurements)), [
    { code: 99, raw_value: 1234 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "metric_99", unit: "raw", value: 1234 },
    { metric: "temperature", unit: "°C", value: 18 },
  ]);
});

test("continues decoding the previous climate payload during migration", () => {
  const result = decode({ bytes: [2, 0, 171, 1, 247] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "temperature", unit: "°C", value: 17.1 },
    { metric: "humidity", unit: "%", value: 50.3 },
  ]);
});

test("rejects malformed, duplicate, oversized, and wrong-port payloads", () => {
  assert.ok(decode({ bytes: [] }).errors);
  assert.ok(decode({ fPort: 9, bytes: [3, ...record(1, 180)] }).errors);
  assert.ok(decode({ bytes: [3, 1, 0] }).errors);
  assert.ok(decode({ bytes: [3, ...record(1, 180), ...record(1, 190)] }).errors);
  assert.ok(decode({ bytes: [3, ...Array(33 * 5).fill(0)] }).errors);
});
