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
const windowRecord = (code, statistic, value) => {
  const raw = value < 0 ? value + 0x1000000 : value;
  return [((statistic << 6) | code) & 255, (raw >>> 16) & 255, (raw >>> 8) & 255, raw & 255];
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

test("decodes LTR390 UV index, lux, and diagnostic counts from firmware v8", () => {
  const result = decode({ fPort: 10, bytes: [4, 8,
    ...record(3, 725), ...record(31, 1234), ...record(32, 696), ...record(33, 6170)],
  });
  assert.equal(result.data.firmware_version, 8);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "uv_index", unit: "index", value: 7.25 },
    { metric: "ambient_light", unit: "lux", value: 123.4 },
    { metric: "ltr390_uv_raw", unit: "raw", value: 696 },
    { metric: "ltr390_als_raw", unit: "raw", value: 6170 },
  ]);
});

test("decodes BME68x environmental readings from firmware v9", () => {
  const result = decode({ fPort: 10, bytes: [4, 9,
    ...record(18, 2234), ...record(19, 4815), ...record(20, 10132), ...record(21, 12000)],
  });
  assert.equal(result.data.firmware_version, 9);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "bme688_temperature", unit: "°C", value: 22.34 },
    { metric: "bme688_humidity", unit: "%", value: 48.15 },
    { metric: "pressure", unit: "hPa", value: 1013.2 },
    { metric: "bme688_gas_resistance", unit: "Ω", value: 12000 },
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

test("decodes registered metrics while omitting reserved SGP41 raw identifiers", () => {
  const result = decode({ bytes: [3, ...Array.from({ length: 41 }, (_, index) => record(index + 1, 100)).flat()] });
  const measurements = JSON.parse(JSON.stringify(result.data.measurements));
  assert.equal(measurements.length, 39);
  assert.deepEqual(measurements.map(({ metric }) => metric), [
    "temperature", "humidity", "uv_index", "co2", "scd41_temperature",
    "scd41_humidity", "sound_level", "pm1_0", "pm2_5", "pm4_0", "pm10",
    "particle_number_pm0_5", "particle_number_pm1_0", "particle_number_pm2_5",
    "particle_number_pm4_0", "particle_number_pm10", "particle_size_typical",
    "bme688_temperature", "bme688_humidity", "pressure", "bme688_gas_resistance",
    "bme688_iaq", "bme688_static_iaq", "bme688_co2_equivalent",
    "bme688_bvoc_equivalent", "bme688_gas_percentage", "sgp41_voc_index",
    "sgp41_nox_index", "ambient_light",
    "ltr390_uv_raw", "ltr390_als_raw", "rain_detected", "rain_pulses",
    "bus_voltage", "shunt_voltage", "current", "power", "sound_dominant_frequency",
    "sound_event_class",
  ]);
});

test("drops legacy SGP41 VOC and NOx raw signals", () => {
  const result = decode({ bytes: [4, 4, ...record(27, 23456), ...record(28, 19876)] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), []);
});

test("decodes Sensirion SGP41 VOC and NOx indices as whole index values", () => {
  const result = decode({ bytes: [4, 5, ...record(29, 108), ...record(30, 97)] });
  assert.equal(result.data.firmware_version, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "sgp41_voc_index", unit: "index", value: 108 },
    { metric: "sgp41_nox_index", unit: "index", value: 97 },
  ]);
});

test("decodes format 5 window summaries, signed levels and grouped sample counts", () => {
  const result = decode({ fPort: 10, bytes: [5, 11, 0, 1, 44,
    ...windowRecord(1, 0, 120), ...windowRecord(1, 1, 125), ...windowRecord(1, 2, 130),
    ...windowRecord(7, 0, -500), ...windowRecord(7, 1, -220), ...windowRecord(7, 2, -100),
    ...windowRecord(50, 3, 300), ...windowRecord(57, 3, 18750),
  ] });
  assert.equal(result.data.version, 5);
  assert.equal(result.data.firmware_version, 11);
  assert.equal(result.data.window_seconds, 300);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "temperature", unit: "°C", value: 12.5 },
    { metric: "sound_level", unit: "dBFS", value: -22 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.window_statistics)), [
    { metric: "temperature", unit: "°C", min_value: 12, mean_value: 12.5, max_value: 13, sample_count: 300 },
    { metric: "sound_level", unit: "dBFS", min_value: -50, mean_value: -22, max_value: -10, sample_count: 18750 },
  ]);
});

test("decodes unsigned 24-bit BME68x resistance and mean-only raw diagnostics", () => {
  const result = decode({ bytes: [5, 11, 0, 0, 10,
    ...windowRecord(21, 0, 10000000), ...windowRecord(21, 1, 12000000), ...windowRecord(21, 2, 15000000),
    ...windowRecord(32, 1, 12345), ...windowRecord(56, 3, 2), ...windowRecord(53, 3, 2),
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.window_statistics)), [
    { metric: "bme688_gas_resistance", unit: "Ω", min_value: 10000000, mean_value: 12000000, max_value: 15000000, sample_count: 2 },
    { metric: "ltr390_uv_raw", unit: "raw", min_value: null, mean_value: 12345, max_value: null, sample_count: 2 },
  ]);
});

const soundEventRecord = (classId, count, maxScorePct) => {
  return [((3 << 6) | 58) & 255, classId & 255, count & 255, maxScorePct & 255];
};

test("decodes format 6 window summary with silence (no sound events)", () => {
  const result = decode({ fPort: 10, bytes: [6, 12, 0, 1, 44,
    ...windowRecord(1, 0, 120), ...windowRecord(1, 1, 125), ...windowRecord(1, 2, 130),
    ...windowRecord(50, 3, 300),
  ] });
  assert.equal(result.data.version, 6);
  assert.equal(result.data.firmware_version, 12);
  assert.equal(result.data.window_seconds, 300);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.sound_events)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.measurements)), [
    { metric: "temperature", unit: "°C", value: 12.5 },
  ]);
});

test("decodes format 6 window summary with classified sound events", () => {
  const result = decode({ fPort: 10, bytes: [6, 12, 0, 1, 44,
    ...windowRecord(1, 0, 120), ...windowRecord(1, 1, 125), ...windowRecord(1, 2, 130),
    ...windowRecord(50, 3, 300),
    ...soundEventRecord(0, 5, 75),  // class 0 (dog), count 5, max_score 75%
    ...soundEventRecord(42, 2, 88), // class 42 (siren), count 2, max_score 88%
  ] });
  assert.equal(result.data.version, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.sound_events)), [
    { class_id: 0, class: "dog", count: 5, max_score: 0.75 },
    { class_id: 42, class: "siren", count: 2, max_score: 0.88 },
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
  assert.ok(decode({ bytes: [5, 11, 0, 0, 0, ...windowRecord(1, 1, 20)] }).errors);
  assert.ok(decode({ bytes: [5, 11, 0, 0, 1, ...windowRecord(1, 1, 20), ...windowRecord(1, 1, 21)] }).errors);
  assert.ok(decode({ bytes: [5, 11, 0, 0, 1, ...windowRecord(1, 0, 20)] }).errors);
});
