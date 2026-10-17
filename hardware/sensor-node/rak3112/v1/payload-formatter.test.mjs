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

test("decodes integer firmware metadata separately from sensor measurements", () => {
  const result = decode({ fPort: 10, bytes: [4, 2, ...record(1, 187), ...record(2, 503)] });
  assert.equal(result.data.firmware_version, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "temperature", unit: "°C", value: 18.7 },
    { metric: "humidity", unit: "%", value: 50.3 },
  ]);
  assert.equal(result.data.measurements.some(({ metric }) => metric === "firmware_version"), false);
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

test("decodes all registered BOM sensor identifiers", () => {
  const result = decode({ bytes: [3, ...Array.from({ length: 41 }, (_, index) => record(index + 1, 100)).flat()] });
  const measurements = JSON.parse(JSON.stringify(result.data.measurements));
  assert.equal(measurements.length, 41);
  assert.deepEqual(measurements.map(({ metric }) => metric), [
    "temperature", "humidity", "uv_index", "co2", "scd41_temperature",
    "scd41_humidity", "sound_level", "pm1_0", "pm2_5", "pm4_0", "pm10",
    "particle_number_pm0_5", "particle_number_pm1_0", "particle_number_pm2_5",
    "particle_number_pm4_0", "particle_number_pm10", "particle_size_typical",
    "bme688_temperature", "bme688_humidity", "pressure", "bme688_gas_resistance",
    "bme688_iaq", "bme688_static_iaq", "bme688_co2_equivalent",
    "bme688_bvoc_equivalent", "bme688_gas_percentage", "sgp41_voc_raw",
    "sgp41_nox_raw", "sgp41_voc_index", "sgp41_nox_index", "ambient_light",
    "ltr390_uv_raw", "ltr390_als_raw", "rain_detected", "rain_pulses",
    "bus_voltage", "shunt_voltage", "current", "power", "sound_dominant_frequency",
    "sound_event_class",
  ]);
});

test("rejects malformed, duplicate, oversized, and wrong-port payloads", () => {
  assert.ok(decode({ bytes: [] }).errors);
  assert.ok(decode({ bytes: [2, 0, 171, 1, 247] }).errors);
  assert.ok(decode({ fPort: 9, bytes: [3, ...record(1, 180)] }).errors);
  assert.ok(decode({ bytes: [3, 1, 0] }).errors);
  assert.ok(decode({ bytes: [3, ...record(1, 180), ...record(1, 190)] }).errors);
  assert.ok(decode({ bytes: [3, ...Array(42 * 5).fill(0)] }).errors);
  assert.ok(decode({ bytes: [4, 2, 1, 0] }).errors);
  assert.ok(decode({ bytes: [4, 2, ...Array(42 * 5).fill(0)] }).errors);
});
