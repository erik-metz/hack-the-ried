import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

export function periodRange(period) {
  if (!period || typeof period !== 'string') throw new Error('Use YYYY-MM, YYYY-Q1..Q4, or YYYY');
  // 1. Month: YYYY-MM
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    const start = new Date(`${period}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { start, end, type: 'month' };
  }
  // 2. Quarter: YYYY-Q[1-4]
  const qMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (qMatch) {
    const year = Number(qMatch[1]);
    const quarter = Number(qMatch[2]);
    const startMonth = (quarter - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 1));
    return { start, end, type: 'quarter' };
  }
  // 3. Year: YYYY
  if (/^\d{4}$/.test(period)) {
    const year = Number(period);
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    return { start, end, type: 'year' };
  }
  throw new Error('Use YYYY-MM, YYYY-Q1..Q4, or YYYY');
}

export function monthRange(month) {
  return periodRange(month);
}

export function csvCell(value) {
  if (typeof value === 'number') return String(value);
  let text = value == null ? '' : String(value);
  if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const COLUMNS = {
  entities: ['id', 'name', 'entity_type', 'metadata'],
  measurement_definitions: ['id', 'entity_id', 'metric', 'unit', 'source_id', 'basis', 'dimensions', 'semantics', 'minimum', 'maximum'],
  readings: ['measurement_id', 'observed_at', 'value', 'quality', 'collected_at', 'period_start', 'period_end', 'provenance', 'revision'],
};
const numericColumns = new Set(['measurement_id', 'value', 'revision', 'minimum', 'maximum', 'source_row_count']);
export function tableLine(table, row) {
  return COLUMNS[table].map(column => {
    const value = row[column];
    if ((numericColumns.has(column) || (table === 'measurement_definitions' && column === 'id')) && value != null) {
      const text = String(value);
      if (!/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) throw new Error('Invalid numeric export value');
      return text;
    }
    return csvCell(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
  }).join(',') + '\r\n';
}
const readme = `HackTheRied – Monthly public three-table snapshot (format 4)

entities.parquet: objects; id is the key.
measurement_definitions.parquet: measurement definitions; entity_id references entities.id.
readings.parquet: readings; measurement_id references measurement_definitions.id.
Each ZIP part contains exactly the entities and definitions referenced by its readings.
Metadata can occur in multiple parts; merge it by id. Download ALL parts for a full month.
All public sources, including observations and simulations, are retained together.
Original measurement values, source/basis fields and timestamps are retained.
No resampling, interpolation, additional classifications or time alignment is applied.
Timestamps use UTC microseconds. IDs and exact decimal values use strings to avoid precision loss.
Structured metadata, dimensions and provenance are JSON text; null means missing, not zero.
Metadata reflects export time, not a historical version sequence.
Each hour uses its own repeatable-read snapshot; late corrections require a refresh.
An unresolved legacy conflict stops publication; repair its source data before exporting.
Sources and licensing: see source_id and https://hack-the-ried.de/quellen.
manifest.json contains the UTC period, snapshot, part and table counts.
`;

/** Bounded, Parquet-only stream; each part is referentially complete. */
export async function buildArchives(rows, directory, month, generatedAt, partBytes = 64 * 1024 * 1024, publishPart = null) {
  const files = [], entityIds = new Set();
  let entities = new Map(), definitions = new Map();
  let output, completion, inputPath;
  let count = 0, total = 0, bytes = 0, first = null, last = null;
  const { start, end } = monthRange(month);
  async function finish() {
    if (!output) return;
    output.end(); await completion;
    const part = files.length + 1;
    const basename = `hack-the-ried-${month}-v4-part-${String(part).padStart(4, '0')}`;
    const partDirectory = path.join(directory, `part-${part}`);
    await mkdir(partDirectory, { recursive: true });
    for (const [table, map] of [['entities', entities], ['measurement_definitions', definitions]]) {
      await writeFile(path.join(partDirectory, `${table}.json`), JSON.stringify([...map.values()]));
    }
    const manifestPath = path.join(partDirectory, 'manifest.json');
    const readmePath = path.join(partDirectory, 'README.txt');
    await writeFile(manifestPath, JSON.stringify({ format_version: 4, format: 'parquet', month, part, complete: true,
      snapshot_consistency: 'hourly', reading_count: count,
      tables: { entities: entities.size, measurement_definitions: definitions.size, readings: count },
      generated_at: generatedAt, start: start.toISOString(), end_exclusive: end.toISOString(),
      first_reading: first, last_reading: last }, null, 2));
    await writeFile(readmePath, readme);
    const parquetPath = path.join(directory, `${basename}.parquet.zip`);
    await execFileAsync(process.env.PYTHON || 'python3', [
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'parquet_convert.py'),
      partDirectory, inputPath, parquetPath, manifestPath, readmePath,
    ]);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(parquetPath)) hash.update(chunk);
    const file = { filename: path.basename(parquetPath), path: parquetPath, format: 'parquet',
      size_bytes: (await stat(parquetPath)).size, reading_count: count, sha256: hash.digest('hex') };
    files.push(file);
    if (publishPart) { await publishPart([file]); await rm(file.path); }
    await rm(partDirectory, { recursive: true });
    await rm(inputPath);
    output = undefined; entities = new Map(); definitions = new Map();
  }
  try {
    for await (const { entity, definition, reading } of rows) {
      if (String(reading.measurement_id) !== String(definition.id) || definition.entity_id !== entity.id) throw new Error('Broken export reference');
      if (reading.legacy_conflict) throw new Error('Unresolved legacy source conflict; repair source data before archiving');
      const line = JSON.stringify(reading) + '\n';
      let size = Buffer.byteLength(line);
      if (!entities.has(entity.id)) size += Buffer.byteLength(JSON.stringify(entity));
      if (!definitions.has(definition.id)) size += Buffer.byteLength(JSON.stringify(definition));
      if (output && bytes + size > partBytes && count) await finish();
      if (!output) {
        inputPath = path.join(directory, `part-${files.length + 1}-readings.ndjson`);
        output = createWriteStream(inputPath); completion = once(output, 'finish'); completion.catch(() => {});
        bytes = 0; count = 0; first = reading.observed_at;
      }
      if (!entities.has(entity.id)) bytes += Buffer.byteLength(JSON.stringify(entity));
      if (!definitions.has(definition.id)) bytes += Buffer.byteLength(JSON.stringify(definition));
      entities.set(entity.id, entity); definitions.set(definition.id, definition); entityIds.add(entity.id);
      if (!output.write(line)) await once(output, 'drain');
      bytes += Buffer.byteLength(line); count++; total++; last = reading.observed_at;
    }
    await finish(); return { files, reading_count: total, entity_ids: [...entityIds] };
  } catch (error) { output?.destroy(); throw error; }
}
