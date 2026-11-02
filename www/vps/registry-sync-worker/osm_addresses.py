"""Collect regional address geometry from a disk-backed OSM extract, without Overpass."""
import asyncio
import hashlib
import json
import tempfile
from datetime import UTC, datetime
from itertools import pairwise

from house_numbers import house_number_parts
from publications import publish

ADDRESS_INVENTORY_VERSION = 2


def extract_addresses(path, source):
    import osmium
    cities = set(source['municipalities'])
    south, west, north, east = source['bbox']
    ways = {}
    needed = set()
    coordinates = {}
    elements = []
    crossings = []
    rail_edges = []
    regional_nodes = {}
    map_layers = {key: {'type': 'FeatureCollection', 'features': []} for key in ('nature', 'crops', 'wifi', 'energy', 'companies', 'places')}

    def map_kind(tags):
        if tags.get('amenity') in ('school', 'kindergarten', 'college', 'university', 'hospital', 'clinic', 'doctors', 'pharmacy', 'library', 'community_centre', 'theatre') or tags.get('tourism') in ('museum', 'attraction', 'information') or tags.get('leisure') in ('sports_centre', 'stadium'):
            return 'places'
        if tags.get('leisure') == 'nature_reserve' or tags.get('boundary') == 'protected_area':
            return 'nature'
        if tags.get('landuse') in ('farmland', 'orchard', 'vineyard'):
            return 'crops'
        if tags.get('internet_access') == 'wlan' and tags.get('internet_access:access') in ('yes', 'public', 'customers'):
            return 'wifi'
        if tags.get('power') in ('plant', 'generator'):
            return 'energy'
        if tags.get('name') and (tags.get('office') == 'company' or tags.get('industrial')):
            return 'companies'
        return None

    def energy_meta(tags):
        source = tags.get('generator:source') or tags.get('plant:source')
        method = tags.get('generator:method') or tags.get('plant:method')
        place = tags.get('generator:place') or tags.get('location')
        power = tags.get('power')
        is_plant = power == 'plant'

        if source == 'solar' or method == 'photovoltaic' or place in ('roof', 'rooftop'):
            if is_plant or place == 'ground':
                return 'Solarpark / Freiflächenanlage', 'Photovoltaik (Freifläche)'
            return 'Private Solaranlage / Photovoltaik-Dachanlage', 'Photovoltaik (Dachanlage)'
        if source == 'biogas' or tags.get('plant:source') == 'biogas':
            return 'Biogasanlage', 'Biomasse / Biogas'
        if source == 'wind' or method == 'wind_turbine':
            return 'Windkraftanlage', 'Windenergie'
        if source in ('gas', 'diesel', 'oil') or method == 'cogeneration':
            return 'Blockheizkraftwerk / Notstrom', 'BHKW'
        if is_plant:
            return 'Energiepark / Erzeugungsanlage', 'Kraftwerk / Großanlage'
        return 'Private Solaranlage / Photovoltaik-Dachanlage', 'Photovoltaik (Dachanlage)'

    def add_feature(kind, identity, tags, geometry):
        if kind == 'energy':
            default_name, facility_type = energy_meta(tags)
            props = {
                'id': identity,
                'name': tags.get('name') or default_name,
                'facility_type': facility_type,
                'operator': tags.get('operator'),
                'address': ' '.join(filter(None, [tags.get('addr:street'), tags.get('addr:housenumber')])),
                'source': 'OpenStreetMap / Geofabrik',
                'description': 'Kartierte Anlage (z. B. private Solaranlage / Photovoltaik-Dachanlage). Keine Live-Einspeisemessung und kein IoT-Sensor.',
            }
        elif kind == 'crops':
            crop_type = tags.get('crop') or tags.get('produce') or tags.get('landuse')
            props = {
                'id': identity,
                'name': tags.get('name') or (f'Landwirtschaftliche Fläche ({crop_type})' if crop_type and crop_type != 'farmland' else 'Landwirtschaftliche Fläche'),
                'operator': tags.get('operator'),
                'crop_type': crop_type,
                'place_type': tags.get('landuse'),
                'address': ' '.join(filter(None, [tags.get('addr:street'), tags.get('addr:housenumber')])),
                'source': 'OpenStreetMap / Geofabrik',
                'description': f'Kartierte Fläche ({crop_type}). OpenStreetMap-Bestand; keine amtliche INVEKOS-Referenzparzelle.' if crop_type else 'Kartierte landwirtschaftliche Fläche; keine Live-Messung und kein vollständiges amtliches Register.',
            }
        elif kind == 'nature':
            protect = tags.get('protect_class') or tags.get('protection_title') or tags.get('boundary')
            props = {
                'id': identity,
                'name': tags.get('name') or 'Schutzgebiet',
                'operator': tags.get('operator'),
                'protection_type': protect,
                'place_type': tags.get('leisure') or tags.get('boundary'),
                'address': ' '.join(filter(None, [tags.get('addr:street'), tags.get('addr:housenumber')])),
                'source': 'OpenStreetMap / Geofabrik',
                'description': 'Kartiertes Schutzgebiet; keine Live-Messung und kein vollständiges amtliches Register.',
            }
        else:
            props = {
                'id': identity,
                'name': tags.get('name') or {'wifi': 'WLAN-Standort', 'companies': 'Unternehmen', 'places': 'Öffentlicher Ort'}[kind],
                'operator': tags.get('operator'),
                'place_type': tags.get('amenity') or tags.get('tourism') or tags.get('leisure'),
                'address': ' '.join(filter(None, [tags.get('addr:street'), tags.get('addr:housenumber')])),
                'source': 'OpenStreetMap / Geofabrik',
                'description': 'Kartierter Standort bzw. Fläche; keine Live-Messung und kein vollständiges amtliches Register.',
            }
        map_layers[kind]['features'].append({'type': 'Feature', 'geometry': geometry, 'properties': props})

    def tags_for(obj):
        tags = dict(obj.tags)
        if tags.get('addr:city') in cities and tags.get('addr:street') and house_number_parts(tags.get('addr:housenumber')) is not None:
            return {k: tags[k] for k in ('addr:city', 'addr:street', 'addr:housenumber')}
        return None

    def inside(lat, lon):
        return south <= lat <= north and west <= lon <= east

    class Ways(osmium.SimpleHandler):
        def way(self, obj):
            tags = tags_for(obj)
            if tags:
                refs = [node.ref for node in obj.nodes]
                ways[obj.id] = (tags, refs)
                needed.update(refs)

    class Nodes(osmium.SimpleHandler):
        def node(self, obj):
            if not obj.location.valid():
                return
            lat, lon = obj.location.lat, obj.location.lon
            if obj.id in needed:
                coordinates[obj.id] = (lat, lon)
            if inside(lat, lon):
                regional_nodes[obj.id] = (lon, lat)
                raw = dict(obj.tags)
                kind = map_kind(raw)
                if kind:
                    add_feature(kind, f"osm-node-{obj.id}", raw, {"type": "Point", "coordinates": [lon, lat]})
                if raw.get('railway') in ('level_crossing', 'crossing') and raw.get('crossing:barrier') in ('yes', 'full', 'half', 'double_half'):
                    crossings.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
                        'properties': {'id': f'osm-node-{obj.id}', 'name': raw.get('name') or raw.get('ref') or 'Bahnübergang',
                                       'barrier': raw['crossing:barrier'], 'railway': raw['railway'],
                                       'source': 'OpenStreetMap / Geofabrik', 'status': 'unknown'}})
                tags = tags_for(obj)
                if tags:
                    elements.append({'type': 'node', 'id': obj.id, 'lat': lat, 'lon': lon, 'tags': tags})

    class MapWays(osmium.SimpleHandler):
        def way(self, obj):
            tags = dict(obj.tags)
            if tags.get('railway') == 'rail' and not tags.get('service'):
                refs = [node.ref for node in obj.nodes]
                for left, right in pairwise(refs):
                    if left in regional_nodes and right in regional_nodes:
                        rail_edges.append([left, right, regional_nodes[left], regional_nodes[right]])
            kind = map_kind(tags)
            if not kind:
                return
            refs = [node.ref for node in obj.nodes]
            if not refs or any(ref not in regional_nodes for ref in refs):
                return
            points = [regional_nodes[ref] for ref in refs]
            if kind in ('nature', 'crops'):
                if len(points) < 4 or refs[0] != refs[-1]:
                    return
                geometry = {'type': 'Polygon', 'coordinates': [points]}
            else:
                geometry = {'type': 'Point', 'coordinates': [sum(p[0] for p in points)/len(points), sum(p[1] for p in points)/len(points)]}
            add_feature(kind, f'osm-way-{obj.id}', tags, geometry)

    # Two streaming passes retain only nodes used by address-tagged local ways.
    # No all-Hessen node-location index is needed.
    Ways().apply_file(str(path))
    Nodes().apply_file(str(path))
    MapWays().apply_file(str(path))
    regional_nodes.clear()
    for identity, (tags, refs) in ways.items():
        if not refs or any(ref not in coordinates for ref in refs):
            continue
        points = [coordinates[ref] for ref in refs]
        lat = (min(p[0] for p in points) + max(p[0] for p in points)) / 2
        lon = (min(p[1] for p in points) + max(p[1] for p in points)) / 2
        if inside(lat, lon):
            elements.append({'type': 'way', 'id': identity, 'center': {'lat': lat, 'lon': lon}, 'tags': tags})
    if not elements:
        raise ValueError('OSM extract contains no matching regional addresses')
    return {'address_inventory_version': ADDRESS_INVENTORY_VERSION, 'elements': elements, 'map_layers': map_layers, 'crossings': {'type': 'FeatureCollection', 'inventory_version': 3, 'features': crossings, 'rail_edges': rail_edges}, 'coverage': 'OSM address nodes and ways; not a complete address register'}


