"""Bounded NOAA-20 thermal-anomaly acquisition; never a confirmed fire alert."""

import asyncio
import csv
import hashlib
import io
import json
import logging
import math
import os
import re
from datetime import UTC, datetime, timedelta

from ecostress_raster import BBOX
from psycopg.types.json import Jsonb
from publications import acquisition_error, publish

PRODUCT = 'VIIRS_NOAA20_NRT'
DATASET = 'environment/firms/anomalies'
MAX_BYTES = 1024 * 1024
MAX_ROWS = 5000
ARCHIVE_BUDGET = 50 * 1024 * 1024
COLUMNS = ('latitude', 'longitude', 'bright_ti4', 'scan', 'track', 'acq_date',
           'acq_time', 'satellite', 'instrument', 'confidence', 'version',
           'bright_ti5', 'frp', 'daynight')


class FirmsLogFilter(logging.Filter):
    def filter(self, record):
        return '/api/area/csv/' not in record.getMessage()


# The MAP_KEY is in the path, not a header. Suppress credential-bearing HTTP logs.
logging.getLogger('httpx').addFilter(FirmsLogFilter())


def parse_csv(body, now=None):
    now = now or datetime.now(UTC)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=2)
    if len(body) > MAX_BYTES:
        raise ValueError('FIRMS byte limit exceeded')
    reader = csv.DictReader(io.StringIO(body.decode('utf-8-sig')), strict=True)
    if (not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames)
            or not set(COLUMNS).issubset(reader.fieldnames)):
        raise ValueError('Unexpected FIRMS CSV header')
    result = {}
    for index, row in enumerate(reader):
        if index >= MAX_ROWS or None in row or any(row.get(k) is None for k in COLUMNS):
            raise ValueError('Invalid bounded FIRMS row')
        numbers = {k: float(row[k]) for k in ('latitude', 'longitude', 'bright_ti4', 'bright_ti5', 'scan', 'track', 'frp')}
        if not all(math.isfinite(v) for v in numbers.values()):
            raise ValueError('Nonfinite FIRMS value')
        lat, lon = numbers['latitude'], numbers['longitude']
        if not (BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]):
            raise ValueError('FIRMS point outside AOI')
        time = row['acq_time'].zfill(4)
        if not re.fullmatch(r'\d{4}', time):
            raise ValueError('Invalid FIRMS UTC time')
        stamp = datetime.strptime(row['acq_date'] + time, '%Y-%m-%d%H%M').replace(tzinfo=UTC)
        if not start <= stamp <= now + timedelta(minutes=5):
            raise ValueError('FIRMS acquisition outside requested window')
        if (row['satellite'] != 'N20' or row['instrument'] != 'VIIRS'
                or row['confidence'] not in {'l', 'n', 'h'} or row['daynight'] not in {'D', 'N'}
                or not re.fullmatch(r'\d+(?:\.\d+)?(?:NRT|URT|RT)', row['version'])
                or not 0 <= numbers['frp'] <= 1e7
                or not all(0 < numbers[k] <= 1000 for k in ('bright_ti4', 'bright_ti5'))
                or not all(0 < numbers[k] <= 10 for k in ('scan', 'track'))):
            raise ValueError('Unsupported NOAA20 VIIRS attributes')
        identity = f'{PRODUCT}|N20|{stamp.isoformat()}|{lat:.8f}|{lon:.8f}|{numbers["scan"]}|{numbers["track"]}'
        identifier = 'firms-' + hashlib.sha256(identity.encode()).hexdigest()[:32]
        detection = {'id': identifier, 'product': PRODUCT, 'satellite': 'NOAA-20',
                     'instrument': 'VIIRS', 'acquired_at': stamp.isoformat(),
                     'latitude': lat, 'longitude': lon, 'confidence': row['confidence'],
                     'version': row['version'], 'daynight': row['daynight'],
                     'frp_mw': numbers['frp'], 'brightness_i4_kelvin': numbers['bright_ti4'],
                     'brightness_i5_kelvin': numbers['bright_ti5'],
                     'scan_km': numbers['scan'], 'track_km': numbers['track']}
        if identifier in result and result[identifier] != detection:
            raise ValueError('Conflicting duplicate FIRMS point')
        result[identifier] = detection
    return sorted(result.values(), key=lambda r: (r['acquired_at'], r['id']), reverse=True)


