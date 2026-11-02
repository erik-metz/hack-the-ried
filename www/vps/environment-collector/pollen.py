"""CAMS Europe pollen forecast snapshots; provider issue time is unknown."""

import hashlib
import json
import math
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from urllib.parse import urlencode

from psycopg.types.json import Jsonb
from soil import POINTS

SOURCE = 'environment-pollen-cams'
SPECIES = ('alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed')
URL = 'https://air-quality-api.open-meteo.com/v1/air-quality?' + urlencode({
    'latitude': ','.join(str(p[2]) for p in POINTS),
    'longitude': ','.join(str(p[3]) for p in POINTS),
    'hourly': ','.join(s + '_pollen' for s in SPECIES),
    'domains': 'cams_europe', 'forecast_days': 5, 'timezone': 'UTC',
})


async def acquire(client, settings, conn, now=None):
    now = now or datetime.now(UTC)
    last = await (await conn.execute("""SELECT received_at,status FROM collection_attempts
        WHERE source_id=%s ORDER BY received_at DESC,id DESC LIMIT 1""", (SOURCE,))).fetchone()
    if last and (now - last[0]).total_seconds() < settings.pollen_poll_seconds:
        if last[1] != 'success':
            raise ValueError('Pollen retry not due; previous attempt has not succeeded')
        return None
    try:
        response = await client.get(URL, timeout=settings.request_timeout)
        if len(response.content) > 20 * 1024 * 1024:
            raise ValueError('Pollen response exceeds 20 MiB')
    except Exception as exc:
        await conn.execute("INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'failed',%s)",
                           (SOURCE, type(exc).__name__))
        await conn.commit()
        raise
    body = response.content
    digest = hashlib.sha256(body).hexdigest()
    async with conn.transaction():
        await conn.execute("""INSERT INTO collected_payloads(sha256,size_bytes,content_type)
            VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING""", (digest, len(body)))
        row = await (await conn.execute("""INSERT INTO collection_attempts
            (source_id,http_status,payload_sha256,status) VALUES (%s,%s,%s,%s) RETURNING id,received_at""",
            (SOURCE, response.status_code, digest, 'received' if response.is_success else 'failed'))).fetchone()
    await conn.commit()
    response.raise_for_status()
    return {'_body': body, 'data': json.loads(body), 'attempt_id': row[0], 'snapshot_at': row[1].isoformat(), 'sha256': digest}


def normalize(bundle):
    data = bundle['data']
    snapshot = datetime.fromisoformat(bundle['snapshot_at'])
    if snapshot.tzinfo is None:
        raise ValueError('Pollen snapshot time requires a timezone')
    midnight = snapshot.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    if not isinstance(data, list) or len(data) != len(POINTS):
        raise ValueError('Pollen response must contain all four requested points')
    points = []
    for point, response in zip(POINTS, data, strict=True):
        if response.get('utc_offset_seconds') != 0:
            raise ValueError('Pollen timestamps must be UTC')
        lat, lon = response.get('latitude'), response.get('longitude')
        if not all(type(v) in (int, float) and math.isfinite(v) for v in (lat, lon)):
            raise ValueError('Missing pollen grid coordinates')
        if abs(lat - point[2]) > .2 or abs(lon - point[3]) > .2:
            raise ValueError('Unexpected pollen grid point')
        hourly, units = response['hourly'], response['hourly_units']
        if units.get('time') != 'iso8601':
            raise ValueError('Unexpected pollen time unit')
        times = []
        for value in hourly['time']:
            stamp = datetime.fromisoformat(value)
            if stamp.tzinfo is not None and stamp.utcoffset() != timedelta(0):
                raise ValueError('Non-UTC pollen timestamp')
            times.append(stamp.replace(tzinfo=UTC))
        if not times or len(times) > 168 or len(set(times)) != len(times):
            raise ValueError('Invalid pollen time axis')
        # An acquisition spanning midnight may still return the previous UTC day.
        if any(t < midnight-timedelta(days=1) or t >= midnight+timedelta(days=7) for t in times):
            raise ValueError('Unexpected pollen forecast horizon')
        if any(b-a != timedelta(hours=1) for a, b in pairwise(times)):
            raise ValueError('Pollen timestamps must be increasing hourly steps')
        rows = []
        for species in SPECIES:
            variable = species + '_pollen'
            values = hourly.get(variable)
            if not isinstance(values, list) or len(values) != len(times) or units.get(variable) != 'grains/m³':
                raise ValueError(f'Invalid pollen variable, unit or length: {variable}')
            for stamp, value in zip(times, values, strict=True):
                if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or value < 0):
                    raise ValueError('Invalid pollen concentration')
                rows.append((species, stamp, value, 'missing' if value is None else 'valid'))
        points.append({'point': point, 'latitude': lat, 'longitude': lon, 'rows': rows})
    return points


async def persist(conn, bundle, points):
    async with conn.transaction():
        receipt = await (await conn.execute("""SELECT p.body,a.payload_sha256,a.received_at FROM collection_attempts a
            JOIN collected_payloads p ON p.sha256=a.payload_sha256
            WHERE a.id=%s AND a.source_id=%s AND a.http_status=200
                AND a.status IN ('received','success')""", (bundle['attempt_id'], SOURCE))).fetchone()
        raw = bundle.get('_body', receipt[0] if receipt else None)
        if (receipt is None or raw is None or json.loads(bytes(raw)) != bundle['data']
                or hashlib.sha256(bytes(raw)).hexdigest() != receipt[1]
                or bundle['sha256'] != receipt[1]
                or datetime.fromisoformat(bundle['snapshot_at']) != receipt[2]
                or points != normalize(bundle)):
            raise ValueError('Pollen snapshot differs from archived receipt')
        unchanged = await (await conn.execute("""SELECT EXISTS (SELECT 1 FROM collection_attempts
            WHERE source_id=%s AND payload_sha256=%s AND status='success')""", (SOURCE, receipt[1]))).fetchone()
        if unchanged[0]:
            await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s", (bundle['attempt_id'],))
            return 0
        count = 0
        for item in points:
            slug, name, requested_lat, requested_lon = item['point']
            entity = 'environment:pollen:' + slug
            metadata = {'municipality': name, 'latitude': item['latitude'], 'longitude': item['longitude'],
                'requested_latitude': requested_lat, 'requested_longitude': requested_lon,
                'model': 'CAMS Europe', 'resolution_km': 11}
            await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata)
                VALUES (%s,%s,'model_point',%s) ON CONFLICT(id) DO UPDATE
                SET metadata=entities.metadata || EXCLUDED.metadata,updated_at=NOW()""",
                (entity, f'{name} — CAMS Pollenmodell', Jsonb(metadata)))
            provenance = {'license': 'CC-BY-4.0', 'attribution': 'CAMS ENSEMBLE / Open-Meteo',
                'model': 'cams_europe', 'spatial_reference': metadata, 'source_url': URL,
                'product_type': 'forecast', 'forecast_identity': 'response_snapshot',
                'provider_issue_time': None, 'snapshot_at': receipt[2].isoformat()}
            args = [(entity, SOURCE, Jsonb({'species': species, 'snapshot_sha256': receipt[1]}), stamp,
                     value, bundle['attempt_id'], Jsonb(provenance), quality)
                    for species, stamp, value, quality in item['rows']]
            async with conn.cursor() as cursor:
                await cursor.executemany("""SELECT write_environment_measurement(
                    %s,'pollen_concentration','grains/m3',%s,'model',%s,%s,%s::numeric,%s,%s,%s)""", args)
            count += len(args)
        await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s", (bundle['attempt_id'],))
    return count
