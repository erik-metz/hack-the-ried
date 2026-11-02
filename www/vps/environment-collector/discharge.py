"""GloFAS v4 discharge snapshots; issue time and river assignment are unknown."""

import hashlib
import json
import math
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from urllib.parse import urlencode

from psycopg.types.json import Jsonb

SOURCE = 'environment-discharge-glofas'
ENTITY = 'environment:discharge:worms'
LATITUDE, LONGITUDE = 49.63, 8.37
STATISTICS = ('control', 'mean', 'median', 'min', 'max', 'p25', 'p75')
VARIABLES = {stat: 'river_discharge' + ('' if stat == 'control' else '_' + stat) for stat in STATISTICS}
URL = 'https://flood-api.open-meteo.com/v1/flood?' + urlencode({
    'latitude': LATITUDE, 'longitude': LONGITUDE, 'daily': ','.join(VARIABLES.values()),
    'models': 'forecast_v4', 'forecast_days': 14, 'timezone': 'UTC',
})

async def acquire(client, settings, conn, now=None):
    now = now or datetime.now(UTC)
    last = await (await conn.execute("""SELECT received_at,status FROM collection_attempts
        WHERE source_id=%s ORDER BY received_at DESC,id DESC LIMIT 1""", (SOURCE,))).fetchone()
    if last and (now - last[0]).total_seconds() < settings.discharge_poll_seconds:
        if last[1] != 'success':
            raise ValueError('Discharge retry not due; previous attempt has not succeeded')
        return None
    try:
        response = await client.get(URL, timeout=settings.request_timeout)
        if len(response.content) > 20 * 1024 * 1024:
            raise ValueError('Discharge response exceeds 20 MiB')
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
    response = bundle['data']
    snapshot = datetime.fromisoformat(bundle['snapshot_at'])
    if snapshot.tzinfo is None:
        raise ValueError('Discharge snapshot time requires a timezone')
    midnight = snapshot.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    if not isinstance(response, dict) or response.get('utc_offset_seconds') != 0:
        raise ValueError('Expected one UTC discharge reference point')
    lat, lon = response.get('latitude'), response.get('longitude')
    if not all(type(v) in (int, float) and math.isfinite(v) for v in (lat, lon)):
        raise ValueError('Missing discharge grid coordinates')
    if abs(lat-LATITUDE) > .05 or abs(lon-LONGITUDE) > .05:
        raise ValueError('Unexpected discharge grid point')
    daily, units = response['daily'], response['daily_units']
    if units.get('time') != 'iso8601' or not isinstance(daily['time'], list):
        raise ValueError('Invalid discharge time axis')
    times = []
    for value in daily['time']:
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError('Discharge time must be a UTC day')
        times.append(datetime.fromisoformat(value).replace(tzinfo=UTC))
    if len(times) != 14 or len(set(times)) != len(times):
        raise ValueError('Discharge response requires 14 distinct days')
    if times[0] not in (midnight, midnight-timedelta(days=1)):
        raise ValueError('Unexpected discharge forecast horizon')
    if any(b-a != timedelta(days=1) for a, b in pairwise(times)):
        raise ValueError('Discharge days must be increasing and consecutive')
    rows = []
    for statistic, variable in VARIABLES.items():
        values = daily.get(variable)
        if not isinstance(values, list) or len(values) != len(times) or units.get(variable) != 'm³/s':
            raise ValueError(f'Invalid discharge variable, unit or length: {variable}')
        for stamp, value in zip(times, values, strict=True):
            if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or value < 0):
                raise ValueError('Invalid river discharge')
            rows.append((statistic, stamp, value, 'missing' if value is None else 'valid'))
    for index in range(len(times)):
        ordered = [daily[VARIABLES[s]][index] for s in ('min', 'p25', 'median', 'p75', 'max')]
        known = [v for v in ordered if v is not None]
        if known != sorted(known):
            raise ValueError('Discharge ensemble statistics are inconsistent')
        low, high, mean = daily[VARIABLES['min']][index], daily[VARIABLES['max']][index], daily[VARIABLES['mean']][index]
        if mean is not None and ((low is not None and mean < low) or (high is not None and mean > high)):
            raise ValueError('Discharge ensemble mean outside range')
    return {'latitude': lat, 'longitude': lon, 'rows': rows}


async def persist(conn, bundle, point):
    async with conn.transaction():
        await conn.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (SOURCE,))
        receipt = await (await conn.execute("""SELECT p.body,a.payload_sha256,a.received_at FROM collection_attempts a
            JOIN collected_payloads p ON p.sha256=a.payload_sha256
            WHERE a.id=%s AND a.source_id=%s AND a.http_status=200
                AND a.status IN ('received','success')""", (bundle['attempt_id'], SOURCE))).fetchone()
        raw = bundle.get('_body', receipt[0] if receipt else None)
        if (receipt is None or raw is None or json.loads(bytes(raw)) != bundle['data']
                or hashlib.sha256(bytes(raw)).hexdigest() != receipt[1]
                or bundle['sha256'] != receipt[1]
                or datetime.fromisoformat(bundle['snapshot_at']) != receipt[2]
                or point != normalize(bundle)):
            raise ValueError('Discharge snapshot differs from archived receipt')
        unchanged = await (await conn.execute("""SELECT EXISTS (SELECT 1 FROM collection_attempts
            WHERE source_id=%s AND payload_sha256=%s AND status='success')""", (SOURCE, receipt[1]))).fetchone()
        if unchanged[0]:
            await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s", (bundle['attempt_id'],))
            return 0
        metadata = {'reference_point': 'Referenzpunkt bei Worms', 'latitude': point['latitude'], 'longitude': point['longitude'],
            'requested_latitude': LATITUDE, 'requested_longitude': LONGITUDE, 'crs': 'EPSG:4326',
            'model': 'GloFAS v4 Forecast', 'resolution_km': 5, 'river_assignment': 'unverified'}
        await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata)
            VALUES (%s,'GloFAS Referenzpunkt bei Worms','model_point',%s) ON CONFLICT(id) DO UPDATE
            SET metadata=entities.metadata || EXCLUDED.metadata,updated_at=NOW()""", (ENTITY, Jsonb(metadata)))
        provenance = {'license': 'CC-BY-4.0', 'attribution': 'Copernicus CEMS GloFAS / Open-Meteo',
            'model': 'forecast_v4', 'spatial_reference': metadata, 'source_url': URL,
            'product_type': 'forecast', 'forecast_identity': 'response_snapshot',
            'provider_issue_time': None, 'snapshot_at': receipt[2].isoformat(),
            'temporal_resolution': 'daily', 'statistic_axis': 'ensemble'}
        args = [(ENTITY, SOURCE, Jsonb({'statistic': stat, 'snapshot_sha256': receipt[1]}), stamp,
                 value, bundle['attempt_id'], Jsonb(provenance), quality, stamp, stamp+timedelta(days=1))
                for stat, stamp, value, quality in point['rows']]
        async with conn.cursor() as cursor:
            await cursor.executemany("""SELECT write_environment_measurement(
                %s,'river_discharge','m3/s',%s,'model',%s,%s,%s::numeric,%s,%s,%s,%s,%s,'rate')""", args)
        await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s", (bundle['attempt_id'],))
    return len(args)
