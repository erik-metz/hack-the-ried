"""Server-side AISstream ingestion for the Frankenthal–Gernsheim corridor."""
import argparse
import asyncio
import hashlib
import json
import logging
import math
import os
import random
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb
from websockets.asyncio.client import connect
from websockets.exceptions import WebSocketException

SOURCE = 'aisstream-rhein'
URL = 'wss://stream.aisstream.io/v0/stream'
POSITION_TYPES = {'PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport'}
TYPES = sorted(POSITION_TYPES | {'ShipStaticData', 'StaticDataReport'})
BBOX = (49.50, 8.30, 49.79, 8.55)
LOG = logging.getLogger('ais-collector')


def number(value, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) and minimum <= value <= maximum else None


def text(value):
    return value.replace('@', '').strip()[:120] if isinstance(value, str) else None


def timestamp(value):
    # AIS UTC-second fields are not full observation timestamps. Use envelope time.
    if not isinstance(value, str):
        raise TypeError('Missing envelope time')
    value = re.sub(r'\s+[+-]0000 UTC$', '+00:00', value)
    value = re.sub(r'(\.\d{6})\d+', r'\1', value)
    stamp = datetime.fromisoformat(value)
    if stamp.tzinfo is None:
        raise ValueError('Missing timezone')
    return stamp.astimezone(UTC)


def decode(event, now=None, bbox=BBOX):
    """Reject stale, impossible, unrelated and unavailable AIS observations."""
    now = now or datetime.now(UTC)
    kind = event.get('MessageType')
    if kind not in TYPES:
        return None
    meta = event.get('MetaData') or {}
    mmsi = str(meta.get('MMSI', ''))
    if not re.fullmatch(r'[1-9]\d{8}', mmsi):
        return None
    stamp = timestamp(meta.get('time_utc'))
    if stamp > now + timedelta(seconds=30) or stamp < now - timedelta(minutes=10):
        return None
    report = (event.get('Message') or {}).get(kind) or {}
    if report.get('Valid') is False:
        return None
    lat = number(report.get('Latitude', meta.get('latitude', meta.get('Latitude'))), -90, 90)
    lon = number(report.get('Longitude', meta.get('longitude', meta.get('Longitude'))), -180, 180)
    south, west, north, east = bbox
    if lat is None or lon is None or not (south <= lat <= north and west <= lon <= east):
        return None
    details = {}
    name = text(report.get('Name') or (report.get('ReportA') or {}).get('Name') or meta.get('ShipName'))
    if name:
        details['name'] = name
    if kind not in POSITION_TYPES:
        static = report if kind == 'ShipStaticData' else report.get('ReportB') or {}
        for field, source in [('ship_type', 'Type'), ('callsign', 'CallSign'), ('destination', 'Destination')]:
            value = static.get(source)
            if field == 'ship_type':
                value = number(value, 1, 99)
            else:
                value = text(value)
            if value is not None and value != '':
                details[field] = value
        dimension = static.get('Dimension') or {}
        for field, a, b in [('length_m', 'A', 'B'), ('beam_m', 'C', 'D')]:
            left, right = number(dimension.get(a), 0, 511), number(dimension.get(b), 0, 511)
            if left is not None and right is not None and left + right > 0:
                details[field] = left + right
    motion = {}
    if kind in POSITION_TYPES:
        speed = number(report.get('Sog'), 0, 102.2)  # 102.3 = unavailable
        course = number(report.get('Cog'), 0, 359.9)
        heading = number(report.get('TrueHeading'), 0, 359)  # 511 = unavailable
        nav = number(report.get('NavigationalStatus'), 0, 14)
        for field, value in [('speed_kmh', round(speed * 1.852, 2) if speed is not None else None),
                             ('course_deg', course), ('heading_deg', heading), ('navigation_status', nav)]:
            if value is not None:
                motion[field] = value
    return {'mmsi': mmsi, 'timestamp': stamp, 'latitude': lat, 'longitude': lon,
            'position': kind in POSITION_TYPES, 'details': details, 'motion': motion}


async def persist(conn, event, now=None):
    now = now or datetime.now(UTC)
    sample = decode(event, now)
    if sample is None:
        return False
    body = json.dumps(event, separators=(',', ':'), allow_nan=False).encode()
    return await persist_sample(conn, sample, body, SOURCE, 'https://aisstream.io/')


