import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import vm from 'node:vm';

const directory = mkdtempSync(join(tmpdir(), 'rak-sht41-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const executable = join(directory, 'encode');
const build = spawnSync('c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
  '-DRAK_SHT41_ONLY', fileURLToPath(new URL('../tools/compact_payload_fixture.cpp', import.meta.url)),
  '-o', executable], { encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr);
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../v15/payload-formatter.js', import.meta.url), 'utf8'), context);
const redundant = ['scd41_temperature', 'scd41_humidity', 'bme688_temperature', 'bme688_humidity'];
const originalCodes = [...Array.from({ length: 21 }, (_, i) => i + 1), 29, 30, 31, 32, 33];
function encode(codes) {
  const input = `300 222 ${codes.length}\n` + codes.map(code => `${code} 90 100 110 300`).join('\n');
  const result = spawnSync(executable, { input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const bytes = result.stdout.trim().split(/\s+/).map(Number);
  const decoded = JSON.parse(JSON.stringify(context.decodeUplink({ fPort: 10, bytes })));
  assert.equal(decoded.errors, undefined, JSON.stringify(decoded));
  return { bytes, data: decoded.data };
}

test('v15 applies the tested metric policy before window aggregation', () => {
  const source = readFileSync(new URL('../v15/v15.ino', import.meta.url), 'utf8');
  assert.match(source, /void recordMetric\([^]*?if \([^\n]*!CompactPayload::isUplinkMetric\(code\)\) return;/);
});
for (const withIna of [false, true]) {
  test(`v15 sends only SHT41 climate values with INA=${withIna}`, () => {
    const { bytes, data } = encode([...originalCodes, ...(withIna ? [36, 37, 38, 39] : [])]);
    assert.equal(bytes[0], withIna ? 8 : 7);
    assert.equal(bytes.length, withIna ? 180 : 141);
    assert.equal(data.firmware_version, 15);
    assert.equal(data.measurements.length, withIna ? 26 : 22);
    assert.deepEqual(data.measurements.slice(0, 2), [
      { metric: 'temperature', unit: '°C', value: 10 },
      { metric: 'humidity', unit: '%', value: 10 },
    ]);
    assert.ok(data.window_statistics.some(item => item.metric === 'temperature' && item.sample_count === 300));
    for (const field of ['measurements', 'window_statistics']) {
      assert.ok(data[field].every(item => !redundant.includes(item.metric)));
      for (const metric of ['co2', 'pressure', 'bme688_gas_resistance']) {
        assert.ok(data[field].some(item => item.metric === metric));
      }
    }
  });
}
test('missing SHT41 never substitutes SCD41 or BME688 climate values', () => {
  const { data } = encode(originalCodes.filter(code => code !== 1 && code !== 2));
  for (const field of ['measurements', 'window_statistics']) {
    assert.ok(data[field].every(item => !['temperature', 'humidity', ...redundant].includes(item.metric)));
    assert.ok(data[field].some(item => item.metric === 'co2'));
    assert.ok(data[field].some(item => item.metric === 'pressure'));
  }
});
