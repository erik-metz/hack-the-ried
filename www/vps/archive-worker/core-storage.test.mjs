import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORE_ROWS } from './canonical.mjs';

test('compact monthly export reads the authoritative core without a legacy union', () => {
  assert.match(CORE_ROWS, /FROM readings r JOIN measurement_definitions d/);
  assert.doesNotMatch(CORE_ROWS, /FROM sensor_data/);
  assert.doesNotMatch(CORE_ROWS, /UNION ALL/);
  assert.match(CORE_ROWS, /samples ORDER BY sort_time,sort_id$/);
});
