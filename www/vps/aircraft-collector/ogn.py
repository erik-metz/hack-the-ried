"""OGN APRS stream with fail-closed DDB permissions and ephemeral storage."""
import asyncio
import csv
import io
import logging
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import psycopg
from psycopg.types.json import Jsonb

SOURCE = 'ogn-ried'
DDB = 'https://ddb.glidernet.org/download/'
BBOX = (49.50, 8.25, 49.95, 8.70)
LOG = logging.getLogger('aircraft-collector.ogn')
REPORT = re.compile(r"^(?:FLR|ICA|OGN)[0-9A-F]{6}>[^:]+:/([0-9]{6})h([0-9]{4}\.[0-9]{2})([NS]).([0-9]{5}\.[0-9]{2})([EW]).([0-9]{3})/([0-9]{3})/A=([0-9]{6})\b(.*)$")
IDENTITY = re.compile(r'\bid([0-9A-Fa-f]{2})([0-9A-Fa-f]{6})\b')


def permissions(body):
    """Unlisted, not-tracked and unidentified devices are all excluded."""
    if len(body)>20*1024*1024:
        raise ValueError('Oversized DDB')
    if '#DEVICE_TYPE,DEVICE_ID,' not in body:
        raise ValueError('Invalid DDB header')
    allowed = {}
    seen = set()
    for row in csv.reader(io.StringIO(body), quotechar="'"):
        if not row or row[0].startswith('#'):
            continue
        if len(row)<7 or row[0] not in ('F', 'I', 'O') or not re.fullmatch('[A-F0-9]{6}', row[1]):
            raise ValueError('Invalid DDB record')
        key = row[0]+':'+row[1]
        if key in seen:
            raise ValueError('Duplicate DDB device')
        seen.add(key)
        if row[5:7] == ['Y', 'Y']:
            allowed[key] = {k: v.strip()[:80] for k, v in zip(
                ('aircraft_type', 'registration', 'name'), row[2:5]) if v.strip()}
    if not allowed:
        raise ValueError('Empty DDB permissions')
    return allowed


def decode(line, now=None):
    now = now or datetime.now(UTC)
    match = REPORT.fullmatch(line.strip())
    if not match:
        return None
    clock, lat, ns, lon, ew, course, speed, altitude, extra = match.groups()
    identity = IDENTITY.search(extra)
    if not identity:
        return None
    flags, address = int(identity[1], 16), identity[2].upper()
    category, address_type = (flags>>2)&15, flags&3
    # Ignore stealth/no-track, unknown addresses and non-aircraft ground/static objects.
    if flags&0xC0 or not address_type or category in (0, 4, 10, 14, 15):
        return None
    key = {1:'I', 2:'F', 3:'O'}[address_type]+':'+address
    try:
        stamp = now.replace(hour=int(clock[:2]), minute=int(clock[2:4]), second=int(clock[4:]), microsecond=0)
    except ValueError:
        return None
    stamp = min((stamp-timedelta(days=1), stamp, stamp+timedelta(days=1)), key=lambda t: abs((now-t).total_seconds()))
    if not -10 <= (now-stamp).total_seconds() < 60:
        return None
    latitude = int(lat[:2])+float(lat[2:])/60
    longitude = int(lon[:3])+float(lon[3:])/60
    if float(lat[2:])>=60 or float(lon[3:])>=60:
        return None
    # Optional APRS DAO adds a third decimal digit to the minutes.
    precision = re.search(r'!W([0-9])([0-9])!', extra)
    if precision:
        latitude += int(precision[1])/60000
        longitude += int(precision[2])/60000
    latitude *= 1 if ns=='N' else -1
    longitude *= 1 if ew=='E' else -1
    if not BBOX[0]<=latitude<=BBOX[2] or not BBOX[1]<=longitude<=BBOX[3]:
        return None
    errors = re.search(r'\b([0-9]+)e\b', extra)
    if errors and int(errors[1])>5:
        return None
    if int(course)>360 or not 5<=int(speed)<=1000 or int(altitude)>70000:
        return None
    data = {'id':'aircraft:ogn:'+key, 'kind':'aircraft', 'basis':'observed', 'source_id':SOURCE,
            'latitude':latitude, 'longitude':longitude, 'timestamp':stamp.isoformat(),
            'valid_until':(stamp+timedelta(seconds=60)).isoformat(), 'reception':'ogn',
            'speed_kmh':round(int(speed)*1.852, 2), 'course_deg':int(course)%360,
            'altitude_ogn_m':round(int(altitude)*.3048, 1), 'ogn_category':category,
            'source_url':'https://www.glidernet.org/', 'attribution':'Open Glider Network · ODbL 1.0'}
    if address_type==1:
        data['icao24'] = address.lower()
    rate = re.search(r'([+-][0-9]+)fpm\b', extra)
    if rate and abs(int(rate[1]))<=20000:
        data['vertical_rate_ogn_mps'] = round(int(rate[1])*.00508, 2)
    return key, stamp, data


