"""Bounded GBIF occurrence search snapshots, never abundance estimates."""

import hashlib
import json
import math
import re
from datetime import UTC, datetime
from urllib.parse import urlencode, urlsplit

from psycopg.types.json import Jsonb

SOURCE = 'environment-gbif'
REGION = 'environment:gbif:ried'
BBOX = (8.35, 49.55, 8.65, 49.76)
PAGE_SIZE = 300
MAX_RECORDS = 3000


def query(now):
    return {'decimalLatitude': '49.55,49.76', 'decimalLongitude': '8.35,8.65',
            'country': 'DE', 'hasCoordinate': 'true', 'hasGeospatialIssue': 'false',
            'occurrenceStatus': 'PRESENT', 'year': f'{now.year-5},{now.year}'}


async def acquire(client, settings, conn, now=None):
    now = now or datetime.now(UTC)
    last = await (await conn.execute('SELECT received_at,status FROM collection_attempts WHERE source_id=%s ORDER BY received_at DESC,id DESC LIMIT 1', (SOURCE,))).fetchone()
    if last and (now-last[0]).total_seconds() < settings.gbif_poll_seconds:
        if last[1] != 'success':
            raise ValueError('GBIF retry not due; previous attempt has not succeeded')
        return None
    pages = []
    try:
        for offset in range(0, MAX_RECORDS, PAGE_SIZE):
            url = 'https://api.gbif.org/v1/occurrence/search?' + urlencode({**query(now), 'limit': PAGE_SIZE, 'offset': offset})
            response = await client.get(url, timeout=settings.request_timeout)
            body = response.content
            if len(body) > 20 * 1024 * 1024:
                raise ValueError('GBIF page exceeds 20 MiB')
            sha = hashlib.sha256(body).hexdigest()
            await conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING", (sha, len(body)))
            receipt = await (await conn.execute("INSERT INTO collection_attempts(source_id,http_status,payload_sha256,status) VALUES (%s,%s,%s,%s) RETURNING id,received_at", (SOURCE, response.status_code, sha, 'received' if response.is_success else 'failed'))).fetchone()
            await conn.commit()
            response.raise_for_status()
            data = json.loads(body)
            pages.append({'_body': body, 'data': data, 'sha256': sha, 'attempt_id': receipt[0], 'received_at': receipt[1].isoformat(), 'url': url})
            if data.get('endOfRecords') is True:
                break
    except Exception as exc:
        await conn.execute("INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'failed',%s)", (SOURCE, type(exc).__name__))
        await conn.commit()
        raise
    return {'pages': pages, 'query': query(now)}


