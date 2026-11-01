"""Write the three original tables as a lossless, compressed Parquet ZIP part."""
import json
import sys
import zipfile
from datetime import UTC, datetime

import pyarrow as pa
import pyarrow.parquet as pq

COLUMNS = {
    'entities': ['id', 'name', 'entity_type', 'metadata'],
    'measurement_definitions': ['id', 'entity_id', 'metric', 'unit', 'source_id', 'basis', 'dimensions', 'semantics', 'minimum', 'maximum'],
    'readings': ['measurement_id', 'observed_at', 'value', 'quality', 'collected_at', 'period_start', 'period_end', 'provenance', 'revision'],
}
TIMES = {'observed_at', 'collected_at', 'period_start', 'period_end'}
INTS = {'revision'}


def normalize(row, table):
    converted = {}
    for column in COLUMNS[table]:
        value = row.get(column)
        if value is not None and column in TIMES:
            value = datetime.fromisoformat(value).astimezone(UTC)
        elif value is not None and column in INTS:
            value = int(value)
        elif value is not None and isinstance(value, (dict, list)):
            value = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        elif value is not None and column not in TIMES and column not in INTS:
            value = str(value)
        converted[column] = value
    return converted


def convert(source_dir, source_rows, output, manifest_path, readme_path):
    schemas = {}
    writers = {}
    metadata = {}
    for table in ('entities', 'measurement_definitions'):
        with open(f'{source_dir}/{table}.json', encoding='utf8') as source:
            metadata[table] = json.load(source)
    counts = {'entities': 0, 'measurement_definitions': 0, 'readings': 0}
    for table, columns in COLUMNS.items():
        schema = pa.schema([pa.field(c, pa.timestamp('us', tz='UTC') if c in TIMES else
            pa.int64() if c in INTS else pa.string(), nullable=True) for c in columns])
        schemas[table] = schema
        writers[table] = pq.ParquetWriter(f'{source_dir}/{table}.parquet', schema, compression='zstd')
    batches = {'readings': []}
    try:
        with open(source_rows, encoding='utf8') as stream:
            for line in stream:
                table = 'readings'
                batch = batches[table]
                batch.append(normalize(json.loads(line), table))
                counts[table] = counts.get(table, 0) + 1
                if len(batch) == 10_000:
                    writers[table].write_table(pa.Table.from_pylist(batch, schema=schemas[table]))
                    batch.clear()
        for table, batch in batches.items():
            if batch:
                writers[table].write_table(pa.Table.from_pylist(batch, schema=schemas[table]))
        for table in ('entities', 'measurement_definitions'):
            batch = [normalize(row, table) for row in metadata[table]]
            counts[table] = len(batch)
            for offset in range(0, len(batch), 10_000):
                writers[table].write_table(pa.Table.from_pylist(batch[offset:offset + 10_000], schema=schemas[table]))
    finally:
        for writer in writers.values():
            writer.close()


def main():
    directory, source_rows, output, manifest_path, readme_path = sys.argv[1:]
    convert(directory, source_rows, output, manifest_path, readme_path)
    with open(manifest_path, encoding='utf8') as stream:
        manifest = json.load(stream)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as archive:
        for table in manifest['tables']:
            target = f'{directory}/{table}.parquet'
            archive.write(target, f'{table}.parquet')
        manifest['format'] = 'parquet'
        archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.write(readme_path, 'README.txt')


if __name__ == '__main__':
    main()