async def archive(conn, source, body, status, http_status=None, error=None, content_type="text/csv"):
    digest = hashlib.sha256(body).hexdigest()
    async with conn.transaction():
        await conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", (digest, len(body), content_type))
        row = await (await conn.execute(
            'INSERT INTO collection_attempts(source_id,payload_sha256,status,http_status,error) VALUES (%s,%s,%s,%s,%s) RETURNING id',
            (source['id'], digest, status, http_status, error))).fetchone()
    await conn.commit()
    return digest, row[0]


async def fetch_csv(conn, client, source, key):
    url = f'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{PRODUCT}/' + ','.join(map(str, BBOX)) + '/3'
    for attempt in range(3):
        async with client.stream('GET', url, follow_redirects=False, timeout=60) as response:
            body = bytearray()
            async for chunk in response.aiter_bytes():
                if len(body) + len(chunk) > MAX_BYTES:
                    raise ValueError('FIRMS response exceeds byte limit')
                body.extend(chunk)
            # Provider error pages may repeat the request URL. Redact before persistence.
            safe = bytes(body).replace(key.encode(), b'[REDACTED]')
            digest, receipt = await archive(conn, source, safe, 'received' if response.status_code == 200 else 'failed', response.status_code,
                                            None if response.status_code == 200 else f'HTTP {response.status_code}')
            if response.status_code == 200:
                return safe, digest, receipt
            if attempt < 2 and response.status_code in {429, 500, 502, 503, 504}:
                await asyncio.sleep(2 ** attempt * 2)
                continue
            raise ValueError(f'FIRMS provider HTTP {response.status_code}')
    raise ValueError('FIRMS acquisition failed')


async def import_firms(conn, client, source):
    now = datetime.now(UTC)
    base = {'product': PRODUCT, 'bbox_lon_lat': list(BBOX), 'window_days': 3,
            'window_start': (now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=2)).isoformat(),
            'fetched_at': now.isoformat(), 'detections': [], 'count': 0,
            'note': 'Thermische Anomalien, keine bestätigten Brände und keine Warnfunktion.'}
    key = os.getenv('FIRMS_MAP_KEY', '')
    if not key:
        body = json.dumps({'status': 'not_configured', 'product': PRODUCT}).encode()
        digest, _ = await archive(conn, source, body, 'not_configured', error='FIRMS_MAP_KEY missing', content_type='application/json')
        base['status'] = 'not_configured'
        await publish(conn, source, DATASET, base, digest, now)
        await conn.commit()
        return 'not_configured'
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', key):
        raise ValueError('Invalid FIRMS_MAP_KEY format')
    body, digest, attempt = await fetch_csv(conn, client, source, key)
    try:
        detections = parse_csv(body, now)
    except (ValueError, UnicodeError, csv.Error) as exc:
        await conn.execute("UPDATE collection_attempts SET status='failed',error=%s,error_stage='processing' WHERE id=%s", (acquisition_error(exc), attempt))
        await conn.commit()
        raise
    async with conn.transaction():
        for detection in detections:
            metadata = {**detection, 'archive_sha256': digest, 'attempt_id': attempt}
            await conn.execute("INSERT INTO entities(id,name,entity_type,metadata) VALUES (%s,%s,'firms_anomaly',%s) ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,updated_at=NOW()",
                               (detection['id'], 'VIIRS thermische Anomalie', Jsonb(metadata)))
            await conn.execute("SELECT write_measurement(%s,'fire_radiative_power','MW',%s,'model',%s,%s,%s::numeric,%s,%s,'valid',NULL,NULL,'instantaneous')",
                               (detection['id'], source['id'], Jsonb({'product': PRODUCT}), datetime.fromisoformat(detection['acquired_at']), detection['frp_mw'], now, Jsonb(metadata)))
        base.update({'status': 'success', 'detections': detections, 'count': len(detections), 'archive_sha256': digest})
        await publish(conn, source, DATASET, base, digest, now)
        await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s", (attempt,))
    await conn.commit()
    return 'success'
