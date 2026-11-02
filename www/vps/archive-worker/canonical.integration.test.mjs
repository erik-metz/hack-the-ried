import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { includeLegacy, ROWS, CORE_ROWS } from './canonical.mjs';

test('physical openSenseMap channels export separately without exact UI copies', {
  skip: !process.env.ARCHIVE_TEST_DATABASE_URL,
}, async () => {
  const client = new pg.Client({ connectionString: process.env.ARCHIVE_TEST_DATABASE_URL });
  await client.connect();
  const schema = `archive_sense_test_${process.pid}`;
  await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
  const start = '2026-10-01', end = '2026-11-01';
  try {
    await client.query(`CREATE TABLE sensor_metadata(id text PRIMARY KEY,friendly_name text,latitude float,
      longitude float,description text,is_hidden bool DEFAULT false);
      CREATE TABLE sensor_data(timestamp timestamptz,sensor_id text,metric text,unit text,value float);
      INSERT INTO sensor_metadata(id,friendly_name) VALUES('osem-box','Box');
      INSERT INTO sensor_data VALUES ('2026-10-01','osem-box','temperature','C',19.2);`);
    await client.query(await readFile(new URL('../api/v1/migrations/20260930_measurements.sql', import.meta.url), 'utf8'));
    await includeLegacy(client, start, end);
    await client.query(`SELECT write_measurement('sensor:osem-box','temperature','C','legacy-sensor:osem-box',
      'observed','{"sensor_id":"BME280"}','2026-10-01',21.5,'2026-10-01','{}');
      SELECT write_measurement('sensor:osem-box','temperature','C','legacy-sensor:osem-box',
      'observed','{"sensor_id":"DHT22"}','2026-10-01',19.2,'2026-10-01','{}');
      SELECT write_measurement('sensor:osem-box','temperature','C','legacy-sensor:osem-box',
      'unknown','{}','2026-10-01',19.2,'2026-10-01','{}','valid',NULL,NULL,'unknown');`);
    let rows = (await client.query(ROWS, [start,end])).rows;
    assert.equal((await client.query(CORE_ROWS, [start,end])).rows.length, 2, 'Canonical export does not query or duplicate the UI history');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => row.reading.value).sort(), ['19.2','21.5']);
    assert.deepEqual(rows.map(row => JSON.parse(row.definition.dimensions).sensor_id).sort(), ['BME280','DHT22']);
    await client.query("UPDATE sensor_data SET value=22; DELETE FROM readings WHERE measurement_id IN (SELECT id FROM measurement_definitions WHERE basis='unknown')");
    rows = (await client.query(ROWS, [start,end])).rows;
    assert.equal(rows.length, 3, 'Unmatched legacy values must remain available');
  } finally {
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});

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
    assert.equal((await includeLegacy(client, start, end)).length, 1);
    const ambiguous = (await client.query(ROWS, [start, end])).rows;
    assert.equal(ambiguous.length, 1);
    assert.equal(ambiguous[0].reading.legacy_conflict, true);
    assert.deepEqual(ambiguous[0].reading.legacy_variants.map(v => v.value).sort(), ['90', '92']);
    assert.equal((await client.query('SELECT count(*) FROM readings')).rows[0].count, '0');
    await client.query(`INSERT INTO entities(id,name,entity_type)
      VALUES ('sensor:weather-dwd-ried','Weather','weather_model') ON CONFLICT DO NOTHING;
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
    assert.equal((await includeLegacy(client, start, end)).length, 1);
    const legacy = await client.query(`SELECT r.value FROM readings r JOIN measurement_definitions d
      ON d.id=r.measurement_id WHERE d.source_id='legacy-sensor:weather-dwd-ried' AND r.observed_at=$1`, [stamp]);
    assert.equal(legacy.rows[0].value, '90');
    assert.equal((await client.query('SELECT count(*) FROM sensor_data')).rows[0].count, '2');
    assert.equal((await client.query("SELECT previous_record->>'value' AS value FROM reading_revisions")).rows[0].value, '92');
    await client.query(`INSERT INTO sensor_data VALUES ($1,'weather-dwd-ried','relative_humidity','%',91)`, [stamp]);
    await includeLegacy(client, start, end);
    const unexplained = (await client.query(ROWS, [start, end])).rows.find(row => row.reading.legacy_conflict);
    assert.deepEqual(unexplained.reading.legacy_variants.map(v => v.value).sort(), ['90', '91', '92']);
    assert.equal((await client.query('SELECT count(*) FROM sensor_data')).rows[0].count, '3');
    await client.query(await readFile(new URL('../api/v1/migrations/20261101_weather_legacy_cleanup.sql', import.meta.url), 'utf8'));
    assert.equal((await client.query('SELECT clean_weather_legacy($1,$2,$3,$4) AS cleaned',
      ['weather-dwd-ried','relative_humidity','%',stamp])).rows[0].cleaned, false);
    assert.equal((await client.query('SELECT count(*) FROM sensor_data')).rows[0].count, '3');
    assert.equal((await client.query('SELECT count(*) FROM weather_legacy_repairs')).rows[0].count, '0');
  } finally {
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});


test('native TTN copies export once while unmatched values and hidden-native legacy remain', {
  skip: !process.env.ARCHIVE_TEST_DATABASE_URL,
}, async () => {
  const client = new pg.Client({ connectionString: process.env.ARCHIVE_TEST_DATABASE_URL });
  await client.connect();
  const schema = `archive_gateway_test_${process.pid}`;
  await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
  const start = '2026-10-01', end = '2026-11-01';
  try {
    await client.query(`CREATE TABLE sensor_metadata(id text PRIMARY KEY,friendly_name text,latitude float,
      longitude float,description text,is_hidden bool DEFAULT false);
      CREATE TABLE sensor_data(timestamp timestamptz,sensor_id text,metric text,unit text,value float);
      INSERT INTO sensor_metadata(id,friendly_name) VALUES('ttn-gw-test','Test'),('ttn-gw-hidden','Hidden');
      INSERT INTO sensor_data VALUES ('2026-10-01','ttn-gw-test','online_status','state',1),
        ('2026-10-02','ttn-gw-test','online_status','state',0),
        ('2026-10-01','ttn-gw-hidden','online_status','state',1);`);
    await client.query(await readFile(new URL('../api/v1/migrations/20260930_measurements.sql', import.meta.url), 'utf8'));
    await includeLegacy(client, start, end);
    await client.query(`INSERT INTO entities(id,name,entity_type,is_hidden) VALUES
      ('lora:gateway:test','Gateway','lora_gateway',false),('lora:gateway:hidden','Hidden','lora_gateway',true);
      SELECT write_measurement('lora:gateway:test','online_status','state','ttnmapper','observed','{}','2026-10-01',1,'2026-10-01','{}');
      SELECT write_measurement('lora:gateway:hidden','online_status','state','ttnmapper','observed','{}','2026-10-01',1,'2026-10-01','{}');
      SELECT write_measurement('sensor:ttn-gw-test','online_status','state','legacy-sensor:ttn-gw-test','unknown','{}','2026-10-01',1,'2026-10-01','{}','valid',NULL,NULL,'unknown');`);
    const rows = (await client.query(ROWS, [start,end])).rows;
    assert.equal(rows.length, 3);
    assert.equal(rows.filter(row => row.entity.id === 'lora:gateway:test').length, 1);
    assert.equal(rows.filter(row => row.entity.id === 'sensor:ttn-gw-test').length, 1);
    assert.equal(rows.find(row => row.entity.id === 'sensor:ttn-gw-test').reading.value, '0');
    assert.equal(rows.filter(row => row.entity.id === 'sensor:ttn-gw-hidden').length, 1);
  } finally { await client.query(`DROP SCHEMA ${schema} CASCADE`); await client.end(); }
});