async def import_addresses(conn, client, source):
    cursor = await conn.execute(
        """SELECT 1 FROM collected_datasets WHERE dataset='waste/address-inventory'
        AND source_id=%s AND source_url=%s AND expires_at>NOW()
        AND fetched_at>NOW()-make_interval(secs => %s)
        AND data->>'address_inventory_version'=%s
        AND EXISTS (SELECT 1 FROM collected_datasets c WHERE c.dataset='map/layers/crossings'
                    AND c.source_id=collected_datasets.source_id AND c.expires_at>NOW()
                    AND c.data->>'inventory_version'='3')""",
        (source['id'], source['url'], source.get('interval_seconds', 604800), str(ADDRESS_INVENTORY_VERSION)))
    fresh = await cursor.fetchone()
    await conn.commit()
    if fresh:
        return 'success'
    checksum = hashlib.sha256()
    size = 0
    with tempfile.NamedTemporaryFile(suffix='.osm.pbf') as file:
        async with client.stream('GET', source['url']) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(256 * 1024):
                size += len(chunk)
                if size > 512 * 1024 * 1024:
                    raise ValueError('OSM extract exceeds 512 MiB download limit')
                checksum.update(chunk)
                file.write(chunk)
        file.flush()
        inventory = await asyncio.to_thread(extract_addresses, file.name, source)
    now = datetime.now(UTC)
    inventory.update(source_url=source['url'], extract_sha256=checksum.hexdigest(), fetched_at=now.isoformat())
    # Persist the exact regional extraction and parent-file checksum, not a
    # second permanent copy of the hundreds-of-MB statewide download.
    body = json.dumps(inventory, sort_keys=True).encode()
    digest = hashlib.sha256(body).hexdigest()
    async with conn.transaction():
        await conn.execute('INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING',
                           (digest, len(body), 'application/vnd.openriedsens.osm-address-extract+json'))
        await publish(conn, source, 'waste/address-inventory', inventory, digest, now)
        await publish(conn, source, 'map/layers/crossings', inventory['crossings'], digest, now)
        for layer, features in inventory['map_layers'].items():
            await publish(conn, source, f'map/layers/{layer}', features, digest, now)
        await conn.execute("INSERT INTO collection_attempts(source_id,payload_sha256,status) VALUES (%s,%s,'success')", (source['id'], digest))
    await conn.commit()
