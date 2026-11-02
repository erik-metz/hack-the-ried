"""Historical official BORIS zones, with complete archived WFS pagination."""
import hashlib
import json
import math
from datetime import UTC, datetime
from urllib.parse import urlencode

from defusedxml import ElementTree as ET
from publications import acquire, publish

NS = {'b': 'http://www.adv-online.de/namespaces/adv/brm/2.1',
      'g': 'http://www.opengis.net/gml/3.2', 'w': 'http://www.opengis.net/wfs/2.0'}
CRS = 'urn:ogc:def:crs:EPSG::4326'


def page_url(source, offset):
    south, west, north, east = source['bbox']
    return source['url'].rstrip('?') + '?' + urlencode({
        'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
        'typenames': 'boris:BR_BodenrichtwertZonal', 'count': 100,
        'startIndex': offset, 'srsName': CRS,
        'bbox': f'{south},{west},{north},{east},{CRS}'})


def parse_page(body, source):
    root = ET.fromstring(body)
    if root.tag != '{' + NS['w'] + '}FeatureCollection':
        raise ValueError('BORIS WFS exception or unexpected response')
    members = root.findall('w:member', NS)
    if root.get('numberReturned') != str(len(members)) or len(members) > 100:
        raise ValueError('BORIS page count mismatch')
    ids, zones = [], []
    for member in members:
        if len(member) != 1 or member[0].tag != '{' + NS['b'] + '}BR_BodenrichtwertZonal':
            raise ValueError('Unexpected BORIS feature type')
        f = member[0]
        identifier = f.get('{' + NS['g'] + '}id')
        if not identifier:
            raise ValueError('Missing BORIS identifier')
        ids.append(identifier)
        def text(path, feature=f):
            value = feature.findtext(path, namespaces=NS)
            if value is None or not value.strip():
                raise ValueError('Missing BORIS field: ' + path)
            return value.strip()
        path = 'b:gemeinde/b:BR_Gemeinde/'
        ags = ''.join(text(path + 'b:kennzeichen/b:BR_Gemeindekennzeichen/b:' + k)
                      for k in ['land', 'regierungsbezirk', 'kreis', 'gemeinde'])
        if ags not in source['municipalities']:
            continue
        name = text(path + 'b:name')
        if name != source['municipalities'][ags]:
            raise ValueError('BORIS municipality code/name mismatch')
        stamp = text('b:stichtag')
        if stamp != source['reference_date']:
            raise ValueError('BORIS reference date changed')
        value = float(text('b:bodenrichtwert'))
        if not math.isfinite(value) or value < 0:
            raise ValueError('Invalid BORIS land value')
        polygons = []
        position = f.find('b:position', NS)
        # Geometry belongs to the AdV namespace, not the BORIS namespace.
        if position is None:
            position = f.find('{http://www.adv-online.de/namespaces/adv/gid/7.1}position')
        if position is None:
            raise ValueError('Missing BORIS geometry')
        for polygon in position.findall('.//g:Polygon', NS):
            if polygon.get('srsName') != CRS or polygon.get('srsDimension', '2') != '2':
                raise ValueError('Unexpected BORIS CRS or dimension')
            rings = []
            boundaries = polygon.findall('g:exterior', NS) + polygon.findall('g:interior', NS)
            if len(polygon.findall('g:exterior', NS)) != 1:
                raise ValueError('Missing BORIS exterior ring')
            for boundary in boundaries:
                lists = boundary.findall('g:LinearRing/g:posList', NS)
                if len(lists) != 1 or lists[0].get('srsDimension', '2') != '2':
                    raise ValueError('Unsupported BORIS ring')
                numbers = [float(n) for n in (lists[0].text or '').split()]
                if len(numbers) < 8 or len(numbers) % 2:
                    raise ValueError('Invalid BORIS ring coordinates')
                ring = []
                for lat, lon in zip(numbers[::2], numbers[1::2]):
                    if not math.isfinite(lat) or not math.isfinite(lon) or not 49 <= lat <= 52 or not 7 <= lon <= 11:
                        raise ValueError('Invalid BORIS coordinate or axis order')
                    ring.append([lon, lat])
                if ring[0] != ring[-1]:
                    raise ValueError('Unclosed BORIS ring')
                rings.append(ring)
            polygons.append(rings)
        if not polygons:
            raise ValueError('Unsupported BORIS geometry')
        geometry = {'type': 'Polygon', 'coordinates': polygons[0]} if len(polygons) == 1 else {'type': 'MultiPolygon', 'coordinates': polygons}
        zones.append({'id': identifier, 'ags': ags, 'municipality': name,
                      'zone_code': text('b:bodenrichtwertNummer'),
                      'district': f.findtext('b:gemarkung/b:BR_Gemarkung/b:name', namespaces=NS),
                      'stichtag': stamp, 'land_value_eur_sqm': value,
                      'zone_type': text('b:nutzung/b:BR_Nutzung/b:art'),
                      'development_status': text('b:entwicklungszustand'),
                      'bodenrichtwert_art': text('b:bodenrichtwertArt'),
                      'geometry': geometry, 'source': 'HVBG · BORIS Hessen 2024',
                      'unit': 'EUR/m²', 'license': 'dl-de/zero-2-0'})
    return ids, zones


async def import_boris(conn, client, source):
    seen, zones, parts, attempts = set(), [], [], []
    for page in range(50):
        response, digest, attempt = await acquire(conn, client, source, page_url(source, page * 100))
        ids, records = parse_page(response.content, source)
        if len(set(ids)) != len(ids) or seen.intersection(ids):
            raise ValueError('Duplicate BORIS features or ignored pagination')
        seen.update(ids)
        zones.extend(records)
        parts.append({'sha256': digest, 'offset': page * 100, 'returned': len(ids)})
        attempts.append(attempt)
        if not ids:
            break
    else:
        raise ValueError('BORIS pagination limit reached')
    if {z['ags'] for z in zones} != set(source['municipalities']):
        raise ValueError('Incomplete BORIS municipality coverage')
    # Publication digest identifies an explicit manifest of unchanged original pages.
    manifest = json.dumps({'contract': 'boris-wfs-pages-v1', 'parts': parts}, sort_keys=True).encode()
    digest = hashlib.sha256(manifest).hexdigest()
    stamp = datetime.fromisoformat(source['reference_date']).replace(tzinfo=UTC)
    geo = {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'id': z['id'], 'geometry': z['geometry'],
         'properties': {k: v for k, v in z.items() if k != 'geometry'}} for z in zones]}
    async with conn.transaction():
        await conn.execute('INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING',
                           (digest, len(manifest), 'application/vnd.openried.boris-page-manifest+json'))
        await publish(conn, source, 'realestate/boris', zones, digest, stamp)
        await publish(conn, source, 'map/layers/boris', geo, digest, stamp)
        await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=ANY(%s)", (attempts,))
        await conn.execute("UPDATE collection_attempts SET item_count=%s,item_count_unit='items' WHERE id=%s", (len(zones), attempts[-1]))
    await conn.commit()
