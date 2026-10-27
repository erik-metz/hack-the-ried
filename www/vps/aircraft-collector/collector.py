"""Bounded ADS-B acquisition for the Ried; coordinates are observations, not routes."""
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

import httpx
import psycopg
from psycopg.types.json import Jsonb

SOURCE = 'adsblol-ried'
URL = 'https://api.adsb.lol/v2/point/49.725/8.475/30'
BBOX = (49.50, 8.25, 49.95, 8.70)  # South/west/north/east; buffered Ried, not airport ownership.
MAX_AGE = 60
LOG = logging.getLogger('aircraft-collector')


def number(value, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) and minimum <= value <= maximum else None


def text(value):
    return value.strip()[:80] if isinstance(value, str) else None


def decode(payload, now=None):
    """Use snapshot epoch minus position age; never refresh stale cached positions."""
    now = now or datetime.now(UTC)
    if not isinstance(payload, dict) or not isinstance(payload.get('ac'), list):
        raise TypeError('Invalid snapshot')
    epoch = number(payload.get('now'), 0, 4102444800000)
    if payload.get('msg') not in (None, 'No error') or epoch is None or len(payload['ac']) > 10000:
        raise ValueError('Invalid snapshot time or size')
    snapshot = datetime.fromtimestamp(epoch / 1000, UTC)
    if snapshot > now + timedelta(seconds=10) or snapshot < now - timedelta(seconds=MAX_AGE):
        raise ValueError('Stale snapshot')
    samples = []
    for aircraft in payload['ac']:
        if not isinstance(aircraft, dict):
            continue
        hex_id = aircraft.get('hex')
        # Non-ICAO anonymous identifiers (~xxxxxx) are deliberately not resolved.
        if not isinstance(hex_id, str) or not re.fullmatch(r'[0-9a-fA-F]{6}', hex_id):
            continue
        reception = aircraft.get('type')
        if reception not in ('adsb_icao', 'adsr_icao', 'tisb_icao', 'mlat'):
            continue
        age = number(aircraft.get('seen_pos'), 0, MAX_AGE)
        lat = number(aircraft.get('lat'), BBOX[0], BBOX[2])
        lon = number(aircraft.get('lon'), BBOX[1], BBOX[3])
        stamp = snapshot - timedelta(seconds=age) if age is not None else None
        if lat is None or lon is None or stamp is None or stamp + timedelta(seconds=MAX_AGE) <= now:
            continue
        # Ground objects and unknown airborne status are not presented as aircraft in the air.
        baro = number(aircraft.get('alt_baro'), -2000, 70000)
        geom = number(aircraft.get('alt_geom'), -2000, 70000)
        if aircraft.get('alt_baro') == 'ground' or (baro is None and geom is None):
            continue
        metadata = {'icao24': hex_id.lower(), 'reception': reception,
                    'geometry_basis': 'multilateration' if reception == 'mlat' else 'reported',
                    'source_url': 'https://www.adsb.lol/', 'attribution': 'adsb.lol · ODbL 1.0'}
        category = aircraft.get('category')
        if isinstance(category, str) and re.fullmatch(r'[AB][0-7]', category):
            metadata['emitter_category'] = category
        for field, source in [('name', 'flight'), ('registration', 'r'), ('aircraft_type', 't')]:
            value = text(aircraft.get(source))
            if value:
                metadata[field] = value
        speed = number(aircraft.get('gs'), 0, 1500)
        course = number(aircraft.get('track'), 0, 359.999)
        rate = number(aircraft.get('baro_rate'), -20000, 20000)
        for field, value in [('speed_kmh', round(speed * 1.852, 2) if speed is not None else None),
                             ('course_deg', course), ('altitude_baro_m', round(baro * .3048, 1) if baro is not None else None),
                             ('altitude_geom_m', round(geom * .3048, 1) if geom is not None else None),
                             ('vertical_rate_mps', round(rate * .00508, 2) if rate is not None else None)]:
            if value is not None:
                metadata[field] = value
        samples.append({'id': 'aircraft:' + hex_id.lower(), 'latitude': lat, 'longitude': lon,
                        'timestamp': stamp, 'metadata': metadata})
    return samples


