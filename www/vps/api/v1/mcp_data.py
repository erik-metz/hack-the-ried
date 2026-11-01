"""Bounded canonical queries. No measurement cutover or provider acquisition."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException
from mcp_common import (
    METADATA_FIELDS,
    PROVENANCE_FIELDS,
    PUBLIC,
    envelope,
    public_fields,
    public_url,
    read_connection,
    rows,
)
from publication_service import filtered

MANIFEST = json.loads(Path(__file__).with_name('mcp_catalog.json').read_text())
REGIONAL = ('demographics/', 'realestate/', 'finance/', 'economy/', 'statistics/',
            'social/', 'infrastructure/', 'transport/')
DIMENSIONS = frozenset(('contract','municipality','municipality_id','region_code','year',
    'month','category','sex','age','age_group','height_m','depth_cm','depth_m','forecast_hour',
    'model','horizon','aggregation','direction','lane','species','type','frequency_mhz',
    'land_use','sector','interval','statistic','resolution','provider','period','scenario'))
FILTER_FIELDS = frozenset(('municipality','municipality_id','year','category','search'))


async def catalog(pool, *, regional=False, offset=0, limit=50):
    async with read_connection(pool) as conn:
        publications = await rows(conn, '''SELECT dataset AS id,source_id,source_updated_at,
            fetched_at,expires_at FROM collected_datasets
            WHERE dataset NOT LIKE 'social/source-diagnostics/%%' ORDER BY dataset''')
        kinds = await rows(conn, f'''SELECT e.entity_type AS kind,
            array_agg(DISTINCT d.source_id ORDER BY d.source_id) AS sources
            FROM entities e JOIN measurement_definitions d ON d.entity_id=e.id
            WHERE {PUBLIC} GROUP BY e.entity_type ORDER BY e.entity_type''')
    datasets = {key: {'id': key, 'kind': 'publication', 'availability': 'not_collected',
                      'sources': value, 'tool': 'query_dataset'} for key, value in MANIFEST.items()}
    now = datetime.now(UTC)
    for p in publications:
        datasets[p['id']] = {**p, 'kind': 'publication', 'sources': [p['source_id']],
            'availability': 'available' if p['expires_at'] > now else 'expired',
            'tool': 'query_dataset', 'filters': ['municipality','year','category','search'],
            'info': 'Published snapshot; source_updated_at is not the retrieval time.'}
    if not regional:
        for kind in kinds:
            key = 'core:' + kind['kind']
            datasets[key] = {'id': key, 'kind': 'canonical', 'entity_type': kind['kind'],
                'sources': kind['sources'], 'tool': 'search_entities', 'availability': 'available',
                'filters': ['entity_type','source_id','metric','search'],
                'info': 'Canonical public tables only; unmigrated legacy history is not included.'}
    result = [v for k, v in sorted(datasets.items()) if not regional or k.startswith(REGIONAL)]
    return envelope(result[offset:offset+limit+1], limit=limit, offset=offset,
        coverage='Public canonical tables and registered publications; no automatic history backfill.',
        license_notice='Original source terms apply; see source_id and /quellen.')


async def entities(pool, *, entity_id=None, entity_type=None, source_id=None, search=None,
                   offset=0, limit=50):
    conditions, params = [PUBLIC], []
    for expression, value in [('e.id=%s', entity_id), ('e.entity_type=%s', entity_type),
        ("EXISTS (SELECT 1 FROM measurement_definitions d WHERE d.entity_id=e.id AND d.source_id=%s)", source_id),
        ('(e.name ILIKE %s OR e.id ILIKE %s)', search)]:
        if value is not None:
            conditions.append(expression)
            params.extend([f'%{value}%'] * 2 if expression.startswith('(e.name') else [value])
    async with read_connection(pool) as conn:
        result = await rows(conn, f'''SELECT e.id,e.name,e.entity_type,e.metadata
            FROM entities e WHERE {' AND '.join(conditions)} ORDER BY e.id LIMIT %s OFFSET %s''',
            (*params, limit+1, offset))
    for row in result:
        row['metadata'] = public_fields(row['metadata'], METADATA_FIELDS)
    if entity_id and not result:
        raise HTTPException(404, 'Public entity not found')
    return envelope(result, limit=limit, offset=offset)


async def measurements(pool, *, entity_id=None, source_id=None, metric=None, offset=0, limit=50):
    where, params = [PUBLIC], []
    for column, value in [('d.entity_id', entity_id), ('d.source_id', source_id), ('d.metric', metric)]:
        if value is not None:
            where.append(f'{column}=%s')
            params.append(value)
    async with read_connection(pool) as conn:
        result = await rows(conn, f'''SELECT d.id,d.entity_id,d.metric,d.unit,d.source_id,
            d.basis,d.dimensions,d.semantics,d.minimum,d.maximum
            FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id
            WHERE {' AND '.join(where)} ORDER BY d.id LIMIT %s OFFSET %s''',
            (*params, limit+1, offset))
    for row in result:
        original = row['dimensions']
        row['dimensions'] = public_fields(original, DIMENSIONS)
        row['dimensions_omitted'] = sorted(set(original) - DIMENSIONS)
        # Do not expose arbitrary unrecognised dimension keys themselves.
        row['dimensions_omitted'] = bool(row['dimensions_omitted'])
    return envelope(result, limit=limit, offset=offset)


def time_range(start, end, maximum=31):
    if start.tzinfo is None or end.tzinfo is None or not start < end or end-start > timedelta(days=maximum):
        raise HTTPException(422, f'Use timezone-aware increasing timestamps within {maximum} days')


async def readings(pool, *, measurement_id, start=None, end=None, latest=False,
                   interval_seconds=None, aggregate=None, offset=0, limit=1000):
    if not latest:
        end = end or datetime.now(UTC)
        if start is None:
            raise HTTPException(422, 'start is required for historical readings')
        time_range(start, end)
    async with read_connection(pool) as conn:
        definition = await rows(conn, f'''SELECT d.id,d.entity_id,d.metric,d.unit,d.source_id,d.basis,d.semantics
            FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id
            WHERE {PUBLIC} AND d.id=%s''', (measurement_id,))
        if not definition:
            raise HTTPException(404, 'Public measurement not found')
        if aggregate is not None:
            allowed = {'instantaneous': {'avg','min','max','count'}, 'rate': {'avg','min','max','count'}}
            if aggregate not in allowed.get(definition[0]['semantics'], set()) or not interval_seconds:
                raise HTTPException(422, 'Aggregation is not defined for these measurement semantics')
            if (end-start).total_seconds() / interval_seconds > 2000:
                raise HTTPException(422, 'Choose a coarser interval (at most 2000 buckets)')
            result = await rows(conn, f'''SELECT date_bin(%s * interval '1 second',observed_at,
                '2000-01-01'::timestamptz) AS bucket,{aggregate}(value) AS value,count(*) AS sample_count
                FROM readings WHERE measurement_id=%s AND observed_at >= %s AND observed_at < %s
                AND quality='valid' GROUP BY bucket ORDER BY bucket LIMIT %s OFFSET %s''',
                (interval_seconds, measurement_id, start, end, limit+1, offset))
        else:
            result = await rows(conn, '''SELECT measurement_id,observed_at,value,quality,collected_at,
                period_start,period_end,provenance,revision FROM readings WHERE measurement_id=%s'''
                + ('' if latest else ' AND observed_at >= %s AND observed_at < %s')
                + ' ORDER BY observed_at DESC LIMIT %s OFFSET %s',
                (measurement_id, *((start, end) if not latest else ()), 1 if latest else limit+1, offset))
            for row in result:
                row['provenance'] = public_fields(row['provenance'], PROVENANCE_FIELDS)
                row['age_seconds'] = max(0, int((datetime.now(UTC)-row['observed_at']).total_seconds()))
    return envelope(result, limit=limit, offset=offset, definition=definition[0],
        start_inclusive=start, end_exclusive=end, aggregate=aggregate,
        freshness='Stored observations only; age is not a guarantee of current validity.')


async def publication_info(pool, dataset_id):
    if dataset_id.startswith('social/source-diagnostics/'):
        raise HTTPException(404, 'Use sanitised source diagnostics instead')
    if dataset_id.startswith('core:'):
        sample = await entities(pool, entity_type=dataset_id[5:], limit=1)
        if not sample['items']:
            raise HTTPException(404, 'Unknown public entity type')
        return envelope([{'id': dataset_id, 'kind': 'canonical', 'entity_type': dataset_id[5:],
            'tool': 'search_entities', 'measurement_tool': 'list_measurements',
            'coverage': 'Public canonical tables only; no legacy history fallback.'}])
    async with read_connection(pool) as conn:
        result = await rows(conn, '''SELECT dataset AS id,source_id,source_updated_at,
            fetched_at,expires_at,jsonb_typeof(data) AS shape,
            CASE WHEN jsonb_typeof(data)='object' THEN ARRAY(SELECT jsonb_object_keys(data))
                ELSE ARRAY[]::text[] END AS available_sections
            FROM collected_datasets WHERE dataset=%s''', (dataset_id,))
    if not result and dataset_id not in MANIFEST:
        raise HTTPException(404, 'Unknown public dataset')
    return envelope(result or [{'id': dataset_id, 'availability': 'not_collected',
                                'sources': MANIFEST[dataset_id]}])


def publication_page(response, *, section=None, filters=None, offset=0, limit=50):
    # Only consume output of the shared PUBLIC publication service. This preserves
    # domain-specific expiry, privacy and canonical read-model decisions.
    if response.status_code != 200:
        raise HTTPException(503, 'Public dataset is not available')
    data = json.loads(response.body)
    if section:
        for key in section.split('/'):
            if isinstance(data, dict) and key in data:
                data = data[key]
            elif isinstance(data, list) and key.isdecimal() and int(key) < len(data):
                data = data[int(key)]
            else:
                raise HTTPException(404, 'Public data section not found')
    filters = {k:v for k,v in (filters or {}).items() if k in FILTER_FIELDS and v}
    if isinstance(data, dict) and any(k != 'year' for k in filters):
        raise HTTPException(422, 'Select an array section before applying record filters')
    if filters:
        data = filtered(data, filters)
    result = data if isinstance(data, list) else [data]
    return envelope(result[offset:offset+limit+1], offset=offset, limit=limit,
        source_updated_at=response.headers.get('x-source-updated-at'),
        collected_at=response.headers.get('x-collected-at'),
        expires_at=response.headers.get('x-data-expires-at'),
        source=response.headers.get('x-data-source'), section=section,
        available_sections=sorted(data) if isinstance(data, dict) else [])


async def archives(pool, offset=0, limit=50):
    async with read_connection(pool) as conn:
        result = await rows(conn, '''SELECT month,format_version,generated_at,is_complete,
            reading_count,size_bytes,files FROM data_archives a WHERE NOT EXISTS (
              SELECT 1 FROM unnest(a.station_ids) AS included(station_id) WHERE NOT EXISTS (
                SELECT 1 FROM sensor_metadata s WHERE s.id=included.station_id AND NOT s.is_hidden))
            AND NOT EXISTS (SELECT 1 FROM unnest(a.entity_ids) AS included(entity_id)
              WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id=included.entity_id
                AND NOT e.is_hidden AND e.metadata->>'legacy_deleted' IS DISTINCT FROM 'true'))
            ORDER BY month DESC LIMIT %s OFFSET %s''', (limit+1, offset))
    for row in result:
        row['files'] = [{k: public_url(v) if k == 'url' else v for k,v in file.items()
                        if k in {'filename','format','url','size_bytes','reading_count','sha256'}}
                        for file in row['files']]
    return envelope(result, limit=limit, offset=offset)