async def refresh_permissions(conn, allowed, now=None):
    now = now or datetime.now(UTC)
    async with conn.transaction():
        # Remove revoked devices and their observations in the same transaction.
        await conn.execute('DELETE FROM ogn_permissions WHERE NOT(device_key=ANY(%s))', (list(allowed),))
        async with conn.cursor() as cur:
            await cur.executemany('''INSERT INTO ogn_permissions(device_key,metadata,valid_until)
                VALUES (%s,%s,%s) ON CONFLICT(device_key) DO UPDATE SET
                metadata=EXCLUDED.metadata,valid_until=EXCLUDED.valid_until''',
                [(key,Jsonb(meta),now+timedelta(minutes=30)) for key,meta in allowed.items()])
        await cleanup(conn)


async def cleanup(conn):
    await conn.execute("DELETE FROM ogn_positions WHERE timestamp<=NOW()-INTERVAL '24 hours'")
    await conn.execute('DELETE FROM ogn_permissions WHERE valid_until<=NOW()')


async def persist(conn, line, now=None):
    report = REPORT.fullmatch(line.strip())
    identity = IDENTITY.search(report[9]) if report else None
    if identity and int(identity[1],16)&0xC0 and int(identity[1],16)&3:
        key = {1:'I',2:'F',3:'O'}[int(identity[1],16)&3]+':'+identity[2].upper()
        await conn.execute('DELETE FROM ogn_permissions WHERE device_key=%s',(key,))
        return False
    sample = decode(line, now)
    if sample is None:
        return False
    key, stamp, data = sample
    row = await (await conn.execute('''INSERT INTO ogn_positions(device_key,timestamp,data)
        SELECT device_key,%s,%s FROM ogn_permissions WHERE device_key=%s AND valid_until>NOW()
        ON CONFLICT DO NOTHING RETURNING device_key''', (stamp,Jsonb(data),key))).fetchone()
    return bool(row)


async def run(db, seconds=None):
    loop = asyncio.get_running_loop()
    stop = loop.time()+seconds if seconds else float('inf')
    failures = 0
    while loop.time()<stop:
        writer = None
        try:
            # Refresh before connecting; no stale fallback or raw packet evidence.
            async with await psycopg.AsyncConnection.connect(**db, autocommit=True) as conn, \
                    httpx.AsyncClient(timeout=30, follow_redirects=True,
                        headers={'User-Agent':'HackTheRied-aircraft/1.0'}) as client:
                async def refresh():
                    response = await client.get(DDB)
                    response.raise_for_status()
                    await refresh_permissions(conn, permissions(response.text))
                    LOG.info('OGN tracking permissions refreshed')
                await refresh()
                reader, writer = await asyncio.wait_for(asyncio.open_connection('aprs.glidernet.org',14580,limit=4096),20)
                writer.write(b'user RIEDSENS pass -1 vers OpenRiedSens 1.0 filter r/49.725/8.475/40\r\n')
                await writer.drain()
                refresh_at, contact_at = loop.time()+900, 0
                authenticated = False
                accepted = 0
                while loop.time()<stop:
                    packet = await asyncio.wait_for(reader.readline(),60)
                    if not packet:
                        raise OSError('OGN connection closed')
                    line = packet.decode('ascii', errors='replace').strip()
                    if line.startswith('# logresp RIEDSENS '):
                        authenticated = True  # pass -1 is read-only/unverified by design.
                    if authenticated:
                        accepted += int(await persist(conn,line))
                        if loop.time()>=contact_at:
                            await cleanup(conn)
                            await conn.execute("INSERT INTO collection_attempts(source_id,status) VALUES (%s,'success')",(SOURCE,))
                            Path('/tmp/aircraft-heartbeat').touch()
                            writer.write(b'# HackTheRied keepalive\r\n')
                            await writer.drain()
                            contact_at = loop.time()+30
                            failures = 0
                            LOG.info('OGN stream connected; new observations: %d',accepted)
                            accepted = 0
                    if loop.time()>=refresh_at:
                        await refresh()
                        refresh_at = loop.time()+900
        except (OSError, TimeoutError, ValueError, httpx.HTTPError, psycopg.Error) as exc:
            failures += 1
            LOG.warning('OGN acquisition failed: %s',type(exc).__name__)
            try:
                async with await psycopg.AsyncConnection.connect(**db,autocommit=True) as conn:
                    await cleanup(conn)
                    await conn.execute("INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'failed',%s)",(SOURCE,type(exc).__name__))
            except (OSError, psycopg.Error):
                LOG.warning('Cannot record OGN source status')
        finally:
            if writer:
                writer.close()
                try:
                    await writer.wait_closed()
                except OSError:
                    pass
        await asyncio.sleep(min(300,5*2**min(failures,6),max(0,stop-loop.time())))
