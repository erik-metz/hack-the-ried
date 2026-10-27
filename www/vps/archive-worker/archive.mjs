import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import yazl from 'yazl';

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
const numericColumns = new Set(['measurement_id', 'value', 'revision', 'minimum', 'maximum']);
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
const header = table => '\uFEFF' + COLUMNS[table].join(',') + '\r\n';
const readme = `HackTheRied – Monthly public three-table snapshot (format 2)

entities.csv: objects; id is the key.
measurement_definitions.csv: measurement definitions; entity_id references entities.id.
readings.csv: readings; measurement_id references measurement_definitions.id.
Each ZIP part contains exactly the entities and definitions referenced by its readings.
Metadata can occur in multiple parts; merge it by id. Download ALL parts for a full month.
UTF-8 BOM CSV, comma delimiter, UTC timestamps with microseconds, exact numeric values.
metadata, dimensions and provenance are JSON. Empty cells are missing values, not zeros.
basis distinguishes observations, reports, models, schedules and unknown legacy data.
Legacy telemetry is transferred without inventing its basis or source certainty.
Duplicate legacy keys with identical values are represented by one canonical reading.
Entity metadata reflects export time, not a historical version sequence.
Current-month snapshots are incomplete. Late arrivals require a refreshed snapshot.
Sources and licensing: see source_id and https://hack-the-ried.de/quellen.
Text starting with spreadsheet formula characters is protected by an apostrophe.
manifest.json contains the UTC period, snapshot, part and table counts.
`;

/** Bounded reading stream; each part is independently referentially complete. */
export async function buildArchives(rows, directory, month, generatedAt, partBytes = 64 * 1024 * 1024) {
  const files = [];
  const entityIds = new Set();
  let entities = new Map(), definitions = new Map();
  let output, completion, csvPath, count = 0, total = 0, bytes = 0, first = null, last = null;
  const { start, end } = monthRange(month);
  async function finish() {
    if (!output) return;
    output.end(); await completion;
    const part = files.length + 1;
    const filename = `hack-the-ried-${month}-v2-part-${String(part).padStart(4, '0')}.zip`;
    const zipPath = path.join(directory, filename);
    const zip = new yazl.ZipFile();
    const saving = pipeline(zip.outputStream, createWriteStream(zipPath));
    const options = { mtime: start };
    zip.addFile(csvPath, 'readings.csv', options);
    for (const [table, map] of [['entities', entities], ['measurement_definitions', definitions]]) {
      const tablePath = path.join(directory, `part-${part}-${table}.csv`);
      await writeFile(tablePath, header(table) + [...map.values()].map(row => tableLine(table, row)).join(''));
      zip.addFile(tablePath, `${table}.csv`, options);
    }
    zip.addBuffer(Buffer.from(readme), 'README.txt', options);
    zip.addBuffer(Buffer.from(JSON.stringify({ format_version: 2, month, part, complete: true,
      reading_count: count, tables: { entities: entities.size, measurement_definitions: definitions.size, readings: count },
      generated_at: generatedAt, start: start.toISOString(), end_exclusive: end.toISOString(),
      first_reading: first, last_reading: last }, null, 2)), 'manifest.json', options);
    zip.end(); await saving;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(zipPath)) hash.update(chunk);
    files.push({ filename, path: zipPath, size_bytes: (await stat(zipPath)).size, reading_count: count, sha256: hash.digest('hex') });
    output = undefined; entities = new Map(); definitions = new Map();
  }
  try {
    for await (const { entity, definition, reading } of rows) {
      if (String(reading.measurement_id) !== String(definition.id) || definition.entity_id !== entity.id) throw new Error('Broken export reference');
      const line = tableLine('readings', reading);
      let size = Buffer.byteLength(line);
      if (!entities.has(entity.id)) size += Buffer.byteLength(tableLine('entities', entity));
      if (!definitions.has(definition.id)) size += Buffer.byteLength(tableLine('measurement_definitions', definition));
      if (output && bytes + size > partBytes && count) await finish();
      if (!output) {
        csvPath = path.join(directory, `part-${files.length + 1}.csv`);
        output = createWriteStream(csvPath); completion = once(output, 'finish'); completion.catch(() => {});
        output.write(header('readings')); bytes = Object.keys(COLUMNS).reduce((n, table) => n + Buffer.byteLength(header(table)), 0);
        count = 0; first = reading.observed_at;
      }
      if (!entities.has(entity.id)) bytes += Buffer.byteLength(tableLine('entities', entity));
      if (!definitions.has(definition.id)) bytes += Buffer.byteLength(tableLine('measurement_definitions', definition));
      entities.set(entity.id, entity); definitions.set(definition.id, definition); entityIds.add(entity.id);
      if (!output.write(line)) await once(output, 'drain');
      bytes += Buffer.byteLength(line); count++; total++; last = reading.observed_at;
    }
    await finish(); return { files, reading_count: total, entity_ids: [...entityIds] };
  } catch (error) { output?.destroy(); throw error; }
}