def normalize(bundle):
    pages = bundle['pages']
    if not pages or len(pages) > MAX_RECORDS // PAGE_SIZE:
        raise ValueError('Invalid GBIF page count')
    total, seen, rows, scanned, skipped = None, set(), [], 0, 0
    for index, page in enumerate(pages):
        data = page['data']
        count = data.get('count')
        results = data.get('results')
        if type(count) is not int or count < 0 or (total is not None and count != total):
            raise ValueError('GBIF result count changed during pagination')
        total = count
        if (data.get('offset') != index*PAGE_SIZE or type(data.get('limit')) is not int
                or not 1 <= data['limit'] <= PAGE_SIZE or not isinstance(results, list)
                or len(results) > data['limit'] or type(data.get('endOfRecords')) is not bool):
            raise ValueError('Malformed GBIF page')
        if not data['endOfRecords'] and (len(results) != PAGE_SIZE or data['limit'] != PAGE_SIZE):
            raise ValueError('Incomplete GBIF page')
        if data['endOfRecords'] and (index != len(pages)-1 or scanned+len(results) != total):
            raise ValueError('Inconsistent GBIF pagination end')
        scanned += len(results)
        if scanned > total:
            raise ValueError("GBIF scanned count exceeds matched count")
        for record in results:
            key = record.get('key')
            if type(key) is not int or key <= 0 or key in seen:
                raise ValueError('Invalid or duplicate GBIF occurrence identity')
            seen.add(key)
            lat, lon = record.get('decimalLatitude'), record.get('decimalLongitude')
            valid_coords = all(type(v) in (int, float) and math.isfinite(v) for v in (lat, lon))
            if (not valid_coords or not BBOX[1] <= lat <= BBOX[3] or not BBOX[0] <= lon <= BBOX[2]
                    or record.get('countryCode') != 'DE' or record.get('occurrenceStatus') != 'PRESENT'
                    or record.get('hasGeospatialIssues') is True):
                skipped += 1
                continue
            try:
                y, m, d = (record[k] for k in ('year', 'month', 'day'))
                if any(type(v) is not int for v in (y, m, d)):
                    raise ValueError('Missing day precision')
                stamp = datetime(y, m, d, tzinfo=UTC)
                start_year, end_year = map(int, bundle['query']['year'].split(','))
                if not start_year <= y <= end_year or stamp.date() > datetime.fromisoformat(page['received_at']).date():
                    raise ValueError('Unexpected occurrence date')
                # Intervals spanning several days must not be presented as one day.
                event = record.get('eventDate', '')
                if event and event[:10] != stamp.date().isoformat():
                    raise ValueError('Event date disagrees with reported day')
                if '/' in event and event.split('/')[0][:10] != event.split('/')[1][:10]:
                    raise ValueError('Multi-day event')
            except (KeyError, TypeError, ValueError):
                skipped += 1
                continue
            license_url = record.get('license', '')
            if license_url not in ('http://creativecommons.org/licenses/by/4.0/legalcode', 'https://creativecommons.org/licenses/by/4.0/legalcode',
                                   'http://creativecommons.org/licenses/by-nc/4.0/legalcode', 'https://creativecommons.org/licenses/by-nc/4.0/legalcode',
                                   'http://creativecommons.org/publicdomain/zero/1.0/legalcode', 'https://creativecommons.org/publicdomain/zero/1.0/legalcode'):
                skipped += 1
                continue
            if not isinstance(record.get('scientificName'), str) or not record['scientificName'] or not record.get('datasetKey'):
                skipped += 1
                continue
            uncertainty = record.get('coordinateUncertaintyInMeters')
            if uncertainty is not None and (type(uncertainty) not in (int, float) or not math.isfinite(uncertainty) or uncertainty < 0):
                uncertainty = None
            evidence = {k: record.get(k) for k in ('datasetKey', 'publishingOrgKey', 'basisOfRecord', 'scientificName', 'species', 'speciesKey', 'taxonKey', 'taxonRank', 'eventDate', 'issues', 'informationWithheld', 'dataGeneralizations')}
            evidence.update(gbif_id=key, date_precision='day', license=license_url,
                source_url=f'https://www.gbif.org/occurrence/{key}', dataset_url=f'https://www.gbif.org/dataset/{record["datasetKey"]}',
                spatial_reference={'crs': 'EPSG:4326', 'latitude': lat, 'longitude': lon, 'coordinate_uncertainty_m': uncertainty})
            origin_ids = set()
            for field in ('occurrenceID','references','identifier'):
                value = record.get(field)
                if not isinstance(value,str):
                    continue
                try:
                    url = urlsplit(value)
                    match = re.fullmatch(r'/observations/([1-9][0-9]*)/?',url.path)
                    if url.scheme in ('http','https') and url.hostname in ('inaturalist.org','www.inaturalist.org') and not url.username and not url.password and match:
                        origin_ids.add(int(match[1]))
                except ValueError:
                    continue
            rows.append({'key': key, 'stamp': stamp, 'evidence': evidence, 'attempt_id': page['attempt_id'], 'inaturalist_ids': sorted(origin_ids)})
    if not pages[-1]['data']['endOfRecords'] and scanned != MAX_RECORDS:
        raise ValueError('GBIF acquisition ended before configured cap')
    sha = hashlib.sha256(''.join(p['sha256'] for p in pages).encode()).hexdigest()
    return {'rows': rows, 'snapshot_sha256': sha, 'matched': total, 'scanned': scanned,
            'skipped': skipped, 'source_truncated': scanned < total, 'query': bundle['query'], 'bbox': BBOX}


