"""Losslessly combine archive chunks into one ZIP with three Parquet tables.

Readings are copied as typed Arrow batches. Metadata is merged by primary key
in a disposable SQLite database, keeping memory bounded even for large months.
Source ZIPs and their manifests are verified before any final file is published.
"""

import hashlib
import json
import shutil
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

MEMBERS = {'entities.parquet', 'measurement_definitions.parquet', 'readings.parquet', 'manifest.json', 'README.txt'}
README = """HackTheRied – Complete monthly public three-table snapshot (format 4)

This single ZIP contains the complete month, with all public sources together.
entities.parquet: objects; id is the unique key.
measurement_definitions.parquet: definitions; entity_id references entities.id.
readings.parquet: readings; measurement_id references measurement_definitions.id.
Metadata repeated in internal chunks is merged by id, keeping its last version.
All original reading rows, values, source/basis fields and timestamps are retained.
No resampling, interpolation, additional classification or time alignment is applied.
IDs and exact decimal values use strings. Timestamps retain UTC microseconds.
Structured metadata, dimensions and provenance are JSON text.
Metadata reflects the original export time, not a historical version sequence.
Each hour used its own repeatable-read snapshot; late corrections require a refresh.
Sources and licensing: see source_id and https://hack-the-ried.de/quellen.
manifest.json contains the original snapshot, UTC period and table counts.
"""


def assemble(files, output):
    if not files:
        raise ValueError('Cannot assemble an empty month')
    output = Path(output)
    with tempfile.TemporaryDirectory(prefix='assemble-', dir=output.parent) as work:
        directory = Path(work)
        db = sqlite3.connect(directory / 'metadata.sqlite')
        # This database is disposable scratch, never the application database.
        db.execute('PRAGMA journal_mode=OFF')
        db.execute('PRAGMA synchronous=OFF')
        db.execute('PRAGMA cache_size=-8192')
        for table in ('entities', 'measurement_definitions'):
            db.execute(f'CREATE TABLE {table}(id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
        schemas = {}
        writer = None
        manifest = None
        total = 0
        last_reading = None
        try:
            for position, file in enumerate(files, 1):
                source = Path(file['path'])
                digest = hashlib.sha256()
                with source.open('rb') as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b''):
                        digest.update(block)
                if source.stat().st_size != file['size_bytes'] or digest.hexdigest() != file['sha256']:
                    raise ValueError('Input archive checksum or size mismatch')
                with zipfile.ZipFile(source) as archive:
                    if set(archive.namelist()) != MEMBERS or len(archive.namelist()) != len(MEMBERS):
                        raise ValueError('Unexpected input archive tables')
                    current = json.loads(archive.read('manifest.json'))
                    if current['format_version'] != 4 or current['format'] != 'parquet' or not current['complete']:
                        raise ValueError('Unsupported source archive')
                    if current['part'] != position:
                        raise ValueError('Missing or reordered source part')
                    if manifest is None:
                        manifest = current.copy()
                    elif any(current[k] != manifest[k] for k in ('month', 'generated_at', 'start', 'end_exclusive', 'snapshot_consistency', 'complete')):
                        raise ValueError('Source archives belong to different snapshots')
                    for table in ('entities', 'measurement_definitions', 'readings'):
                        target = directory / f'input-{table}.parquet'
                        with archive.open(f'{table}.parquet') as src, target.open('wb') as dest:
                            shutil.copyfileobj(src, dest, length=1024 * 1024)
                        parquet = pq.ParquetFile(target)
                        if parquet.metadata.num_rows != current['tables'][table]:
                            raise ValueError('Source table count mismatch')
                        if table in schemas and not schemas[table].equals(parquet.schema_arrow):
                            raise ValueError('Source table schemas differ')
                        schemas[table] = parquet.schema_arrow
                        if table != 'readings':
                            if table == 'measurement_definitions':
                                definition_ids = parquet.read(columns=['id']).column('id').combine_chunks()
                            for batch in parquet.iter_batches(batch_size=1000):
                                for row in batch.to_pylist():
                                    if table == 'measurement_definitions':
                                        previous = db.execute(f'SELECT payload FROM {table} WHERE id=?', (row['id'],)).fetchone()
                                        if previous:
                                            old = json.loads(previous[0])
                                            if any(old[k] != row[k] for k in ('entity_id', 'metric', 'unit', 'source_id', 'basis', 'dimensions', 'semantics')):
                                                raise ValueError('Measurement definition identity changed')
                                    db.execute(f'INSERT INTO {table}(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                                               (row['id'], json.dumps(row, ensure_ascii=False, separators=(',', ':'))))
                        else:
                            if parquet.metadata.num_rows != current['reading_count'] or current['reading_count'] != file['reading_count']:
                                raise ValueError('Source reading count mismatch')
                            if writer is None:
                                writer = pq.ParquetWriter(directory / 'readings.parquet', schemas[table], compression='zstd')
                            for batch in parquet.iter_batches(batch_size=10_000):
                                ids = batch.column(batch.schema.get_field_index('measurement_id'))
                                if ids.null_count or not pc.all(pc.is_in(ids, value_set=definition_ids)).as_py():
                                    raise ValueError('Broken source reading reference')
                                writer.write_batch(batch)
                                total += batch.num_rows
                        parquet.close()
                        target.unlink()
                    last_reading = current['last_reading']
            if writer:
                writer.close()
                writer = None
            # A definition must point to an entity in the merged table.
            missing = db.execute("""SELECT count(*) FROM measurement_definitions d
                LEFT JOIN entities e ON e.id=json_extract(d.payload,'$.entity_id') WHERE e.id IS NULL""").fetchone()[0]
            if missing:
                raise ValueError('Broken merged entity reference')
            counts = {'readings': total}
            for table in ('entities', 'measurement_definitions'):
                counts[table] = db.execute(f'SELECT count(*) FROM {table}').fetchone()[0]
                with pq.ParquetWriter(directory / f'{table}.parquet', schemas[table], compression='zstd') as metadata_writer:
                    cursor = db.execute(f'SELECT payload FROM {table} ORDER BY id')
                    while rows := cursor.fetchmany(1000):
                        metadata_writer.write_table(pa.Table.from_pylist([json.loads(row[0]) for row in rows], schema=schemas[table]))
            if total != sum(file['reading_count'] for file in files):
                raise ValueError('Merged reading count mismatch')
            manifest.update(part=1, reading_count=total, tables=counts, last_reading=last_reading)
            with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
                for table in ('entities', 'measurement_definitions', 'readings'):
                    archive.write(directory / f'{table}.parquet', f'{table}.parquet')
                archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
                archive.writestr('README.txt', README)
            return counts
        except BaseException:
            output.unlink(missing_ok=True)
            raise
        finally:
            if writer:
                writer.close()
            db.close()


if __name__ == '__main__':
    inputs, output = sys.argv[1:]
    print(json.dumps(assemble(json.loads(Path(inputs).read_text()), output)))
