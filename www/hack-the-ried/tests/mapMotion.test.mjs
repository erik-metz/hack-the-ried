import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/mapMotion.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { nextMotion, motionPoint } = context.exports;
const a = { lat: 49.6, lng: 8.4 }, b = { lat: 49.601, lng: 8.402 };

test('movement spans the data interval instead of one second and stops at the received endpoint', () => {
  const initial = nextMotion(undefined, a, 10000, 0);
  const motion = nextMotion(initial, b, 20000, 10000);
  assert.equal(motion.duration, 10000);
  assert.ok(Math.abs(motionPoint(motion, 15000).lat - 49.6005) < 1e-9);
  assert.equal(motionPoint(motion, 50000).lat, b.lat);
});
test('cached and older snapshots do not restart or rewind movement', () => {
  const motion = nextMotion(nextMotion(undefined, a, 10000, 0), b, 20000, 10000);
  assert.equal(nextMotion(motion, b, 20000, 15000), motion);
  assert.equal(nextMotion(motion, a, 10000, 15000), motion);
});
test('a new target starts at the currently displayed point without a jump', () => {
  const motion = nextMotion(nextMotion(undefined, a, 10000, 0), b, 20000, 10000);
  const next = nextMotion(motion, { lat: 49.602, lng: 8.403 }, 30000, 15000);
  assert.equal(next.from.lat, motionPoint(motion, 15000).lat);
  assert.equal(motionPoint(next, 15000).lat, next.from.lat);
});
test('long gaps and large corrections snap rather than simulate an unsupported journey', () => {
  const initial = nextMotion(undefined, a, 10000, 0);
  assert.equal(nextMotion(initial, b, 100000, 90000).duration, 0);
  assert.equal(nextMotion(initial, { lat: 50, lng: 9 }, 20000, 10000).duration, 0);
});
test('stationary vehicles do not run an animation loop', () => {
  const initial = nextMotion(undefined, a, 10000, 0);
  assert.equal(nextMotion(initial, a, 20000, 10000).duration, 0);
});
test('ships snap after sparse reports but an older snapshot never rewinds them', () => {
  const initial=nextMotion(undefined,a,10000,0,true);
  const nearby={lat:49.6001,lng:8.4001};
  assert.equal(nextMotion(initial,nearby,20000,10000,true).duration,10000);
  assert.equal(nextMotion(initial,nearby,41000,10000,true).duration,0);
  assert.equal(nextMotion(initial,b,20000,10000,true).duration,0);
  assert.equal(nextMotion(initial,b,9000,10000,true),initial);
});
test('aircraft interpolate normal fast motion but snap after a reception gap', () => {
  const initial=nextMotion(undefined,a,10000,0,'aircraft');
  const flight={lat:49.63,lng:8.43};
  assert.equal(nextMotion(initial,flight,25000,15000,'aircraft').duration,15000);
  assert.equal(nextMotion(initial,flight,80000,70000,'aircraft').duration,0);
  assert.equal(nextMotion(initial,{lat:50,lng:9},25000,15000,'aircraft').duration,0);
});

test('backend ship estimates animate across one second and cached estimates do not restart', () => {
  const initial = nextMotion(undefined, a, 10000, 0, 'ship_estimate');
  const target = { lat: a.lat + 5 / 111000, lng: a.lng };
  const motion = nextMotion(initial, target, 11000, 1000, 'ship_estimate');
  assert.equal(motion.duration, 1000);
  assert.ok(Math.abs(motionPoint(motion, 1500).lat - (a.lat + 2.5 / 111000)) < 1e-9);
  assert.equal(motionPoint(motion, 2000).lat, target.lat);
  assert.equal(nextMotion(motion, target, 11000, 1500, 'ship_estimate'), motion);
  assert.equal(nextMotion(motion, a, 10000, 1500, 'ship_estimate'), motion);
});
