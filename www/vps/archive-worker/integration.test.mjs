import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { drainCleanup, runArchives } from './worker.mjs';

// Uses a dedicated temporary PostgreSQL instance, never the production database.
test('database export, publication, retry, replacement and visibility', { skip: !process.env.ARCHIVE_TEST_SOCKET && !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const dbConfig = process.env.ARCHIVE_TEST_DATABASE_URL ? { connectionString: process.env.ARCHIVE_TEST_DATABASE_URL } : { host: process.env.ARCHIVE_TEST_SOCKET, port: 55439, database: 'postgres', user: process.env.USER };
  const client = new pg.Client(dbConfig);
  await client.connect();
  const schema = `archive_test_${process.pid}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  dbConfig.options = `-c search_path=${schema}`;
  await client.query(`SET search_path TO ${schema}`);
  try {
    await client.query(`CREATE TABLE sensor_metadata (id text PRIMARY KEY, friendly_name text, latitude float, longitude float, description text, is_hidden bool NOT NULL DEFAULT FALSE);
      CREATE TABLE sensor_data (timestamp timestamptz, sensor_id text, metric text, value float, unit text);
      INSERT INTO sensor_metadata (id, friendly_name, is_hidden) VALUES ('public', 'Public', false), ('hidden', 'Private', true);
      INSERT INTO sensor_data SELECT '2025-01-01T00:00:00Z'::timestamptz + i * interval '1 second', 'public', 'temperature', i, 'C' FROM generate_series(1,6001) i;
      INSERT INTO sensor_data VALUES ('2025-01-01T00:00:00Z', 'hidden', 'temperature', 99, 'C'), ('2025-02-01T00:00:00Z', 'public', 'temperature', 100, 'C');`);
    await client.query(await readFile(new URL('../api/v1/migrations/20260930_measurements.sql', import.meta.url), 'utf8'));
    const sql = await readFile(new URL('../api/v1/schema.sql', import.meta.url), 'utf8');
    // Archive tests use plain PostgreSQL. Load only their actual tables, not
    // every later schema section (which also creates Timescale hypertables).
    for (const table of ['data_archives', 'archive_cleanup']) {
      const statement = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
      assert.ok(statement, `Missing schema definition for ${table}`);
      await client.query(statement[0]);
    }
    // Upgrade a real old catalogue independently of the skipped bootstrap schema.
    await client.query('ALTER TABLE data_archives DROP COLUMN entity_ids, DROP COLUMN format_version');
    const upgrade = await readFile(new URL('../api/v1/migrations/20261007_archive_format.sql', import.meta.url), 'utf8');
    await client.query(upgrade);
    await client.query(upgrade);
    let sequence = 0;
    let failAt = Infinity;
    const removed = [];
    const storage = {
      async upload() { if (++sequence === failAt) throw new Error('upload failed'); return { key: `key-${sequence}`, url: `https://test.ufs.sh/f/${sequence}` }; },
      async remove(keys) { removed.push(...keys); },
    };
    const run = (extra = {}) => runArchives({ storage, dbConfig, requestedMonth: '2025-01', partBytes: 256 * 1024, ...extra });
    failAt = 2;
    await assert.rejects(run(), /upload failed/);
    assert.equal((await client.query('SELECT * FROM data_archives')).rowCount, 0);
    assert.deepEqual(removed, ['key-1']);
    failAt = Infinity;
    await run();
    let row = (await client.query('SELECT * FROM data_archives')).rows[0];
    assert.equal(Number(row.reading_count), 6001);
    assert.equal((await client.query('SELECT count(*) FROM readings')).rows[0].count, '0',
      'Exporting legacy history must not copy it into canonical storage');
    assert.equal(row.is_complete, true);
    assert.deepEqual(row.station_ids, ['public']);
    assert.ok(row.files.every(file => file.format === 'parquet'));
    assert.ok(row.files.some(file => file.format === 'parquet'));

    const previousKeys = row.files.map(file => file.key);
    const beforeSkip = sequence;
    await run();
    assert.equal(sequence, beforeSkip);
    await run({ refresh: true });
    assert.ok(previousKeys.every(key => removed.includes(key)));
    // Failed cleanup must neither invalidate publication nor lose old keys.
    const remove = storage.remove;
    storage.remove = async () => { throw new Error('temporary cleanup failure'); };
    await run({ refresh: true });
    assert.ok((await client.query('SELECT * FROM archive_cleanup')).rowCount > 0);
    const afterRefresh = sequence;
    storage.remove = remove;
    await run();
    assert.equal(sequence, afterRefresh);
    assert.equal((await client.query('SELECT * FROM archive_cleanup')).rowCount, 0);
    // Existing older-format catalogues are automatically upgraded, even if complete.
    await client.query("UPDATE data_archives SET format_version=1,reading_count=0 WHERE month='2025-01'");
    await client.query("INSERT INTO sensor_data VALUES ('2025-01-31T23:45:00Z','public','temperature',777,'C')");
    await run();
    assert.equal((await client.query('SELECT format_version FROM data_archives')).rows[0].format_version, 4);
    assert.equal(Number((await client.query('SELECT reading_count FROM data_archives')).rows[0].reading_count), 6002,
      'Hour discovery must inspect the database, even when the old catalogue claimed no readings');
    await client.query("DELETE FROM sensor_data WHERE timestamp='2025-01-31T23:45:00Z'");
    await run({ refresh: true });
    // Automatic discovery: SQL must backfill February and skip existing January.
    await run({ requestedMonth: null });
    row = (await client.query("SELECT * FROM data_archives WHERE month='2025-02'")).rows[0];
    assert.equal(Number(row.reading_count), 1);
    // Ambiguous source values are preserved as conflict variants, never guessed.
    await client.query("INSERT INTO sensor_data VALUES ('2025-02-01T00:00:00Z','public','temperature',999,'C')");
    await assert.rejects(run({ requestedMonth: '2025-02', refresh: true }), /repair source data/);
    assert.equal(Number((await client.query("SELECT reading_count FROM data_archives WHERE month='2025-02'")).rows[0].reading_count), 1);
    await client.query("DELETE FROM sensor_data WHERE value=999 AND timestamp='2025-02-01T00:00:00Z'");
    await client.query("UPDATE sensor_metadata SET is_hidden=true WHERE id='public'");
    await run();
    row = (await client.query("SELECT * FROM data_archives WHERE month='2025-01'")).rows[0];
    assert.equal(Number(row.reading_count), 0);
    assert.equal(row.files.length, 0);
  } finally { await client.query(`DROP SCHEMA ${schema} CASCADE`); await client.end(); }
});