async def persist_sample(conn, sample, body, source, source_url=None, content_type='application/json'):
    """Write validated provider samples with shared MMSI identity and observation time."""
    digest = hashlib.sha256(body).hexdigest()
    stamp = sample['timestamp']
    async with conn.transaction():
        await conn.execute("""INSERT INTO collected_payloads(sha256,size_bytes,content_type)
            VALUES (%s,%s,%s) ON CONFLICT DO NOTHING""", (digest, len(body), content_type))
        await conn.execute("""INSERT INTO ais_vessels(mmsi,updated_at,metadata) VALUES (%s,%s,%s)
            ON CONFLICT(mmsi) DO UPDATE SET updated_at=EXCLUDED.updated_at,
            metadata=ais_vessels.metadata || EXCLUDED.metadata
            WHERE EXCLUDED.updated_at >= ais_vessels.updated_at""",
            (sample['mmsi'], stamp, Jsonb(sample['details'])))
        if not sample['position']:
            return True
        vessel = await (await conn.execute('SELECT metadata FROM ais_vessels WHERE mmsi=%s',
                                          (sample['mmsi'],))).fetchone()
        metadata = {**vessel[0], **sample['motion'], 'mmsi': sample['mmsi'],
                    'geometry_basis': 'reported_gps'}
        if source_url:
            metadata['source_url'] = source_url
        identity = 'ais:' + sample['mmsi']
        data = {'id': identity, 'entity_id': identity, 'kind': 'ship', 'basis': 'observed',
                'source_id': source, 'latitude': sample['latitude'], 'longitude': sample['longitude'],
                'timestamp': stamp.isoformat(), 'valid_until': (stamp + timedelta(minutes=10)).isoformat(),
                'payload_sha256': digest, 'model_version': None, 'metadata': metadata, **metadata}
        await conn.execute("""INSERT INTO movement_positions(timestamp,entity_id,kind,latitude,longitude,
            basis,source_id,payload_sha256,metadata) VALUES (%s,%s,'ship',%s,%s,'observed',%s,%s,%s)
            ON CONFLICT DO NOTHING""", (stamp, identity, sample['latitude'], sample['longitude'], source, digest, Jsonb(metadata)))
        await conn.execute('SELECT write_movement_position(%s)', (Jsonb(data),))
        await conn.execute("""INSERT INTO movement_latest(entity_id,basis,timestamp,valid_until,data)
            VALUES (%s,'observed',%s,%s,%s) ON CONFLICT(entity_id,basis) DO UPDATE SET
            timestamp=EXCLUDED.timestamp,valid_until=EXCLUDED.valid_until,data=EXCLUDED.data
            WHERE EXCLUDED.timestamp > movement_latest.timestamp""",
            (identity, stamp, stamp + timedelta(minutes=10), Jsonb(data)))
    return True


async def status(conn, state, error=None):
    await conn.execute("""INSERT INTO collection_attempts(source_id,status,error)
        VALUES (%s,%s,%s)""", (SOURCE, state, error))


async def run(seconds=None):
    key = os.getenv('AIS_STREAM_API_KEY', '').strip()
    if not key:
        raise RuntimeError('AIS_STREAM_API_KEY is required on the collector')
    db = {'host': os.getenv('DB_HOST', 'timescaledb'), 'port': int(os.getenv('DB_PORT', '5432')),
          'dbname': os.getenv('DB_NAME', 'mydatabase'), 'user': os.getenv('DB_USER', 'postgres'),
          'password': os.getenv('DB_PASSWORD', ''), 'connect_timeout': 10,
          'options': os.getenv('DB_OPTIONS', '')}
    stop_at = asyncio.get_running_loop().time() + seconds if seconds else math.inf
    backoff = 2
    while asyncio.get_running_loop().time() < stop_at:
        try:
            async with await psycopg.AsyncConnection.connect(**db, autocommit=True) as conn:
                ready = await (await conn.execute("SELECT to_regclass('ais_vessels'),to_regprocedure('write_movement_position(jsonb,boolean)')")).fetchone()
                if not all(ready):
                    raise RuntimeError('Install AIS schema and canonical measurement writer first')
                async with connect(URL, compression='deflate', open_timeout=20, max_size=262144,
                                   max_queue=256, ping_interval=20, ping_timeout=20) as ws:
                    await ws.send(json.dumps({'APIKey': key, 'BoundingBoxes': [[[BBOX[0], BBOX[1]], [BBOX[2], BBOX[3]]]], 'FilterMessageTypes': TYPES}))
                    confirmed = False
                    accepted = 0
                    heartbeat = 0
                    while asyncio.get_running_loop().time() < stop_at:
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=min(30, max(.1, stop_at-asyncio.get_running_loop().time())))
                        except TimeoutError:
                            if not confirmed:
                                raise RuntimeError('Subscription confirmation missing') from None
                            raw = None
                        if raw:
                            event = json.loads(raw)
                            if event.get('error') or event.get('Error'):
                                raise RuntimeError('Provider rejected subscription')
                            if event.get('MessageType') == 'SubscriptionConfirmation':
                                confirmed = True
                                backoff = 2
                                LOG.info('AIS subscription confirmed for Frankenthal–Gernsheim')
                            elif confirmed:
                                try:
                                    accepted += int(await persist(conn, event))
                                except (ValueError, TypeError):
                                    LOG.warning('Rejected invalid AIS message')
                        if confirmed and asyncio.get_running_loop().time()-heartbeat >= 60:
                            await status(conn, 'success')  # Connected does not imply ships present.
                            Path('/tmp/ais-heartbeat').touch()
                            LOG.info('AIS connected; accepted messages: %d', accepted)
                            heartbeat = asyncio.get_running_loop().time()
        except (OSError, psycopg.Error, WebSocketException, ValueError, RuntimeError) as exc:
            # Never log provider bodies, URLs with credentials or exception strings.
            LOG.warning('AIS connection failed: %s', type(exc).__name__)
            try:
                async with await psycopg.AsyncConnection.connect(**db, autocommit=True) as conn:
                    await status(conn, 'failed', type(exc).__name__)
            except (OSError, psycopg.Error):
                LOG.warning("Cannot record AIS connection status")
            await asyncio.sleep(min(backoff + random.random(), max(0, stop_at-asyncio.get_running_loop().time())))
            backoff = min(60, backoff * 2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds', type=int, help='Bounded acquisition test')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    asyncio.run(run(args.seconds))
