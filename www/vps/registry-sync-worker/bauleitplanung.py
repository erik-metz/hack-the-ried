"""Official development plans from the Kreis Bergstraße Bauleitplanungskataster (WFS).

Only municipalities contained in the county cadastre are published. Missing
municipalities stay listed as missing; no plan, status or document is inferred.
"""
import hashlib
import json
import math
from datetime import UTC, datetime
from urllib.parse import urlencode, urlsplit

from publications import acquire, publish

CRS = 'urn:ogc:def:crs:EPSG::4326'
PAGE_SIZE = 1000
MAX_PAGES = 20
STATUS_LABELS = {'rechtskraeftig': 'Rechtskräftig', 'im_verfahren': 'Im Verfahren'}


def page_url(source, offset):
    south, west, north, east = source['bbox']
    return source['url'].rstrip('?') + '?' + urlencode({
        'SERVICE': 'WFS', 'VERSION': '2.0.0', 'REQUEST': 'GetFeature',
        'TYPENAMES': source['type_name'], 'NAMESPACES': source['namespaces'],
        'OUTPUTFORMAT': 'application/geo+json', 'SRSNAME': CRS,
        'COUNT': PAGE_SIZE, 'STARTINDEX': offset,
        'BBOX': f'{south},{west},{north},{east},{CRS}'})


def text(value):
    """Provider fields use empty strings and '-' for absent values."""
    if value is None:
        return None
    value = str(value).strip()
    return value if value and value != '-' else None


def iso_date(value):
    value = text(value)
    if value is None:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date().isoformat()
    except ValueError as exc:
        raise ValueError('Unexpected development plan date') from exc


def document(value):
    value = text(value)
    if value is None:
        return None
    if urlsplit(value).scheme != 'https':
        raise ValueError('Development plan document must use HTTPS')
    return value


def plan_status(props):
    """Only dates in the cadastre decide the status; nothing is assumed."""
    if iso_date(props.get('RECHTSKR')):
        return 'rechtskraeftig'
    if any(iso_date(props.get(k)) for k in ('AUFSTELLB', 'EINLEITB', 'OFFENLEGB', 'SATZBESCHL')):
        return 'im_verfahren'
    return None


def checked_rings(polygon):
    rings = []
    for ring in polygon:
        if len(ring) < 4 or ring[0] != ring[-1]:
            raise ValueError('Invalid development plan ring')
        for point in ring:
            if len(point) != 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in point):
                raise ValueError('Invalid development plan coordinate')
            lon, lat = point
            if not (7 <= lon <= 11 and 49 <= lat <= 52):
                raise ValueError('Development plan coordinate outside Hessen or wrong axis order')
        rings.append(ring)
    return rings


def geometry_of(feature):
    geometry = feature.get('geometry') or {}
    if geometry.get('type') == 'Polygon':
        polygons = [geometry.get('coordinates') or []]
    elif geometry.get('type') == 'MultiPolygon':
        polygons = geometry.get('coordinates') or []
    else:
        raise ValueError('Unsupported development plan geometry')
    polygons = [checked_rings(p) for p in polygons]
    if not polygons:
        raise ValueError('Empty development plan geometry')
    return ({'type': 'Polygon', 'coordinates': polygons[0]} if len(polygons) == 1
            else {'type': 'MultiPolygon', 'coordinates': polygons}), polygons


def center_of(polygons):
    """Mean of the outer ring vertices: a label position, not an area centroid."""
    points = [p for polygon in polygons for p in polygon[0][:-1]]
    return (round(sum(p[1] for p in points) / len(points), 6),
            round(sum(p[0] for p in points) / len(points), 6))


