import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArchives } from './archive.mjs';

const execute = promisify(execFile);
async function descriptor(filename, readingCount) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return { filename: path.basename(filename), path: filename, format: 'parquet',
    size_bytes: (await stat(filename)).size, reading_count: readingCount, sha256: hash.digest('hex') };
}

export async function combineArchives(files, directory, month) {
  if (!files.length) return [];
  const complete = path.join(directory, 'complete');
  await mkdir(complete, { recursive: true });
  const inputs = path.join(complete, 'inputs.json');
  await writeFile(inputs, JSON.stringify(files));
  const output = path.join(complete, `hack-the-ried-${month}-v4-part-0001.parquet.zip`);
  await execute(process.env.PYTHON || 'python3', [fileURLToPath(new URL('./assemble_month.py', import.meta.url)), inputs, output]);
  const file = await descriptor(output, files.reduce((sum, file) => sum + file.reading_count, 0));
  for (const input of files) await rm(input.path);
  await rm(inputs);
  return [file];
}

/** Internal bounded chunks are assembled locally; only one complete ZIP is uploaded. */
export async function buildMonthlyArchive(rows, directory, month, generatedAt, partBytes, publish) {
  const archive = await buildArchives(rows, directory, month, generatedAt, partBytes);
  const files = await combineArchives(archive.files, directory, month);
  if (files.length && publish) { await publish(files); await rm(files[0].path); }
  return { ...archive, files };
}

/** Reuse an existing verified snapshot, without querying or changing original readings. */
export async function repackArchive(previous, directory, fetchImpl = globalThis.fetch) {
  const inputs = [];
  for (const file of previous.files) {
    const url = new URL(file.url);
    if (file.format !== 'parquet' || !/^hack-the-ried-\d{4}(?:-(?:0[1-9]|1[0-2]|Q[1-4]))?-v4-part-\d+\.parquet\.zip$/.test(file.filename)
      || url.protocol !== 'https:' || !(url.hostname.endsWith('.ufs.sh') || url.hostname === 'utfs.io')) {
      throw new Error('Invalid source archive file');
    }
    const target = path.join(directory, file.filename);
    let valid = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(120000),
          headers: { 'User-Agent': 'HackTheRied-ArchiveDownloader/1.0' } });
        if (!response.ok || !response.body) throw new Error('Source archive download failed');
        await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
        const actual = await descriptor(target, file.reading_count);
        if (actual.sha256 !== file.sha256 || actual.size_bytes !== file.size_bytes) throw new Error('Source archive checksum mismatch');
        inputs.push(actual);
        valid = true;
        break;
      } catch {
        await rm(target, { force: true });
      }
    }
    if (!valid) throw new Error('Could not verify an existing archive part; published snapshot remains unchanged');
    console.log(`Verified ${previous.month} source part ${inputs.length}/${previous.files.length}`);
  }
  const readingCount = inputs.reduce((sum, file) => sum + file.reading_count, 0);
  if (readingCount !== Number(previous.reading_count)) throw new Error('Source catalogue reading count mismatch');
  const files = await combineArchives(inputs, directory, previous.month);
  return { files, reading_count: readingCount, entity_ids: previous.entity_ids };
}