async def persist(conn, bundle, normalized):
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (REGION,))
        if normalized != normalize(bundle):
            raise ValueError('GBIF normalization differs from archived input')
        for page in bundle['pages']:
            receipt = await (await conn.execute("SELECT p.body,a.received_at,a.payload_sha256 FROM collection_attempts a JOIN collected_payloads p ON p.sha256=a.payload_sha256 WHERE a.id=%s AND a.source_id=%s AND a.http_status=200 AND a.status IN ('received','success')", (page['attempt_id'], SOURCE))).fetchone()
            raw = page.get('_body', receipt[0] if receipt else None)
            if (receipt is None or raw is None or json.loads(bytes(raw)) != page['data'] or hashlib.sha256(bytes(raw)).hexdigest() != page['sha256']
                    or receipt[2] != page['sha256'] or receipt[1] != datetime.fromisoformat(page['received_at'])
                    or page['url'] != 'https://api.gbif.org/v1/occurrence/search?' + urlencode({**bundle['query'], 'limit': PAGE_SIZE, 'offset': page['data']['offset']})):
                raise ValueError('GBIF input differs from archived receipt')
        # Query must be the fixed Ried search for the acquisition year, including all filters.
        if bundle['query'] != query(datetime.fromisoformat(bundle['pages'][0]['received_at'])):
            raise ValueError('Unexpected GBIF query')
        metadata = {k: v for k, v in normalized.items() if k != 'rows'}
        metadata.update(accepted=len(normalized['rows']), last_checked_at=bundle['pages'][-1]['received_at'])
        existing = await (await conn.execute('SELECT metadata FROM entities WHERE id=%s FOR UPDATE', (REGION,))).fetchone()
        unchanged = existing and existing[0].get('snapshot_sha256') == normalized['snapshot_sha256']
        if not unchanged:
            for item in normalized['rows']:
                entity = f'environment:gbif:{item["key"]}'
                await conn.execute("INSERT INTO entities(id,name,entity_type,metadata) VALUES (%s,%s,'biodiversity_occurrence',%s) ON CONFLICT(id) DO UPDATE SET metadata=entities.metadata || EXCLUDED.metadata,updated_at=NOW()", (entity, item['evidence']['scientificName'], Jsonb({'gbif_id': item['key']})))
                await conn.execute("SELECT write_environment_measurement(%s,'occurrence_presence','count',%s,'observation',%s,%s,1,%s,%s)",
                    (entity, SOURCE, Jsonb({'snapshot_sha256': normalized['snapshot_sha256']}), item['stamp'], item['attempt_id'], Jsonb(item['evidence'])))
        # Keep only the origin identifiers needed by the cross-source comparison.
        for item in normalized['rows']:
            await conn.execute("UPDATE entities SET metadata=metadata || %s WHERE id=%s",
                (Jsonb({'inaturalist_ids':item['inaturalist_ids'], 'origin_links_checked':True,
                        'origin_snapshot_sha256':normalized['snapshot_sha256']}),f'environment:gbif:{item["key"]}'))
        await conn.execute("INSERT INTO entities(id,name,entity_type,metadata) VALUES (%s,'GBIF Suchausschnitt Ried','monitoring_area',%s) ON CONFLICT(id) DO UPDATE SET metadata=entities.metadata || EXCLUDED.metadata,updated_at=NOW()", (REGION, Jsonb(metadata)))
        for page in bundle['pages']:
            await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s", (page['attempt_id'],))
    return 0 if unchanged else len(normalized['rows'])