async def persist(conn, payload, now=None):
    now = now or datetime.now(UTC)
    samples = decode(payload, now)
    accepted = 0
    async with conn.transaction():
        for sample in samples:
            stamp, identity, metadata = sample['timestamp'], sample['id'], sample['metadata']
            # Position identity deduplicates poll jitter in snapshot now/seen_pos arithmetic.
            # Coordinates are preserved; timestamps are normalized to provider millisecond precision.
            stamp = stamp.replace(microsecond=(stamp.microsecond // 1000) * 1000)
            sample['timestamp'] = stamp.isoformat()
            body = json.dumps(sample, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
            digest = hashlib.sha256(body).hexdigest()
            exists = await (await conn.execute("SELECT 1 FROM movement_positions WHERE timestamp=%s AND entity_id=%s AND basis='observed'", (stamp, identity))).fetchone()
            if exists:
                continue
            await conn.execute("""INSERT INTO collected_payloads(sha256,body,content_type)
                VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING""", (digest, body))
            inserted = await (await conn.execute("""INSERT INTO movement_positions(timestamp,entity_id,kind,
                latitude,longitude,basis,source_id,payload_sha256,metadata)
                VALUES (%s,%s,'aircraft',%s,%s,'observed',%s,%s,%s)
                ON CONFLICT DO NOTHING RETURNING entity_id""",
                (stamp, identity, sample['latitude'], sample['longitude'], SOURCE, digest, Jsonb(metadata)))).fetchone()
            if not inserted:
                continue
            expiry = stamp + timedelta(seconds=MAX_AGE)
            data = {'id': identity, 'entity_id': identity, 'kind': 'aircraft', 'basis': 'observed',
                    'source_id': SOURCE, 'latitude': sample['latitude'], 'longitude': sample['longitude'],
                    'timestamp': stamp.isoformat(), 'valid_until': expiry.isoformat(), 'fetched_at': now.isoformat(),
                    'payload_sha256': digest, 'model_version': None, 'metadata': metadata, **metadata}
            await conn.execute('SELECT write_movement_position(%s)', (Jsonb(data),))
            await conn.execute("""INSERT INTO movement_latest(entity_id,basis,timestamp,valid_until,data)
                VALUES (%s,'observed',%s,%s,%s) ON CONFLICT(entity_id,basis) DO UPDATE SET
                timestamp=EXCLUDED.timestamp,valid_until=EXCLUDED.valid_until,data=EXCLUDED.data
                WHERE EXCLUDED.timestamp > movement_latest.timestamp""", (identity, stamp, expiry, Jsonb(data)))
            accepted += 1
    return accepted


def retry_delay(response, failures, interval):
    """Respect Retry-After; exponential backoff and jitter for transient failures."""
    delay = min(900, interval * 2 ** min(failures, 6))
    if response is not None and response.status_code == 429:
        value = response.headers.get('Retry-After', '')
        try:
            delay = max(delay, float(value))
        except ValueError:
            try:
                from email.utils import parsedate_to_datetime
                delay = max(delay, (parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds())
            except (ValueError, TypeError):
                pass
    return delay + random.random()


async def run_adsb(seconds=None):
    interval = float(os.getenv('AIRCRAFT_POLL_SECONDS', '15'))
    if not math.isfinite(interval) or interval < 10 or interval > 300:
        raise ValueError('AIRCRAFT_POLL_SECONDS must be between 10 and 300')
    db = {'host': os.getenv('DB_HOST', 'timescaledb'), 'port': int(os.getenv('DB_PORT', '5432')),
          'dbname': os.getenv('DB_NAME', 'mydatabase'), 'user': os.getenv('DB_USER', 'postgres'),
          'password': os.getenv('DB_PASSWORD', ''), 'connect_timeout': 10, 'options': os.getenv('DB_OPTIONS', '')}
    stop_at = asyncio.get_running_loop().time() + seconds if seconds else math.inf
    failures = 0
    async with httpx.AsyncClient(timeout=20, follow_redirects=False, headers={
            'User-Agent': 'HackTheRied-aircraft/1.0', 'Accept': 'application/json', 'Accept-Encoding': 'gzip'}) as client:
        while asyncio.get_running_loop().time() < stop_at:
            response = None
            delay = interval
            try:
                async with await psycopg.AsyncConnection.connect(**db, autocommit=True) as conn:
                    ready = await (await conn.execute("SELECT EXISTS(SELECT 1 FROM collection_sources WHERE id=%s)", (SOURCE,))).fetchone()
                    if not ready or not ready[0]:
                        raise RuntimeError('Install aircraft schema and canonical writer before acquisition')
                    response = await client.get(URL)
                    response.raise_for_status()
                    if len(response.content) > 4 * 1024 * 1024:
                        raise ValueError('Oversized snapshot')
                    accepted = await persist(conn, response.json())
                    await conn.execute("INSERT INTO collection_attempts(source_id,status) VALUES (%s,'success')", (SOURCE,))
                    Path('/tmp/aircraft-heartbeat').touch()
                    LOG.info('ADS-B snapshot accepted; new observations: %d', accepted)
                    failures = 0
            except (httpx.HTTPError, OSError, psycopg.Error, ValueError, TypeError, RuntimeError) as exc:
                failures += 1
                delay = retry_delay(response, failures, interval)
                LOG.warning('Aircraft acquisition failed: %s', type(exc).__name__)
                try:
                    async with await psycopg.AsyncConnection.connect(**db, autocommit=True) as conn:
                        await conn.execute("INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'failed',%s)", (SOURCE, type(exc).__name__))
                except (OSError, psycopg.Error):
                    LOG.warning('Cannot record aircraft source status')
            await asyncio.sleep(min(delay, max(0, stop_at - asyncio.get_running_loop().time())))


async def run(seconds=None):
    from ogn import run as run_ogn
    db = {'host': os.getenv('DB_HOST', 'timescaledb'), 'port': int(os.getenv('DB_PORT', '5432')),
          'dbname': os.getenv('DB_NAME', 'mydatabase'), 'user': os.getenv('DB_USER', 'postgres'),
          'password': os.getenv('DB_PASSWORD', ''), 'connect_timeout': 10, 'options': os.getenv('DB_OPTIONS', '')}
    await asyncio.gather(run_adsb(seconds), run_ogn(db, seconds))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds', type=int, help='Bounded acquisition test')
    args = parser.parse_args()
    if args.seconds is not None and args.seconds <= 0:
        parser.error('--seconds must be positive')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    asyncio.run(run(args.seconds))