def parse_page(body, source):
    data = json.loads(body)
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('Development plan WFS exception or unexpected response')
    if len(data['features']) > PAGE_SIZE:
        raise ValueError('Development plan page exceeds requested size')
    ids, plans = [], []
    for feature in data['features']:
        identifier = feature.get('id')
        props = feature.get('properties')
        if not isinstance(identifier, str) or not identifier or not isinstance(props, dict):
            raise ValueError('Development plan feature without identifier')
        ids.append(identifier)
        ags = text(props.get('AGS'))
        if ags not in source['municipalities']:
            continue
        name = text(props.get('NAME'))
        if not name:
            raise ValueError('Development plan without name')
        if text(props.get('GEMEINDE')) != source['municipalities'][ags]:
            raise ValueError('Development plan municipality code/name mismatch')
        geometry, polygons = geometry_of(feature)
        lat, lng = center_of(polygons)
        status = plan_status(props)
        plans.append({
            'id': identifier, 'ags': ags, 'municipality': source['municipalities'][ags],
            'district': text(props.get('GEMARKUNG')), 'name': name, 'plan_name': name,
            'plan_number': text(props.get('NAME_A')), 'plan_type': text(props.get('TYP')),
            'status': status, 'status_label': STATUS_LABELS.get(status, 'Status nicht angegeben'),
            'legal_since': iso_date(props.get('RECHTSKR')),
            'adopted_at': iso_date(props.get('SATZBESCHL')),
            'document_url': document(props.get('PLANZEICHN')),
            'text_url': document(props.get('PLANTEXT')),
            'justification_url': document(props.get('BEGRUEND')),
            'data_as_of': iso_date(props.get('AKT_DATENS')),
            'center_lat': lat, 'center_lng': lng, 'geometry': geometry,
            'source': source['attribution'], 'license': source['license'],
        })
    return ids, plans


def export_time(pages):
    """Cadastre export timestamp (AKT_DATENB, e.g. 20261014124335) of the newest page."""
    stamps = []
    for body in pages:
        for feature in json.loads(body)['features']:
            value = (feature.get('properties') or {}).get('AKT_DATENB')
            if isinstance(value, (int, float)) and math.isfinite(value):
                stamps.append(datetime.strptime(str(int(value)), '%Y%m%d%H%M%S').replace(tzinfo=UTC))
    if not stamps:
        raise ValueError('Development plan export timestamp missing')
    return max(stamps)


async def import_bauleitplanung(conn, client, source):
    seen, plans, parts, attempts, bodies = set(), [], [], [], []
    for page in range(MAX_PAGES):
        response, digest, attempt = await acquire(conn, client, source, page_url(source, page * PAGE_SIZE))
        ids, records = parse_page(response.content, source)
        if len(set(ids)) != len(ids) or seen.intersection(ids):
            raise ValueError('Duplicate development plans or ignored pagination')
        seen.update(ids)
        plans.extend(records)
        bodies.append(response.content)
        parts.append({'sha256': digest, 'offset': page * PAGE_SIZE, 'returned': len(ids)})
        attempts.append(attempt)
        if len(ids) < PAGE_SIZE:
            break
    else:
        raise ValueError('Development plan pagination limit reached')
    covered = sorted({p['ags'] for p in plans})
    if not covered:
        raise ValueError('No development plans for any configured municipality')
    missing = sorted(set(source['municipalities']) - set(covered))
    stamp = min(export_time(bodies), datetime.now(UTC))
    manifest = json.dumps({'contract': 'bauleitplanung-wfs-pages-v1', 'parts': parts}, sort_keys=True).encode()
    digest = hashlib.sha256(manifest).hexdigest()
    metadata = {
        'attribution': source['attribution'], 'license': source['license'],
        'license_url': source['license_url'], 'source_url': source['url'],
        'exported_at': stamp.isoformat(),
        'covered_municipalities': [source['municipalities'][a] for a in covered],
        'missing_municipalities': [source['municipalities'][a] for a in missing],
    }
    geo = {'type': 'FeatureCollection', 'metadata': metadata, 'features': [
        {'type': 'Feature', 'id': p['id'], 'geometry': p['geometry'],
         'properties': {k: v for k, v in p.items() if k not in ('geometry', 'center_lat', 'center_lng')}}
        for p in plans]}
    listing = [{k: v for k, v in p.items() if k != 'geometry'} for p in plans]
    async with conn.transaction():
        await conn.execute('INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING',
                           (digest, len(manifest), 'application/vnd.openried.bauleitplanung-page-manifest+json'))
        await publish(conn, source, 'realestate/development-plans', listing, digest, stamp)
        await publish(conn, source, 'map/layers/devplans', geo, digest, stamp)
        await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=ANY(%s)", (attempts,))
        await conn.execute("UPDATE collection_attempts SET item_count=%s,item_count_unit='items' WHERE id=%s", (len(plans), attempts[-1]))
    await conn.commit()
