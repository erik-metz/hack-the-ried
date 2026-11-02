"""Archived single-run ICON soil/evapotranspiration/radiation forecasts."""

import hashlib
import json
import math
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from urllib.parse import urlencode

from psycopg.types.json import Jsonb

SOURCE = 'environment-soil-icon'
POINTS = (
    ('buerstadt', 'Bürstadt', 49.6425, 8.4552),
    ('lampertheim', 'Lampertheim', 49.597, 8.472),
    ('biblis', 'Biblis', 49.687, 8.458),
    ('gross-rohrheim', 'Groß-Rohrheim', 49.721, 8.482),
)
# variable: (metric, provider unit, canonical unit, semantics, dimensions)
VARIABLES = {}
for layer in ('0_to_1', '1_to_3', '3_to_9', '9_to_27', '27_to_81'):
    low, high = map(int, layer.split('_to_'))
    VARIABLES[f'soil_moisture_{layer}cm'] = ('soil_moisture', 'm³/m³', 'm3/m3', 'instantaneous',
        {'depth_start_cm': low, 'depth_end_cm': high})
for depth in (0, 6, 18, 54):
    VARIABLES[f'soil_temperature_{depth}cm'] = ('soil_temperature', '°C', '°C', 'instantaneous', {'depth_cm': depth})
VARIABLES.update({
    'et0_fao_evapotranspiration': ('reference_evapotranspiration', 'mm', 'mm', 'period_total', {'method': 'FAO-56'}),
    'evapotranspiration': ('evapotranspiration', 'mm', 'mm', 'period_total', {}),
    'shortwave_radiation': ('shortwave_radiation', 'W/m²', 'W/m2', 'rate', {'aggregation': 'previous_hour_mean'}),
})


def request_url(base_url, now):
    # Explicit initialization cycle, with conservative eight-hour availability lag.
    eligible = now.astimezone(UTC) - timedelta(hours=8)
    run = eligible.replace(hour=(eligible.hour // 6) * 6, minute=0, second=0, microsecond=0)
    params = {'latitude': ','.join(str(p[2]) for p in POINTS),
              'longitude': ','.join(str(p[3]) for p in POINTS), 'models': 'icon_global',
              'run': run.strftime('%Y-%m-%dT%H:%M'), 'hourly': ','.join(VARIABLES),
              'forecast_days': 7, 'timezone': 'UTC'}
    return base_url + '?' + urlencode(params), run


async def acquire(client, settings, conn, now=None):
    now = now or datetime.now(UTC)
    last = await (await conn.execute("""SELECT received_at,status FROM collection_attempts
        WHERE source_id=%s ORDER BY received_at DESC,id DESC LIMIT 1""", (SOURCE,))).fetchone()
    if last and (now - last[0]).total_seconds() < settings.soil_poll_seconds:
        if last[1] != 'success':
            raise ValueError('Soil retry not due; previous attempt has not succeeded')
        return None
    url, run = request_url(settings.soil_url, now)
    try:
        response = await client.get(url, timeout=settings.request_timeout)
    except Exception as exc:
        await conn.execute("INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'failed',%s)",
                           (SOURCE, type(exc).__name__))
        await conn.commit()
        raise
    if len(response.content) > 20 * 1024 * 1024:
        raise ValueError('Soil response exceeds 20 MiB')
    body = response.content
    digest = hashlib.sha256(body).hexdigest()
    async with conn.transaction():
        await conn.execute("""INSERT INTO collected_payloads(sha256,size_bytes,content_type)
            VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING""", (digest, len(body)))
        row = await (await conn.execute("""INSERT INTO collection_attempts
            (source_id,http_status,payload_sha256,status) VALUES (%s,%s,%s,%s) RETURNING id""",
            (SOURCE, response.status_code, digest, 'received' if response.is_success else 'failed'))).fetchone()
    await conn.commit()
    response.raise_for_status()
    return {'_body': body, 'data': json.loads(body), 'run': run.isoformat(), 'url': url, 'attempt_id': row[0]}


def normalize(bundle):
    data = bundle['data']
    run = datetime.fromisoformat(bundle['run']).astimezone(UTC)
    if not isinstance(data, list) or len(data) != len(POINTS):
        raise ValueError('Soil response must contain all four requested points')
    result = []
    for point, response in zip(POINTS, data, strict=True):
        if response.get('utc_offset_seconds') != 0:
            raise ValueError('Soil timestamps must be UTC')
        lat, lon = response.get('latitude'), response.get('longitude')
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lat, lon)):
            raise ValueError('Missing grid coordinates')
        if abs(lat - point[2]) > .2 or abs(lon - point[3]) > .2:
            raise ValueError('Unexpected grid point or response order')
        hourly, units = response['hourly'], response['hourly_units']
        times = [datetime.fromisoformat(t).replace(tzinfo=UTC) for t in hourly['time']]
        if not times or len(times) > 192 or len(set(times)) != len(times):
            raise ValueError('Invalid soil time axis')
        if any(t < run.replace(hour=0) or t > run + timedelta(days=8) for t in times):
            raise ValueError('Unexpected forecast horizon')
        if any(b - a != timedelta(hours=1) for a, b in pairwise(times)):
            raise ValueError('Soil timestamps must be increasing hourly steps')
        rows = []
        for variable, (metric, provider_unit, unit, semantics, dims) in VARIABLES.items():
            values = hourly.get(variable)
            if units.get(variable) != provider_unit or not isinstance(values, list) or len(values) != len(times):
                raise ValueError(f'Invalid soil variable/unit/time axis: {variable}')
            for stamp, value in zip(times, values, strict=True):
                if value is not None:
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                        raise ValueError(f'Invalid value: {variable}')
                    if metric == 'soil_moisture' and not 0 <= value <= 1:
                        raise ValueError('Soil moisture outside volumetric bounds')
                    if metric in ('reference_evapotranspiration', 'evapotranspiration', 'shortwave_radiation') and value < 0:
                        raise ValueError('Negative total/radiation')
                if stamp < run:
                    continue
                start = stamp - timedelta(hours=1) if semantics in ('period_total', 'rate') else None
                rows.append((metric, unit, dims, stamp, value, 'missing' if value is None else 'valid', start,
                             stamp if start else None, semantics))
        result.append({'point': point, 'latitude': lat, 'longitude': lon, 'run': run, 'rows': rows})
    return result


