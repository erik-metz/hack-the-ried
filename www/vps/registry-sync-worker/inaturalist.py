"""Daily bounded public observations; privacy changes replace, never accumulate."""

import asyncio
import hashlib
import json
import math
import re
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from ecostress_raster import BBOX
from psycopg.types.json import Jsonb
from publications import publish

SOURCE = 'inaturalist-ried'
DATASET = 'environment/inaturalist/observations'
URL = 'https://api.inaturalist.org/v1/observations'
MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 10
PAGE_SIZE = 200
LICENSES = {'cc0': 'https://creativecommons.org/publicdomain/zero/1.0/',
            'cc-by': 'https://creativecommons.org/licenses/by/4.0/',
            'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/'}


def observation(record, now=None):
    """Whitelist only public facts and the login needed for attribution; no media."""
    now = now or datetime.now(UTC)
    if (record.get('obscured') is not False
            or record.get('geoprivacy') not in (None, 'open')
            or record.get('taxon_geoprivacy') not in (None, 'open')):
        raise ValueError('privacy')
    license_code = record.get('license_code')
    if license_code not in LICENSES:
        raise ValueError('license')
    identifier = record.get('id')
    taxon = record.get('taxon') or {}
    if (type(identifier) is not int or identifier <= 0
            or type(taxon.get('id')) is not int or taxon['id'] <= 0
            or not isinstance(taxon.get('name'), str) or not 0 < len(taxon['name']) <= 256
            or not isinstance(taxon.get('rank'), str) or len(taxon['rank']) > 64):
        raise ValueError('identity')
    try:
        latitude, longitude = map(float, record['location'].split(','))
        if not (math.isfinite(latitude) and math.isfinite(longitude)
                and BBOX[0] <= longitude <= BBOX[2] and BBOX[1] <= latitude <= BBOX[3]):
            raise ValueError('coordinates')
        day = date.fromisoformat(record['observed_on'])
        if day > now.astimezone(ZoneInfo('Europe/Berlin')).date():
            raise ValueError('date')
        updated = datetime.fromisoformat(record['updated_at'])
        if updated.tzinfo is None or updated > now + timedelta(minutes=5):
            raise ValueError('date')
    except (KeyError, TypeError, AttributeError):
        raise ValueError('fields') from None
    accuracy = record.get('public_positional_accuracy', record.get('positional_accuracy'))
    if accuracy is not None and (type(accuracy) not in (int, float)
                                 or not math.isfinite(accuracy) or accuracy < 0):
        raise ValueError('coordinates')
    quality = record.get('quality_grade')
    if quality not in {'research', 'needs_id', 'casual'}:
        raise ValueError('quality')
    login = None
    if license_code != 'cc0':
        login = (record.get('user') or {}).get('login')
        if not isinstance(login, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', login):
            raise ValueError('attribution')
    return {'id': identifier, 'source': 'iNaturalist',
            'source_url': f'https://www.inaturalist.org/observations/{identifier}',
            'taxon_id': taxon['id'], 'scientific_name': taxon['name'], 'taxon_rank': taxon['rank'],
            'observed_on': day.isoformat(), 'date_precision': 'day', 'updated_at': updated.isoformat(),
            'quality_grade': quality, 'latitude': latitude, 'longitude': longitude,
            'coordinate_uncertainty_m': accuracy, 'license': license_code,
            'license_url': LICENSES[license_code], 'attribution': login,
            'spatial_reference': {'latitude': latitude, 'longitude': longitude, 'coordinate_uncertainty_m': accuracy},
            'changes': 'Auswahl öffentlicher Metadaten; keine Fotos, Töne oder Beschreibungen.',
            'gbif_ids': []}


def inaturalist_id(value):
    if not isinstance(value, str):
        return None
    try:
        parts = urlsplit(value)
    except ValueError:
        return None
    match = re.fullmatch(r'/observations/([1-9][0-9]*)/?', parts.path)
    if (parts.scheme not in {'http', 'https'} or parts.hostname not in {'inaturalist.org', 'www.inaturalist.org'}
            or parts.username or parts.password or not match):
        return None
    return int(match[1])


async def gbif_index(conn):
    """Exact origin links, restricted to the current GBIF core snapshot."""
    snapshot = await (await conn.execute("SELECT metadata FROM entities WHERE id='environment:gbif:ried' AND NOT is_hidden")).fetchone()
    if not snapshot or not snapshot[0].get('snapshot_sha256'):
        return {}, {'status': 'unavailable', 'note': 'Kein gespeicherter GBIF-Ausschnitt für den Abgleich.'}
    metadata = snapshot[0]
    normalized = await (await conn.execute("SELECT to_regprocedure('current_snapshot_matches(bigint,timestamptz,text)') IS NOT NULL")).fetchone()
    membership = 'current_snapshot_matches(d.id,r.observed_at,%s)' if normalized[0] else "d.dimensions->>'snapshot_sha256'=%s"
    rows = await (await conn.execute(f"""SELECT DISTINCT e.metadata->>'gbif_id'
        FROM entities e JOIN measurement_definitions d ON d.entity_id=e.id
        JOIN readings r ON r.measurement_id=d.id
        WHERE NOT e.is_hidden AND d.source_id='environment-gbif'
        AND {membership}""", (metadata['snapshot_sha256'],))).fetchall()
    current = {int(r[0]) for r in rows if r[0] and r[0].isdigit()}
    derived = await (await conn.execute("""SELECT metadata FROM entities
        WHERE id=ANY(%s) AND metadata->>'origin_snapshot_sha256'=%s""",
        ([f'environment:gbif:{key}' for key in current],metadata['snapshot_sha256']))).fetchall()
    if len(derived)==len(current) and all(row[0].get('origin_links_checked') for row in derived):
        index = {}
        for row in derived:
            for identifier in row[0].get('inaturalist_ids',[]):
                index.setdefault(identifier,set()).add(int(row[0]['gbif_id']))
        return {k:sorted(v) for k,v in index.items()}, {
            'status':'checked','gbif_records':len(current),'origin_records_inspected':len(current),
            'gbif_snapshot_sha256':metadata['snapshot_sha256'],'gbif_checked_at':metadata.get('last_checked_at'),
            'note':'Herkunftskennungen wurden beim GBIF-Import aus den Originaldaten extrahiert.'}
    receipts = await (await conn.execute("""SELECT payload_sha256 FROM collection_attempts
        WHERE source_id='environment-gbif' AND status='success' AND http_status=200
        ORDER BY id DESC LIMIT 10""")).fetchall()
    # GBIF's snapshot hash is the hash of page hashes in acquisition order.
    # Match an exact recent receipt prefix; older pages with the same GBIF ID
    # cannot prove that its origin link still belongs to the current snapshot.
    pages = []
    for length in range(1, len(receipts) + 1):
        candidate = list(reversed(receipts[:length]))
        fingerprint = hashlib.sha256(''.join(r[0] for r in candidate).encode()).hexdigest()
        if fingerprint == metadata['snapshot_sha256']:
            pages = candidate
            break
    index, inspected = {}, set()
    for digest, in pages:
        row = await (await conn.execute('SELECT body FROM collected_payloads WHERE sha256=%s AND octet_length(body)<=20971520', (digest,))).fetchone()
        if not row:
            continue
        try:
            records = json.loads(bytes(row[0])).get('results', [])
        except (ValueError, AttributeError):
            continue
        for item in records[:300]:
            key = item.get('key')
            if key not in current:
                continue
            inspected.add(key)
            for field in ('occurrenceID', 'references', 'identifier'):
                identifier = inaturalist_id(item.get(field))
                if identifier:
                    index.setdefault(identifier, set()).add(key)
    return {k: sorted(v) for k, v in index.items()}, {
        'status': 'checked' if inspected == current else 'partial',
        'gbif_records': len(current), 'origin_records_inspected': len(inspected),
        'gbif_snapshot_sha256': metadata['snapshot_sha256'],
        'gbif_checked_at': metadata.get('last_checked_at'),
        'note': 'Nur eindeutige Herkunftslinks im gespeicherten GBIF-Ausschnitt; unterschiedliche Suchgebiete und Abrufgrenzen.'}


async def request_page(client, params):
    for attempt in range(3):
        # Stream limits decoded bytes too. Never archive the full provider response.
        async with client.stream('GET', URL, params=params, follow_redirects=False, timeout=60,
                                 headers={'User-Agent': 'OpenRiedSens-iNaturalist/1.0', 'Authorization': ''}) as response:
            body = bytearray()
            async for chunk in response.aiter_bytes():
                if len(body) + len(chunk) > MAX_BYTES:
                    raise ValueError('iNaturalist response byte limit')
                body.extend(chunk)
            if response.status_code == 200:
                data = json.loads(body)
                if (not isinstance(data, dict) or type(data.get('total_results')) is not int
                        or data['total_results'] < 0 or not isinstance(data.get('results'), list)
                        or len(data['results']) > PAGE_SIZE):
                    raise ValueError('Invalid iNaturalist envelope')
                return data, hashlib.sha256(body).hexdigest()
            if attempt < 2 and response.status_code in {429, 500, 502, 503, 504}:
                await asyncio.sleep(2 ** attempt * 2)
                continue
            raise ValueError(f'iNaturalist HTTP {response.status_code}')
    raise ValueError('iNaturalist request failed')


async def _import_inaturalist(conn, client, source):
    now = datetime.now(UTC)
    params = {'swlng': BBOX[0], 'swlat': BBOX[1], 'nelng': BBOX[2], 'nelat': BBOX[3],
              'geo': 'true', 'geoprivacy': 'open', 'taxon_geoprivacy': 'open',
              'license': ','.join(LICENSES), 'per_page': PAGE_SIZE, 'order_by': 'id', 'order': 'desc'}
    records, hashes, rejected, scanned = {}, [], {}, 0
    total = 0
    for page in range(1, MAX_PAGES + 1):
        if page > 1:
            await asyncio.sleep(1.1)
        data, digest = await request_page(client, {**params, 'page': page})
        hashes.append(digest)
        total = max(total, data['total_results'])
        for item in data['results']:
            scanned += 1
            try:
                projected = observation(item, now)
            except (ValueError, TypeError, AttributeError) as exc:
                reason = str(exc) if str(exc) in {'privacy', 'license', 'identity', 'coordinates', 'date', 'fields', 'quality', 'attribution'} else 'fields'
                rejected[reason] = rejected.get(reason, 0) + 1
                continue
            old = records.get(projected['id'])
            if old is not None and old != projected:
                raise ValueError('Conflicting iNaturalist pagination duplicate')
            records[projected['id']] = projected
        if len(data['results']) < PAGE_SIZE or page * PAGE_SIZE >= total:
            break
    index, dedup = await gbif_index(conn)
    observations = sorted(records.values(), key=lambda r: r['id'], reverse=True)
    for item in observations:
        item['gbif_ids'] = index.get(item['id'], [])
    overlaps = sum(bool(item['gbif_ids']) for item in observations)
    publication = {'status': 'success', 'fetched_at': now.isoformat(), 'bbox_lon_lat': list(BBOX),
                   'matched': total, 'scanned': scanned, 'rejected': rejected,
                   'truncated': len(records) + sum(rejected.values()) < total, 'count': len(observations),
                   'gbif_overlap_count': overlaps, 'additional_count': len(observations) - overlaps,
                   'deduplication': dedup, 'observations': observations,
                   'note': 'Fundmeldungen sind keine repräsentativen Bestandszählungen.'}
    # Persistent audit has neither observation IDs, dates, positions nor attribution.
    audit = json.dumps({'query': params, 'fetched_at': now.isoformat(), 'provider_page_sha256': hashes,
                        'matched': total, 'scanned': scanned, 'accepted': len(observations),
                        'rejected': rejected, 'projection_sha256': hashlib.sha256(json.dumps(publication, sort_keys=True).encode()).hexdigest()}, sort_keys=True).encode()
    digest = hashlib.sha256(audit).hexdigest()
    current = {f"inaturalist:{item['id']}": datetime.fromisoformat(item['observed_on']).replace(tzinfo=UTC).isoformat()
               for item in observations}
    current_entities = list(current)
    async with conn.transaction():
        await conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING", (digest, len(audit)))
        # Retain unchanged accepted observations and stable identities. Withdraw
        # removed/private records and corrected original dates atomically.
        await conn.execute('DELETE FROM reading_revisions WHERE measurement_id IN (SELECT id FROM measurement_definitions WHERE source_id=%s)', (source['id'],))
        await conn.execute("""WITH current AS MATERIALIZED (
            SELECT key AS entity_id,value::timestamptz AS observed_at FROM jsonb_each_text(%s)
        ) DELETE FROM readings r USING measurement_definitions d
        WHERE r.measurement_id=d.id AND d.source_id=%s AND NOT EXISTS(
            SELECT 1 FROM current c WHERE c.entity_id=d.entity_id AND c.observed_at=r.observed_at)""",
            (Jsonb(current),source['id']))
        await conn.execute('DELETE FROM measurement_definitions WHERE source_id=%s AND entity_id<>ALL(%s::text[])', (source['id'],current_entities))
        await conn.execute("DELETE FROM entities WHERE entity_type='inaturalist_observation' AND id LIKE 'inaturalist:%%' AND id<>ALL(%s::text[])", (current_entities,))
        await conn.execute('DELETE FROM collected_dataset_versions WHERE dataset=%s', (DATASET,))
        receipt = (await (await conn.execute("INSERT INTO collection_attempts(source_id,payload_sha256,status,http_status) VALUES (%s,%s,'success',200) RETURNING id", (source['id'], digest))).fetchone())[0]
        for item in observations:
            entity = f"inaturalist:{item['id']}"
            await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata) VALUES (%s,%s,'inaturalist_observation',%s)
                ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,entity_type=EXCLUDED.entity_type,
                    metadata=EXCLUDED.metadata,is_hidden=FALSE,updated_at=NOW()
                WHERE (entities.name,entities.entity_type,entities.metadata,entities.is_hidden)
                    IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.entity_type,EXCLUDED.metadata,FALSE)""",
                (entity, item['scientific_name'], Jsonb(item)))
            stamp = datetime.fromisoformat(item['observed_on']).replace(tzinfo=UTC)
            await conn.execute("SELECT write_environment_measurement(%s,'occurrence_presence','count',%s,'observation',%s,%s,1,%s,%s,'valid',NULL,NULL,'reference')",
                               (entity, source['id'], Jsonb({}), stamp, receipt, Jsonb(item)))
        # Older schema installations may still produce revisions on upsert.
        await conn.execute('DELETE FROM reading_revisions WHERE measurement_id IN (SELECT id FROM measurement_definitions WHERE source_id=%s)', (source['id'],))
        await publish(conn, source, DATASET, publication, digest, now)
    await conn.commit()
    return 'success'


async def import_inaturalist(conn, client, source):
    try:
        return await _import_inaturalist(conn, client, source)
    except Exception:
        # A failed daily revalidation withdraws the previous precise publication.
        await conn.rollback()
        async with conn.transaction():
            for table in ('reading_revisions', 'readings'):
                await conn.execute(f'DELETE FROM {table} WHERE measurement_id IN (SELECT id FROM measurement_definitions WHERE source_id=%s)', (source['id'],))
            await conn.execute('DELETE FROM measurement_definitions WHERE source_id=%s', (source['id'],))
            await conn.execute("DELETE FROM entities WHERE entity_type='inaturalist_observation' AND id LIKE 'inaturalist:%'")
            await conn.execute('DELETE FROM collected_dataset_versions WHERE dataset=%s', (DATASET,))
            await conn.execute('DELETE FROM collected_datasets WHERE dataset=%s', (DATASET,))
            await conn.execute("INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'failed','Public observation revalidation failed')", (source['id'],))
        await conn.commit()
        raise
