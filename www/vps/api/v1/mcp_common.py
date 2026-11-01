"""Public output contracts, precision and bounded read transactions."""

import json
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from decimal import Decimal
from urllib.parse import urlsplit, urlunsplit

import psycopg
from fastapi import HTTPException
from psycopg_pool import PoolTimeout, TooManyRequests

# Keep the export visibility boundary without importing pyarrow/ZIP handlers.
PUBLIC = """NOT e.is_hidden AND e.metadata->>'legacy_deleted' IS DISTINCT FROM 'true'
    AND e.entity_type <> 'inaturalist_observation'
    AND (e.id NOT LIKE 'sensor:%%' OR EXISTS (
        SELECT 1 FROM sensor_metadata s WHERE s.id=substr(e.id,8) AND NOT s.is_hidden))"""
MAX_BYTES = 512 * 1024
METADATA_FIELDS = frozenset(('region','municipality','municipality_id','region_code','latitude',
    'longitude','elevation_m','description','name','category','type','attribution','license',
    'source_url','reference','registration','aircraft_type','icao24'))
PROVENANCE_FIELDS = frozenset(('algorithm','region','latitude','longitude','source_url',
    'license','attribution','contract','method','quality','phase_name'))


def public_url(value):
    if not isinstance(value, str):
        return None
    try:
        p = urlsplit(value)
        if p.scheme not in {'https', 'http'} or not p.hostname or p.username or p.password:
            return None
        return urlunsplit((p.scheme, p.netloc, p.path, '', ''))
    except ValueError:
        return None


def public_fields(value, fields):
    result = {k: v for k, v in (value or {}).items() if k in fields}
    if 'source_url' in result:
        result['source_url'] = public_url(result['source_url'])
    return result


def exact(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: (str(v) if k in {'measurement_id', 'id', 'revision'} and isinstance(v, int)
                    else exact(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [exact(v) for v in value]
    return value


def envelope(items, *, limit=None, offset=0, **metadata):
    more = limit is not None and len(items) > limit
    result = exact({'items': items[:limit] if limit else items,
        'generated_at': datetime.now(UTC), 'next_offset': offset + limit if more else None,
        **metadata})
    if len(json.dumps(result, ensure_ascii=False, allow_nan=False).encode()) > MAX_BYTES:
        raise HTTPException(413, 'Result too large; narrow filters or use archives')
    return result


@asynccontextmanager
async def read_connection(pool):
    try:
        async with pool.connection() as conn, conn.transaction():
            await conn.execute('SET TRANSACTION READ ONLY')
            await conn.execute("SET LOCAL statement_timeout = '5s'")
            yield conn
    except (psycopg.errors.QueryCanceled, PoolTimeout, TooManyRequests):
        raise HTTPException(503, 'Data query temporarily unavailable') from None
    except psycopg.errors.UndefinedTable:
        raise HTTPException(503, 'Required data migration is not available') from None


async def rows(conn, query, params=()):
    return await (await conn.execute(query, params)).fetchall()
