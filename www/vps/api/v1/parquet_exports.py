"""Typed Parquet serialization for the public ZIP download contract."""

import json
from datetime import UTC, datetime
from decimal import Decimal

import pyarrow as pa
import pyarrow.parquet as pq

TIME_COLUMNS = {'observed_at', 'collected_at', 'period_start', 'period_end',
                'start_time', 'end_time', 'last_seen_at'}
BOOL_COLUMNS = {'is_active'}
INTEGER_COLUMNS = {'revision', 'delay_seconds', 'length_meters'}
def schema_for(columns):
    fields = []
    for column in columns:
        if column in TIME_COLUMNS:
            dtype = pa.timestamp('us', tz='UTC')
        elif column in BOOL_COLUMNS:
            dtype = pa.bool_()
        elif column in INTEGER_COLUMNS:
            dtype = pa.int64()
        else:
            # IDs and decimal measurements stay text so bigint IDs and arbitrary
            # PostgreSQL numeric precision survive every reader unchanged.
            dtype = pa.string()
        fields.append(pa.field(column, dtype, nullable=True))
    return pa.schema(fields)


def normalize_value(column, value):
    if value is None:
        return None
    if column in TIME_COLUMNS:
        if isinstance(value, str):
            value = datetime.fromisoformat(value)
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    if column in BOOL_COLUMNS:
        return bool(value)
    if column in INTEGER_COLUMNS:
        return int(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    if isinstance(value, (Decimal, int, float)):
        return str(value)
    return str(value)


def table_from_rows(rows, columns):
    schema = schema_for(columns)
    data = {column: [normalize_value(column, row.get(column)) for row in rows]
            for column in columns}
    return pa.Table.from_pydict(data, schema=schema)


def write_parquet(writer, rows, columns):
    table = table_from_rows(rows, columns)
    writer.write_table(table, row_group_size=50_000)


def parquet_bytes(rows, columns):
    import io
    output = io.BytesIO()
    pq.write_table(table_from_rows(rows, columns), output, compression='zstd')
    return output.getvalue()