async def persist(conn, bundle, points):
    count = 0
    async with conn.transaction():
        # Re-validate the archived bytes rather than trusting a caller-supplied bundle.
        row = await (await conn.execute("""SELECT p.body,a.payload_sha256 FROM collection_attempts a
            JOIN collected_payloads p ON p.sha256=a.payload_sha256
            WHERE a.id=%s AND a.source_id=%s AND a.http_status=200
                AND a.status IN ('received','success')""", (bundle['attempt_id'], SOURCE))).fetchone()
        raw = bundle.get('_body', row[0] if row else None)
        if row is None or raw is None or json.loads(bytes(raw)) != bundle['data'] or hashlib.sha256(bytes(raw)).hexdigest() != row[1]:
            raise ValueError('Soil bundle differs from archived response')
        if points != normalize(bundle):
            raise ValueError('Normalized soil points do not match source')
        unchanged = await (await conn.execute("""SELECT EXISTS (
            SELECT 1 FROM collection_attempts previous JOIN collection_attempts current
                ON current.payload_sha256=previous.payload_sha256
            WHERE current.id=%s AND previous.source_id=%s AND previous.status='success'
                AND previous.id<>current.id) AND EXISTS (
            SELECT 1 FROM measurement_definitions WHERE source_id=%s
                AND (dimensions->>'issued_at')::timestamptz=%s)""",
            (bundle['attempt_id'], SOURCE, SOURCE, points[0]['run']))).fetchone()
        if unchanged[0]:
            await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s", (bundle['attempt_id'],))
            return 0
        for item in points:
            slug, name, requested_lat, requested_lon = item['point']
            entity = 'environment:soil:' + slug
            metadata = {'municipality': name, 'latitude': item['latitude'], 'longitude': item['longitude'],
                        'requested_latitude': requested_lat, 'requested_longitude': requested_lon,
                        'model': 'ICON Global', 'resolution_km': 11}
            await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata)
                VALUES (%s,%s,'model_point',%s) ON CONFLICT(id) DO UPDATE
                SET metadata=entities.metadata || EXCLUDED.metadata,updated_at=NOW()""",
                (entity, f'{name} — ICON Bodenmodell', Jsonb(metadata)))
            provenance = {'license': 'CC-BY-4.0', 'attribution': 'DWD ICON / Open-Meteo',
                'model': 'icon_global', 'spatial_reference': metadata, 'source_url': bundle['url'],
                'issued_at_semantics': 'model_initialization_time'}
            args = [(entity, metric, unit, SOURCE, Jsonb(dims), stamp, value, bundle['attempt_id'],
                     Jsonb(provenance), quality, start, end, semantics, item['run'])
                    for metric, unit, dims, stamp, value, quality, start, end, semantics in item['rows']]
            async with conn.cursor() as cursor:
                await cursor.executemany("""SELECT write_environment_measurement(
                    %s,%s,%s,%s,'forecast',%s,%s,%s::numeric,%s,%s,%s,%s,%s,%s,%s)""", args)
            count += len(args)
        await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s", (bundle['attempt_id'],))
    return count
