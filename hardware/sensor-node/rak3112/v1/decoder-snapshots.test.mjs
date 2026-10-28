import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const versions = (await readdir(root, {withFileTypes:true}))
  .filter(entry => entry.isDirectory() && /^v[1-9]\d*$/.test(entry.name))
  .map(entry => Number(entry.name.slice(1))).sort((a,b) => a-b);
const central = await readFile(new URL('v1/payload-formatter.js', root), 'utf8');

function sample(version, firmware) {
  // Temperature = 22.3 C. Compact formats include both bitmaps, three int16
  // statistics and the uint24 sample count for the inferred SHT41 group.
  if (version === 3) return [3,1,0,0,0,223];
  if (version === 4) return [4,firmware,1,0,0,0,223];
  if (version === 5 || version === 6) return [version,firmware,0,1,44,
    1,0,0,223,65,0,0,223,129,0,0,223,242,0,1,44];
  if (version === 7) return [7,firmware,0,1,44,1,0,0,0,0,0,0,0,0,0,0,0,
    0,223,0,223,0,223,0,1,44];
  // Format 8 with INA bus voltage, three 5000 mV statistics and group-10 count.
  if (version === 8) return [8,firmware,0,1,44,0,0,0,0,8,0,0,0,0,0,0,0,
    19,136,19,136,19,136,0,1,44];
  assert.fail(`Add a decoder snapshot fixture for payload format ${version}`);
}

for (const firmware of versions) {
  test(`v${firmware} contains a standalone matching TTN decoder`, async () => {
    const directory = new URL(`v${firmware}/`, root);
    const source = await readFile(new URL('payload-formatter.js', directory), 'utf8');
    const sketch = await readFile(new URL(`v${firmware}.ino`, directory), 'utf8');
    let version = Number(sketch.match(/PAYLOAD_VERSION\s*=\s*(\d+)\s*;/)?.[1]);
    if (!version) {
      const header = await readFile(new URL('compact_payload.h', directory), 'utf8');
      version = Number(header.match(/VERSION\s*=\s*(\d+)\s*;/)?.[1]);
    }
    const context = vm.createContext({});
    vm.runInContext(source, context);
    for (const format of version === 8 ? [7,8] : [version]) {
      const result = JSON.parse(JSON.stringify(context.decodeUplink({fPort:10,bytes:sample(format,firmware)})));
      assert.equal(result.errors, undefined, JSON.stringify(result));
      assert.equal(result.data.version, format);
      assert.equal(result.data.measurements[0].metric, format === 8 ? 'bus_voltage' : 'temperature');
      assert.equal(result.data.measurements[0].value, format === 8 ? 5000 : 22.3);
      if (format !== 3) assert.equal(result.data.firmware_version, firmware);
    }
    if (firmware === versions.at(-1)) assert.equal(source, central,
      'Update the newest firmware decoder snapshot together with the central decoder');
  });
}