test('core export reads canonical values and still honours station visibility', { skip: !process.env.ARCHIVE_TEST_SOCKET && !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const dbConfig = process.env.ARCHIVE_TEST_DATABASE_URL ? { connectionString: process.env.ARCHIVE_TEST_DATABASE_URL } : { host: process.env.ARCHIVE_TEST_SOCKET, port: 55439, database: 'postgres', user: process.env.USER };
  const client = new pg.Client(dbConfig);
  await client.connect();
  const schema = `archive_core_test_${process.pid}`;
  const previousMode = process.env.MEASUREMENT_READ_MODE;
  await client.query(`CREATE SCHEMA ${schema}`);
  dbConfig.options = `-c search_path=${schema},public`;
  await client.query(`SET search_path TO ${schema},public`);
  try {
    await client.query(`CREATE TABLE sensor_metadata(id text PRIMARY KEY,is_hidden boolean NOT NULL DEFAULT false, friendly_name text DEFAULT 'Station', latitude float, longitude float, description text);
      INSERT INTO sensor_metadata(id,is_hidden) VALUES ('public',false);
      CREATE TABLE sensor_data(timestamp timestamptz,sensor_id text,metric text,value float,unit text);
      INSERT INTO sensor_data VALUES ('2025-01-01T00:00:00Z','public','temperature',9999,'C');
      CREATE TABLE movement_latest(entity_id text,basis text,timestamp timestamptz,valid_until timestamptz,data jsonb);`);
    for (const migration of ['20260930_measurements.sql', '20261001_read_models.sql']) {
      await client.query(await readFile(new URL(`../api/v1/migrations/${migration}`, import.meta.url), 'utf8'));
    }
    const sql = await readFile(new URL('../api/v1/schema.sql', import.meta.url), 'utf8');
    for (const table of ['data_archives', 'archive_cleanup']) {
      const statement = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
      assert.ok(statement);
      await client.query(statement[0]);
    }
    await client.query(`INSERT INTO entities(id,name,entity_type) VALUES('sensor:public','Canonical station','sensor');
      SELECT write_measurement('sensor:public','temperature','C','legacy-sensor:public','unknown','{}',
        '2025-01-01T00:00:00Z',20.125,'2025-01-01T00:01:00Z','{}', 'valid', NULL, NULL, 'unknown');`);
    let csv = '';
    const storage = {
      async upload(file) {
        assert.equal(file.format, 'parquet');
        csv = execFileSync(process.env.PYTHON || 'python3', ['-c', `
import io,json,sys,zipfile,pyarrow.parquet as pq
from decimal import Decimal
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert set(archive.namelist()) == {'entities.parquet','measurement_definitions.parquet','readings.parquet','manifest.json','README.txt'}
    rows = pq.ParquetFile(io.BytesIO(archive.read('readings.parquet'))).read(use_threads=False).to_pylist()
    entities = pq.ParquetFile(io.BytesIO(archive.read('entities.parquet'))).read(use_threads=False).to_pylist()
    definitions = pq.ParquetFile(io.BytesIO(archive.read('measurement_definitions.parquet'))).read(use_threads=False).to_pylist()
    if any(entity['id']=='model:test' for entity in entities):
        model = next(entity for entity in entities if entity['id']=='model:test')
        assert json.loads(model['metadata'],parse_int=Decimal)['large']==Decimal('9007199254740993')
        definition = next(d for d in definitions if d['entity_id']=='model:test')
        assert json.loads(definition['dimensions'],parse_int=Decimal)['large']==Decimal('9007199254740993')
        reading = next(r for r in rows if r['measurement_id']==definition['id'])
        assert json.loads(reading['provenance'],parse_float=Decimal)['exact']==Decimal('-1.234567890123456789')
    print(json.dumps(rows,default=str))
`, file.path], { encoding: 'utf8' });
        return { key: 'canonical-key', url: 'https://test.ufs.sh/f/canonical' };
      },
      async remove() {},
    };
    process.env.MEASUREMENT_READ_MODE = 'core';
    await runArchives({ storage, dbConfig, requestedMonth: '2025-01' });
    assert.match(csv, /20\.125/);
    assert.doesNotMatch(csv, /9999/);
    assert.equal(Number((await client.query('SELECT reading_count FROM data_archives')).rows[0].reading_count), 1);
    await client.query(`INSERT INTO entities(id,name,entity_type,metadata) VALUES('model:test','Model','model','{"large":9007199254740993}');
      SELECT write_measurement('model:test','temperature','C','canonical-test','model','{"large":9007199254740993}',
        '2025-01-02T00:00:00.123456Z',-1.234567890123456789,'2025-01-02','{"exact":-1.234567890123456789}');`);
    await runArchives({ storage, dbConfig, requestedMonth: '2025-01', refresh: true });
    assert.match(csv, /-1\.234567890123456789/);
    assert.match(csv, /00:00:00\.123456\+00:00/);
    assert.equal(Number((await client.query('SELECT reading_count FROM data_archives')).rows[0].reading_count), 2);
    // A currently public iNaturalist observation must never enter a durable ZIP.
    await client.query(`INSERT INTO entities(id,name,entity_type,metadata)
      VALUES('inaturalist:123','Observation','inaturalist_observation','{"latitude":49.6,"attribution":"excluded-observer"}');
      SELECT write_measurement('inaturalist:123','occurrence_presence','count','inaturalist-ried','observed','{}',
        '2025-01-03',1,'2025-01-04','{"latitude":49.6,"attribution":"excluded-observer"}','valid',NULL,NULL,'reference');`);
    await runArchives({ storage, dbConfig, requestedMonth: '2025-01', refresh: true });
    const archive = (await client.query('SELECT * FROM data_archives')).rows[0];
    assert.equal(Number(archive.reading_count), 2);
    assert.ok(!archive.entity_ids.includes('inaturalist:123'));
    assert.doesNotMatch(csv, /excluded-observer|49\.6/);
    await client.query("UPDATE entities SET is_hidden=true WHERE id='model:test'");
    // A now-hidden canonical-only entity must invalidate the completed archive.
    await runArchives({ storage, dbConfig, requestedMonth: '2025-01' });
    assert.equal(Number((await client.query('SELECT reading_count FROM data_archives')).rows[0].reading_count), 1);
    await client.query("UPDATE sensor_metadata SET is_hidden=true; UPDATE entities SET is_hidden=true WHERE id='sensor:public'");
    await runArchives({ storage, dbConfig, requestedMonth: '2025-01' });
    assert.equal(Number((await client.query('SELECT reading_count FROM data_archives')).rows[0].reading_count), 0);
  } finally {
    if (previousMode === undefined) delete process.env.MEASUREMENT_READ_MODE;
    else process.env.MEASUREMENT_READ_MODE = previousMode;
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});


test('cleanup batches keys and retains the failed batch for retry', async () => {
  const pending = Array.from({ length: 205 }, (_, i) => ({ key: `cleanup-${i}` }));
  const deleted = [], batches = [];
  const client = { async query(query, params) {
    if (query.startsWith('SELECT')) return { rows: pending };
    deleted.push(...params[0]);
  } };
  await drainCleanup(client, { async remove(keys) {
    batches.push(keys);
    if (batches.length === 2) throw new Error('temporary failure');
  } });
  assert.deepEqual(batches.map(keys => keys.length), [100, 100]);
  assert.deepEqual(deleted, pending.slice(0, 100).map(row => row.key));
});
