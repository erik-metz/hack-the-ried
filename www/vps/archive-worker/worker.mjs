import pg from 'pg';
import QueryStream from 'pg-query-stream';
import { mkdtemp, rm, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildArchives, monthRange } from './archive.mjs';
import { uploadThingStorage } from './storage.mjs';
import { PUBLIC, ROWS, includeLegacy } from './canonical.mjs';

export async function drainCleanup(client, storage) {
  const pending = (await client.query('SELECT key FROM archive_cleanup ORDER BY queued_at LIMIT 1000')).rows;
  for (const { key } of pending) {
    try {
      await storage.remove([key]);
      await client.query('DELETE FROM archive_cleanup WHERE key=$1', [key]);
    } catch {
      console.warn('Archive cleanup deferred; remaining keys stay in retry queue');
      break;
    }
  }
}

async function queueCleanup(client, keys) {
  if (keys.length) await client.query('INSERT INTO archive_cleanup(key) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING', [keys]);
}

export async function runArchives({ storage, dbConfig, requestedMonth = null, requestedPeriod = null, refresh = false, partBytes = 64 * 1024 * 1024, signal = null }) {
  const client = new pg.Client(dbConfig);
  await client.connect();
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock(72819401) AS locked');
    if (!lock.rows[0].locked) { console.log('Another archive export is running'); return; }
    // The API migration creates the catalogue. Fail clearly if not deployed yet.
    await client.query('SELECT month FROM data_archives LIMIT 0');
    await drainCleanup(client, storage);
    // Rebuild old formats and newly private snapshots without deleting valid URLs first.
    const staleCondition = `EXISTS (SELECT 1 FROM unnest(a.entity_ids) included(id)
      WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id=included.id AND ${PUBLIC}))
      OR EXISTS (SELECT 1 FROM unnest(a.station_ids) included(id)
        WHERE NOT EXISTS (SELECT 1 FROM sensor_metadata s WHERE s.id=included.id AND NOT s.is_hidden))`;
    const explicitPeriod = requestedPeriod || requestedMonth;
    const months = explicitPeriod ? [explicitPeriod] : (await client.query(`
      WITH earliest AS (SELECT min(time) AS time FROM (
        (SELECT r.observed_at AS time FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
          JOIN entities e ON e.id=d.entity_id WHERE ${PUBLIC} ORDER BY r.observed_at LIMIT 1)
        UNION ALL (SELECT t.timestamp FROM sensor_data t JOIN sensor_metadata s ON s.id=t.sensor_id
          WHERE NOT s.is_hidden ORDER BY t.timestamp LIMIT 1)
      ) dates), candidates AS (
        SELECT to_char(month_start,'YYYY-MM') AS month FROM generate_series(
          date_trunc('month',(SELECT time FROM earliest) AT TIME ZONE 'UTC'),
          date_trunc('month',now() AT TIME ZONE 'UTC')-interval '1 month',interval '1 month') months(month_start)
        UNION SELECT month FROM data_archives WHERE format_version < 3
      ) SELECT c.month FROM candidates c LEFT JOIN data_archives a ON a.month=c.month
      WHERE a.month IS NULL OR NOT a.is_complete OR a.format_version < 3 OR ${staleCondition}
      ORDER BY c.month`)).rows.map(row => row.month);
    for (const month of months) {
      if (signal?.aborted) break;
      const { start, end } = monthRange(month);
      if (start > new Date()) throw new Error('Cannot export a future period');
      const previous = (await client.query('SELECT * FROM data_archives WHERE month=$1', [month])).rows[0];
      if (previous?.is_complete && previous.format_version === 3 && !refresh) {
        const stale = await client.query(`SELECT 1 FROM data_archives a WHERE month=$1 AND (${staleCondition})`, [month]);
        if (!stale.rowCount) continue;
      }
      await includeLegacy(client, start, end);
      const directory = await mkdtemp(path.join(tmpdir(), 'ried-archive-'));
      const uploaded = [];
      let published = false;
      try {
        const generatedAt = (await client.query('SELECT transaction_timestamp() AS time')).rows[0].time.toISOString();
        async function* periodRows() {
          // Release relation locks between windows so deployments and ingestion can proceed.
          for (let windowStart = start.getTime(); windowStart < end.getTime(); windowStart += 3600000) {
            if (signal?.aborted) throw new Error('Archive export interrupted');
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            await client.query("SET LOCAL TIME ZONE 'UTC'");
            const stream = client.query(new QueryStream(ROWS,
              [new Date(windowStart), new Date(Math.min(windowStart + 3600000, end.getTime()))], { batchSize: 2000 }));
            let complete = false;
            try { yield* stream; complete = true; }
            finally { stream.destroy(); await client.query(complete ? 'COMMIT' : 'ROLLBACK'); }
            if ((windowStart - start.getTime()) % 86400000 === 23 * 3600000) {
              console.log(`Read ${month} through ${new Date(windowStart + 3600000).toISOString()}`);
            }
          }
        }
        const archive = await buildArchives(periodRows(), directory, month, generatedAt, partBytes, async files => {
          for (const file of files) {
            const remote = await storage.upload(file);
            uploaded.push({ filename: file.filename, format: file.format, size_bytes: file.size_bytes, reading_count: file.reading_count, sha256: file.sha256, ...remote });
          }
          console.log(`Uploaded ${month} part ${uploaded.length / 2}: ${files[0].reading_count} readings in CSV and Parquet`);
        });
        // Lock station visibility until publication; downloads also filter current visibility.
        await client.query('BEGIN');
        const entityIds = archive.entity_ids;
        const ids = entityIds.filter(id => id.startsWith('sensor:')).map(id => id.slice(7));
        const publicEntities = await client.query(`SELECT e.id FROM entities e WHERE e.id=ANY($1::text[]) AND ${PUBLIC} FOR SHARE OF e`, [entityIds]);
        if (publicEntities.rowCount !== entityIds.length) throw new Error('Entity visibility changed during export; retry');
        const visible = await client.query('SELECT id FROM sensor_metadata WHERE id = ANY($1::text[]) AND NOT is_hidden FOR SHARE', [ids]);
        if (visible.rowCount !== ids.length) throw new Error('Station visibility changed during export; retry');
        await client.query(`INSERT INTO data_archives (month, generated_at, is_complete, reading_count, size_bytes, station_ids, files, entity_ids, format_version)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,3) ON CONFLICT (month) DO UPDATE SET
          generated_at=EXCLUDED.generated_at, is_complete=EXCLUDED.is_complete, reading_count=EXCLUDED.reading_count,
          size_bytes=EXCLUDED.size_bytes, station_ids=EXCLUDED.station_ids, files=EXCLUDED.files, entity_ids=EXCLUDED.entity_ids, format_version=3`,
          [month, generatedAt, end <= new Date(generatedAt), archive.reading_count, uploaded.reduce((sum, file) => sum + file.size_bytes, 0), ids, JSON.stringify(uploaded), entityIds]);
        if (previous) await queueCleanup(client, previous.files.map(file => file.key));
        await client.query('COMMIT');
        published = true;
        await drainCleanup(client, storage);
        console.log(`Published ${month}: ${archive.reading_count} readings in ${uploaded.length} parts`);
      } catch (error) {
        await client.query('ROLLBACK');
        if (!published) {
          await queueCleanup(client, uploaded.map(file => file.key));
          await drainCleanup(client, storage);
        }
        throw error;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  } finally { await client.end(); }
}

async function main() {
  const args = process.argv.slice(2);
  const monthIndex = args.indexOf('--month');
  const requestedMonth = monthIndex >= 0 ? args[monthIndex + 1] : null;
  if (monthIndex >= 0) monthRange(requestedMonth || '');
  const refresh = args.includes('--refresh');
  if (refresh && !requestedMonth) throw new Error('--refresh requires --month YYYY-MM');
  const partBytes = Number(process.env.ARCHIVE_PART_MB || 64) * 1024 * 1024;
  if (!Number.isFinite(partBytes) || partBytes < 1024 * 1024 || partBytes > 256 * 1024 * 1024) throw new Error('ARCHIVE_PART_MB must be between 1 and 256');
  const storage = uploadThingStorage(process.env.UPLOADTHING_TOKEN);
  const dbConfig = { host: process.env.DB_HOST || 'timescaledb', port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD };
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const statusPath = path.join(process.env.ARCHIVE_STATE_DIR || '/data', 'status.json');
  let status = {};
  try { status = JSON.parse(await readFile(statusPath, 'utf8')); } catch { /* first run */ }
  try {
    do {
      let waitMs = 24 * 60 * 60 * 1000;
      status.last_attempt = new Date().toISOString();
      try {
        await runArchives({ storage, dbConfig, requestedMonth, refresh, partBytes, signal: controller.signal });
        if (!controller.signal.aborted) status = { ...status, status: 'healthy', last_success: new Date().toISOString(), consecutive_failures: 0, error_category: null };
      } catch (error) {
        console.error('Archive export failed:', error.code || error.name || 'Error');
        status = { ...status, status: 'degraded', consecutive_failures: (status.consecutive_failures || 0) + 1, error_category: error.code || error.name };
        waitMs = Math.min(3600000, 60000 * 2 ** Math.min(status.consecutive_failures, 6));
        if (!args.includes('--watch')) process.exitCode = 1;
      }
      try {
        await mkdir(path.dirname(statusPath), { recursive: true });
        await writeFile(`${statusPath}.tmp`, JSON.stringify(status));
        await rename(`${statusPath}.tmp`, statusPath);
      } catch { console.warn('Archive status write failed; publication outcome unchanged'); }
      if (!args.includes('--watch') || controller.signal.aborted) break;
      try { await delay(waitMs, null, { signal: controller.signal }); }
      catch (error) { if (error.name !== 'AbortError') throw error; }
    } while (!controller.signal.aborted);
  } finally {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Archive worker configuration failed; check README and environment.'); process.exitCode = 1; });
}
