import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { includeLegacy } from './canonical.mjs';

test('weather conflicts require receipt-backed revision history and preserve source rows', {
  skip: !process.env.ARCHIVE_TEST_SOCKET && !process.env.ARCHIVE_TEST_DATABASE_URL,
}, async () => {
  const dbConfig = process.env.ARCHIVE_TEST_DATABASE_URL
    ? { connectionString: process.env.ARCHIVE_TEST_DATABASE_URL }
    : { host: process.env.ARCHIVE_TEST_SOCKET, port: 55439, database: 'postgres', user: process.env.USER };
  const client = new pg.Client(dbConfig);
  await client.connect();
  const schema = `archive_weather_test_${process.pid}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  const start = '2026-10-01T00:00:00Z';
  const end = '2026-11-01T00:00:00Z';
  const stamp = '2026-10-01T19:15:00.123456Z';
  try {
    await client.query(`CREATE TABLE sensor_metadata(id text PRIMARY KEY, friendly_name text,
        latitude float, longitude float, description text, is_hidden bool DEFAULT false);
      CREATE TABLE sensor_data(timestamp timestamptz,sensor_id text,metric text,unit text,value float);
      CREATE TABLE collection_attempts(id bigint PRIMARY KEY,source_id text,http_status integer,
        status text,payload_sha256 text);
      INSERT INTO sensor_metadata(id,friendly_name) VALUES ('weather-dwd-ried','Weather');`);
    for (const migration of ['20260930_measurements.sql', '20261003_weather_reconciliation.sql']) {
      await client.query(await readFile(new URL(`../api/v1/migrations/${migration}`, import.meta.url), 'utf8'));
    }
    await client.query(`INSERT INTO sensor_data VALUES ($1,'weather-dwd-ried','relative_humidity','%',92),
      ($1,'weather-dwd-ried','relative_humidity','%',90)`, [stamp]);
    await assert.rejects(includeLegacy(client, start, end), /Conflicting legacy/);
    await client.query(`INSERT INTO entities(id,name,entity_type)
      VALUES ('sensor:weather-dwd-ried','Weather','weather_model');
      INSERT INTO collection_attempts VALUES (1,'environment-weather',200,'success','first'),
        (2,'environment-weather',200,'success','corrected');`);
    for (const [value, received, attempt, hash] of [
      [92, '2026-10-01T19:18:00Z', 1, 'first'],
      [90, '2026-10-01T19:28:00Z', 2, 'corrected'],
    ]) {
      await client.query(`SELECT write_measurement('sensor:weather-dwd-ried','relative_humidity','%',
        'environment-weather','model','{}',$1,$2,$3,$4,'valid',NULL,NULL,'instantaneous')`,
      [stamp, value, received, JSON.stringify({ collection_attempt_id: attempt, payload_sha256: hash })]);
    }
    await includeLegacy(client, start, end);
    const legacy = await client.query(`SELECT r.value FROM readings r JOIN measurement_definitions d
      ON d.id=r.measurement_id WHERE d.source_id='legacy-sensor:weather-dwd-ried' AND r.observed_at=$1`, [stamp]);
    assert.equal(legacy.rows[0].value, '90');
    assert.equal((await client.query('SELECT count(*) FROM sensor_data')).rows[0].count, '2');
    assert.equal((await client.query("SELECT previous_record->>'value' AS value FROM reading_revisions")).rows[0].value, '92');
    await client.query(`INSERT INTO sensor_data VALUES ($1,'weather-dwd-ried','relative_humidity','%',91)`, [stamp]);
    await assert.rejects(includeLegacy(client, start, end), /Conflicting legacy/);
    assert.equal((await client.query('SELECT count(*) FROM sensor_data')).rows[0].count, '3');
  } finally {
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});
