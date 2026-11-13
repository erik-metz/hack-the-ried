"""Slow regional reference data. Numeric values have one canonical home.

The catalogue is discovery metadata, never a substitute for a licensed export.
A complete snapshot is published atomically; unchanged checks add no readings.
"""
import asyncio
import hashlib
import io
import json
import math
import os
import re
import tempfile
import zipfile
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from psycopg.types.json import Jsonb

BBOX = [8.35, 49.55, 8.58, 49.76]  # existing context map coverage, lon/lat
MUNICIPALITIES = {'06431003', '06431005', '06431010', '06431013'}
COUNTIES = {'06431', '06432', '06433'}
MAX_BODY = 24 * 1024 * 1024
EXISTING = {
    'bodenrichtwerte': 'Direkter HVBG/BORIS-Import; Kreismedian ist eine zusätzliche Aggregation.',
    'hochwasser': 'Bestehende Hochwasserszenarien werden durch den VPS-Collector übernommen.',
    'schutzgebiete': 'Bestehende Schutzgebiete werden durch den VPS-Collector übernommen.',
    'grundwasser': 'HLNUG-Messstellen sind vorhanden; mittlerer Flurabstand ist eine andere Größe.',
    'luftqualitaet': 'Direkter UBA-Messwertcollector vorhanden.',
    'breitband': 'Direkter BNetzA-Import vorhanden.',
    'haltestellen': 'GTFS-Anbindung vorhanden.',
    'fernverkehr': 'GTFS-Bahn-Anbindung vorhanden.',
    'autobahn': 'Autobahn-Inventar vorhanden.',
    'nahversorgung': 'OSM-Anbindung vorhanden; Objektkennungen abgleichen.',
    'schulen': 'OSM-/Statistik-Anbindung vorhanden; örtliche Vollständigkeit offen.',
    'hitze': 'DWD-Tropennächte ergänzen ECOSTRESS; ECOSTRESS-Oberflächentemperatur ist keine Tropennachtzahl.',
}
UNAVAILABLE = {'fnp', 'bauleitplanung_raster', 'satzungen', 'fluglaerm', 'altlasten',
               'altbergbau', 'bergbau_rechte', 'luftbild_frueher'}


def contract_hash(source):
    return hashlib.sha256(('v2:' + json.dumps(source,sort_keys=True,ensure_ascii=False)).encode()).hexdigest()


def stamp(value):
    result = datetime.fromisoformat(str(value))
    return result.replace(tzinfo=UTC) if result.tzinfo is None else result


def finite(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Invalid reference number')
    return value


def validate_geometry(g):
    if not isinstance(g, dict) or g.get('type') not in {'Point', 'Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'}:
        raise ValueError('Unsupported reference geometry')
    count = 0
    def walk(v):
        nonlocal count
        if not isinstance(v, list) or not v:
            raise ValueError('Empty coordinates')
        if isinstance(v[0], (int, float)):
            if len(v) < 2 or abs(finite(v[0])) > 180 or abs(finite(v[1])) > 90:
                raise ValueError('Invalid WGS84 coordinates')
            count += 1
            if count > 200000:
                raise ValueError('Geometry limit exceeded')
        else:
            for c in v:
                walk(c)
    walk(g.get('coordinates'))


def catalogue_records(body):
    layers = body.get('layers')
    if not isinstance(layers, list) or not 10 <= len(layers) <= 200:
        raise ValueError('Incomplete catalogue')
    seen, records = set(), []
    for layer in layers:
        key = layer.get('id')
        if not isinstance(key, str) or not key or key in seen:
            raise ValueError('Duplicate/missing catalogue ID')
        seen.add(key)
        records.append({'id': key, 'name': layer['name'], 'geometry': None,
                        'properties': {**layer, 'overlap': EXISTING.get(key),
                                       'integration': 'authentication_required' if key == 'bodenbewegung' else 'existing' if key in EXISTING else 'no_hessen_coverage' if key in UNAVAILABLE else 'export_required'},
                        'values': []})
    return records


def scalar_records(body, kind):
    expected = 'grundsteuer-hebesaetze' if kind == 'tax' else 'bodenrichtwerte-landkreise'
    if body.get('dataset') != expected or not isinstance(body.get('rows'), list):
        raise ValueError('Unexpected Grundradar export')
    selected, seen = [], set()
    wanted = MUNICIPALITIES if kind == 'tax' else COUNTIES
    for row in body['rows']:
        code = row.get('code')
        if code not in wanted:
            continue
        if code in seen:
            raise ValueError('Duplicate regional export row')
        seen.add(code)
        if kind == 'tax':
            year = int(row['data_year'])
            if not 2000 <= year <= datetime.now(UTC).year + 1:
                raise ValueError('Invalid tax year')
            time = f'{year}-01-01'
            values = [('property_tax_b_rate', '%', row['hebesatz_b_percent'])]
            props = {k: v for k, v in row.items() if k != 'hebesatz_b_percent'}
        else:
            time = row.get('stichtag')
            values = [('land_value_county_median', 'EUR/m²', row.get('median_eur_per_m2')),
                      ('land_value_zone_count', 'zones', row.get('zone_count'))]
            props = {k: v for k, v in row.items() if k not in {'median_eur_per_m2', 'zone_count'}}
        if not time:
            raise ValueError('Regional source date missing')
        date = stamp(time)
        measurements = []
        for metric, unit, value in values:
            if value is not None and finite(value) < 0:
                raise ValueError('Negative reference value')
            measurements.append({'metric': metric, 'unit': unit, 'value': value,
                                 'time': date, 'basis': 'reported', 'semantics': 'reference',
                                 'dimensions': {'land_use': row['basis']} if kind != 'tax' else {},
                                 'start': date if kind == 'tax' else None,
                                 'end': datetime(year + 1, 1, 1, tzinfo=UTC) if kind == 'tax' else None})
        selected.append({'id': code, 'name': row['name'], 'geometry': None,
                         'properties': props, 'values': measurements})
    if seen != wanted:
        raise ValueError('Incomplete regional export')
    return selected


async def fetch_bytes(conn, client, source, url, headers=None, limit=MAX_BODY):
    """Streaming size bound, fingerprint receipts; response bodies are not retained."""
    async with client.stream('GET', url, headers=headers or {}, timeout=90) as response:
        if response.status_code == 304:
            return None, dict(response.headers)
        response.raise_for_status()
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > limit:
                raise ValueError('Reference response exceeds byte limit')
        raw = bytes(body)
        digest = hashlib.sha256(raw).hexdigest()
        await conn.execute('INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',
                           (digest, len(raw), response.headers.get('content-type', 'application/octet-stream')))
        await conn.execute("INSERT INTO collection_attempts(source_id,http_status,payload_sha256,status) VALUES(%s,200,%s,'received')", (source['id'], digest))
        await conn.commit()
        return raw, dict(response.headers)


async def arcgis_records(conn, client, source):
    records, parts = [], []
    for layer in source['layers']:
        oid = layer.get('object_id', 'OBJECTID')
        if source.get('discover_schema'):
            raw,_ = await fetch_bytes(conn,client,source,source['url'].rstrip('/')+'/'+str(layer['id'])+'?f=json')
            parts.append(hashlib.sha256(raw).hexdigest())
            meta=json.loads(raw)
            fields=meta.get('fields')
            if meta.get('error') or not isinstance(fields,list):
                raise ValueError('Reference layer schema unavailable')
            oid=next((f['name'] for f in fields if f.get('type')=='esriFieldTypeOID'),None)
            if not oid:raise ValueError('Reference layer has no stable object ID')
            if layer['fields']!='*' and not set(layer['fields'].split(',')).issubset({f['name'] for f in fields}):
                raise ValueError('Reference source fields changed')
        seen = set()
        for offset in range(0, 10000, 500):
            query = {'f': 'geojson', 'where': '1=1', 'geometry': ','.join(map(str, source.get('bbox', BBOX))),
                     'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'outSR': 4326,
                     'spatialRel': 'esriSpatialRelIntersects', 'outFields': layer['fields'],
                     'orderByFields': oid, 'returnGeometry': 'true',
                     'geometryPrecision': 5, 'maxAllowableOffset': 0.0002,
                     'resultOffset': offset, 'resultRecordCount': 500}
            url = source['url'].rstrip('/') + '/' + str(layer['id']) + '/query?' + urlencode(query)
            raw, _ = await fetch_bytes(conn, client, source, url)
            parts.append(hashlib.sha256(raw).hexdigest())
            data = json.loads(raw)
            if data.get('error') or data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
                raise ValueError('Invalid ArcGIS reference response')
            features = data['features']
            if len(features) > 500:
                raise ValueError('Provider ignored page limit')
            for f in features:
                props = dict(f.get('properties') or {})
                key = props.get(oid)
                if key is None or str(key) in seen:
                    raise ValueError('Duplicate/missing feature identity')
                seen.add(str(key))
                if 'geometry' not in f:
                    raise ValueError('Missing feature geometry field')
                if f['geometry'] is not None:
                    validate_geometry(f['geometry'])
                else:
                    props['geometry_status']='source_missing'
                props['source_layer'] = layer['id']
                props['source_category'] = layer['name']
                if source['layer'] == 'floodrisk':
                    props['scenario'] = layer.get('scenario',layer['id'])
                values = []
                for field, spec in source.get('metrics', {}).items():
                    value = props.pop(field, None)
                    if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool)):
                        raise ValueError('Reference field changed type')
                    if value is not None and (not math.isfinite(value) or value < 0):
                        value = None
                    values.append({'metric': field, 'unit': spec, 'value': value,
                                   'time': stamp(source['reference_date']), 'basis': 'reported',
                                   'semantics': 'reference', 'dimensions': {}})
                name = next((str(props[k]) for k in ['WSG_KURZNAME', 'NAME', 'NAME_STN', 'POLY_NAME', 'GITTER_ID_1km', 'LEG_TEXT', 'klartext_kurz', 'LEGENDE', 'GENESE', 'PETROGRAPHIE'] if props.get(k)), str(key))
                records.append({'id': f"{layer['id']}:{key}", 'name': name, 'geometry': f['geometry'], 'properties': props, 'values': values})
            more = data.get('exceededTransferLimit') or data.get('properties', {}).get('exceededTransferLimit')
            if more and not features:
                raise ValueError('Empty truncated page')
            if not more and len(features) < 500:
                break
        else:
            raise ValueError('Reference pagination limit exceeded')
    return records, hashlib.sha256(''.join(parts).encode()).hexdigest()


async def wfs_records(conn,client,source):
    records,seen,parts=[],set(),[]
    expected=None
    for offset in range(0,10000,500):
        query={'service':'WFS','version':'2.0.0','request':'GetFeature','typeNames':source['type_name'],
               'srsName':'urn:ogc:def:crs:OGC:1.3:CRS84','bbox':','.join(map(str,source.get('bbox',BBOX)))+',urn:ogc:def:crs:OGC:1.3:CRS84',
               'count':500,'startIndex':offset,'sortBy':'gid','outputFormat':'application/json'}
        raw,_=await fetch_bytes(conn,client,source,source['url']+'?'+urlencode(query))
        parts.append(hashlib.sha256(raw).hexdigest())
        data=json.loads(raw)
        if data.get('type')!='FeatureCollection' or not isinstance(data.get('features'),list):
            raise ValueError('Invalid WFS response')
        matched=int(data['numberMatched'])
        if expected is not None and expected!=matched:raise ValueError('WFS changed while paging')
        expected=matched
        features=data['features']
        if data.get('numberReturned')!=len(features) or len(features)>500:raise ValueError('WFS count mismatch')
        for feature in features:
            props=dict(feature['properties'])
            key=str(props['gid'])
            if key in seen:raise ValueError('Duplicate WFS identifier')
            seen.add(key);validate_geometry(feature.get('geometry'))
            value=props.pop('grp_pb_')
            if value is not None and finite(value)<0:raise ValueError('Invalid radon potential')
            records.append({'id':key,'name':'Geogenes Radonpotenzial '+key,'geometry':feature['geometry'],
                'properties':props,'values':[{'metric':'geogenic_radon_potential','unit':'1','value':value,
                    'time':stamp(source['reference_date']),'basis':'model','semantics':'reference',
                    'dimensions':{'model':'BfS geogenic radon potential'},
                    'start':stamp('1992-01-01'),'end':stamp('2021-01-01')}]})
        if len(records)==matched:break
        if not features:raise ValueError('Truncated WFS publication')
    else:raise ValueError('WFS limit exceeded')
    return records,hashlib.sha256(''.join(parts).encode()).hexdigest()


def kostra_records(raw, source):
    """DWD native 5 km grid (EPSG:3035), Hn, D=60 min, T=100 years."""
    import numpy as np
    import rasterio
    from rasterio.io import MemoryFile
    from rasterio.warp import transform_bounds, transform_geom
    from rasterio.windows import from_bounds
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        name = 'Hn_KOSTRA-DWD-2020_D00060_T100.asc'
        info = archive.getinfo(name)
        if info.file_size > 8 * 1024 * 1024:
            raise ValueError('Oversized KOSTRA grid')
        with MemoryFile(archive.read(name)) as mem, mem.open() as grid:
            if grid.width != 300 or grid.height != 300 or grid.res != (5000, 5000):
                raise ValueError('KOSTRA grid contract changed')
            bounds = transform_bounds('EPSG:4326', 'EPSG:3035', *source.get('bbox', BBOX))
            w = from_bounds(*bounds, grid.transform).round_offsets().round_lengths()
            w = rasterio.windows.Window(max(0, int(w.col_off)-1), max(0, int(w.row_off)-1), int(w.width)+3, int(w.height)+3)
            data = grid.read(1, window=w, masked=True)
            transform = grid.window_transform(w)
            mask = np.ma.getmaskarray(data)
            records = []
            for row in range(data.shape[0]):
                for col in range(data.shape[1]):
                    if bool(mask[row, col]):
                        continue
                    x, y = transform * (col, row)
                    geom = {'type': 'Polygon', 'coordinates': [[[x,y],[x+5000,y],[x+5000,y-5000],[x,y-5000],[x,y]]]}
                    geom = transform_geom('EPSG:3035', 'EPSG:4326', geom, precision=6)
                    key = f'{int(w.row_off)+row}:{int(w.col_off)+col}'
                    records.append({'id': key, 'name': 'KOSTRA-Raster ' + key, 'geometry': geom,
                                    'properties': {'duration_minutes': 60, 'return_period_years': 100, 'resolution_m': 5000},
                                    'values': [{'metric': 'rainfall_depth', 'unit': 'mm', 'value': finite(float(data[row,col])),
                                                'time': stamp('2020-12-31'), 'basis': 'model', 'semantics': 'reference',
                                                'dimensions': {'duration_minutes': 60, 'return_period_years': 100},
                                                'start': stamp('1951-01-01'), 'end': stamp('2021-01-01')}]})
    if not records:
        raise ValueError('No regional KOSTRA cells')
    return records


def heat_records(raw, source):
    import numpy as np
    import rasterio
    from rasterio.warp import transform_bounds, transform_geom
    from rasterio.windows import from_bounds
    # NetCDF drivers require a real temporary file; MemoryFile uses a GDAL path.
    with tempfile.NamedTemporaryFile(suffix='.nc') as f:
        f.write(raw);f.flush()
        with rasterio.open(f.name) as grid:
            tags=grid.tags()
            if tags.get('deltaTN#standard_name') != 'delta_tropical_night' or grid.res != (1000,1000):
                raise ValueError('UHI parameter or grid changed')
            bounds=transform_bounds('EPSG:4326',grid.crs,*source.get('bbox',BBOX))
            w=from_bounds(*bounds,grid.transform).round_offsets().round_lengths()
            w=rasterio.windows.Window(int(w.col_off)-1,int(w.row_off)-1,int(w.width)+3,int(w.height)+3)
            data=grid.read(1,window=w,masked=True)
            mask=np.ma.getmaskarray(data)
            transform=grid.window_transform(w)
            records=[]
            for row in range(data.shape[0]):
                for col in range(data.shape[1]):
                    if mask[row,col]:continue
                    value=finite(float(data[row,col]))
                    if value<0:raise ValueError('Negative delta tropical night count')
                    x,y=transform*(col,row)
                    g={'type':'Polygon','coordinates':[[[x,y],[x+1000,y],[x+1000,y-1000],[x,y-1000],[x,y]]]}
                    key=f'{int(w.row_off)+row}:{int(w.col_off)+col}'
                    records.append({'id':key,'name':'Zusätzliche Tropennächte '+key,
                        'geometry':transform_geom(grid.crs,'EPSG:4326',g,precision=6),
                        'properties':{'landcover_model':'CLC2018','resolution_m':1000},
                        'values':[{'metric':'additional_tropical_nights','unit':'nights/year','value':value,
                            'time':stamp(source['reference_date']),'basis':'model','semantics':'period_total',
                            'dimensions':{'model':'UHI-MAP v7','landcover':'CLC2018'},
                            'start':stamp(source['reference_date']),
                            'end':stamp(str(stamp(source['reference_date']).year+1)+'-01-01')}]})
    if not records:raise ValueError('No regional UHI values')
    return records


def groundwater_records(path, source):
    """MoRE-DE export in dm; area means on an explicit 1-km display grid."""
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import from_origin
    from rasterio.warp import transform_bounds, transform_geom
    from rasterio.windows import from_bounds
    with zipfile.ZipFile(path) as archive:
        tiffs = [n for n in archive.namelist() if n.lower().endswith('.tif')]
        readmes = [n for n in archive.namelist() if n.startswith('readme')]
        if len(tiffs) != 1 or len(readmes) != 1 or archive.getinfo(readmes[0]).file_size > 100000:
            raise ValueError('Groundwater archive contract changed')
        readme = archive.read(readmes[0]).decode('utf-8')
        if 'Mittlerer Grundwasserflurabstand (dm)' not in readme:
            raise ValueError('Groundwater unit/parameter changed')
        export_date = stamp(readme.splitlines()[0])
        left,bottom,right,top = transform_bounds('EPSG:4326','EPSG:25833',*source.get('bbox',BBOX))
        left, bottom = math.floor(left/1000)*1000, math.floor(bottom/1000)*1000
        right, top = math.ceil(right/1000)*1000, math.ceil(top/1000)*1000
        transform = from_origin(left,top,1000,1000)
        width,height = int((right-left)/1000),int((top-bottom)/1000)
        with rasterio.open('/vsizip/' + path + '/' + tiffs[0]) as ds:
            if ds.crs.to_epsg() != 25833 or ds.count != 1:
                raise ValueError('Groundwater CRS changed')
            window=from_bounds(left,bottom,right,top,ds.transform)
            data=ds.read(1,window=window,out_shape=(height,width),boundless=True,masked=True,resampling=Resampling.average)
        records=[]
        mask=np.ma.getmaskarray(data)
        for row in range(height):
            for col in range(width):
                if bool(mask[row,col]):
                    continue
                value=finite(float(data[row,col]))/10
                if value<0:
                    continue
                x,y=transform*(col,row)
                g={'type':'Polygon','coordinates':[[[x,y],[x+1000,y],[x+1000,y-1000],[x,y-1000],[x,y]]]}
                key=f'{int(x)}:{int(y)}'
                records.append({'id':key,'name':'Mittlerer Grundwasserflurabstand '+key,
                    'geometry':transform_geom('EPSG:25833','EPSG:4326',g,precision=6),
                    'properties':{'resolution_m':1000,'export_date':export_date.isoformat()},
                    'values':[{'metric':'groundwater_mean_depth','unit':'m','value':value,
                        'time':export_date,'basis':'model','semantics':'reference',
                        'dimensions':{'aggregation':'area_mean','display_grid_m':1000}}]})
    if not records:
        raise ValueError('No regional groundwater values')
    return records


async def groundwater_snapshot(conn,client,source,state):
    headers={}
    if state.get('etag'):
        headers['If-None-Match']=state['etag']
    digest=hashlib.sha256()
    with tempfile.NamedTemporaryFile(suffix='.zip') as f:
        async with client.stream('GET',source['url'],headers=headers,timeout=180) as response:
            if response.status_code==304:
                return None,None,dict(response.headers)
            response.raise_for_status()
            size=0
            async for part in response.aiter_bytes():
                size+=len(part)
                if size>350*1024*1024:
                    raise ValueError('Groundwater archive size limit')
                digest.update(part);f.write(part)
            response_headers=dict(response.headers)
        f.flush()
        records=groundwater_records(f.name,source)
    hexdigest=digest.hexdigest()
    await conn.execute('INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',
                       (hexdigest,size,'application/zip'))
    await conn.execute("INSERT INTO collection_attempts(source_id,http_status,payload_sha256,status) VALUES(%s,200,%s,'received')",(source['id'],hexdigest))
    await conn.commit()
    return records,hexdigest,response_headers


async def store_records(conn, source, records, digest, headers=None):
    """One transaction publishes metadata and readings; current-set keys have no values."""
    if len(records) > 20000 or len({r['id'] for r in records}) != len(records):
        raise ValueError('Duplicate/oversized reference snapshot')
    now = datetime.now(UTC)
    async with conn.transaction():
        await conn.execute("SET LOCAL lock_timeout='10s'")
        await conn.execute("SET LOCAL statement_timeout='90s'")
        for record in records:
            entity = 'reference:' + source['layer'] + ':' + record['id']
            metadata = {'reference_layer': source['layer'], 'reference_source': source['id'],
                        'geometry': record['geometry'], 'properties': record['properties']}
            await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata) VALUES(%s,%s,'reference_feature',%s)
                ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,metadata=EXCLUDED.metadata,updated_at=NOW()
                WHERE (entities.name,entities.metadata) IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.metadata)""",
                               (entity, record['name'], Jsonb(metadata)))
            for value in record['values']:
                if value.get('value') is not None:
                    finite(value['value'])
                await conn.execute("SELECT write_measurement(%s,%s,%s,%s,%s,%s,%s,%s::numeric,%s,'{}',%s,%s,%s,%s)",
                                   (entity, value['metric'], value['unit'], source['id'], value['basis'], Jsonb(value['dimensions']),
                                    value['time'], value['value'], now, 'valid' if value['value'] is not None else 'missing',
                                    value.get('start'), value.get('end'), value['semantics']))
        state = {k: source[k] for k in ['layer', 'url', 'title', 'attribution', 'license', 'note', 'interval_seconds']}
        state.update({'checked_at': now.isoformat(), 'content_sha256': digest,
                      'reference_date': source.get('reference_date'), 'count': len(records),
                      'members': ['reference:' + source['layer'] + ':' + r['id'] for r in records],
                      'contract_sha256': contract_hash(source), 'contract_version': 2, 'etag': (headers or {}).get('etag'), 'last_modified': (headers or {}).get('last-modified')})
        await conn.execute("""INSERT INTO entities(id,name,entity_type,metadata) VALUES(%s,%s,'reference_source',%s)
            ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,metadata=EXCLUDED.metadata,updated_at=NOW()""",
                           ('reference-source:' + source['layer'], source['title'], Jsonb(state)))
        await conn.execute("UPDATE collection_attempts SET status='success' WHERE source_id=%s AND status='received'", (source['id'],))
    await conn.commit()


async def import_reference(conn, client, source):
    async with asyncio.timeout(900):
        await _import_reference(conn,client,source)


async def _import_reference(conn, client, source):
    await conn.execute('SET max_parallel_workers_per_gather=0')
    await conn.commit()
    previous = await (await conn.execute('SELECT metadata FROM entities WHERE id=%s', ('reference-source:' + source['layer'],))).fetchone()
    state = previous[0] if previous else {}
    now = datetime.now(UTC)
    await conn.commit()
    if state.get('checked_at') and (source.get('release_index') or state.get('contract_sha256') == contract_hash(source)) and not os.getenv('REFERENCE_FORCE') and now - stamp(state['checked_at']) < timedelta(seconds=source['interval_seconds']):
        return
    if source.get('release_index'):
        raw,_=await fetch_bytes(conn,client,source,source['release_index'])
        filenames=re.findall(r'href="(uhi-map_v7_clc2018_tropical-nights_diff_p1y_(\d{4})-01-01.nc)"',raw.decode())
        releases=[(int(year),name) for name,year in filenames if 1995<=int(year)<now.year]
        if not releases:raise ValueError('No complete UHI annual release')
        year,name=max(releases)
        source={**source,'url':source['release_index']+name,'reference_date':f'{year}-01-01',
                'attribution':f'DWD · UHI-MAP v7 · CLC2018 · Jahr {year}'}
    same_contract = state.get('contract_sha256') == contract_hash(source)
    kind = source['reference_kind']
    if kind == 'groundwater':
        records,digest,headers = await groundwater_snapshot(conn,client,source,state if same_contract else {})
        if records is None:
            if not state.get('members'):
                raise ValueError('304 without accepted groundwater snapshot')
            state['checked_at']=now.isoformat()
            await conn.execute('UPDATE entities SET metadata=%s,updated_at=NOW() WHERE id=%s',(Jsonb(state),'reference-source:'+source['layer']))
            await conn.execute("INSERT INTO collection_attempts(source_id,http_status,status) VALUES(%s,304,'success')",(source['id'],))
            await conn.commit()
            return
    elif kind == 'wfs':
        records,digest=await wfs_records(conn,client,source)
        headers={}
    elif kind == 'arcgis':
        records, digest = await arcgis_records(conn, client, source)
        headers = {}
    else:
        conditional = {}
        if state.get('etag') and same_contract:
            conditional['If-None-Match'] = state['etag']
        elif state.get('last_modified') and same_contract:
            conditional['If-Modified-Since'] = state['last_modified']
        raw, headers = await fetch_bytes(conn, client, source, source['url'], conditional)
        if raw is None:
            if not state.get('members'):
                raise ValueError('304 without accepted snapshot')
            state['checked_at'] = now.isoformat()
            await conn.execute('UPDATE entities SET metadata=%s,updated_at=NOW() WHERE id=%s', (Jsonb(state), 'reference-source:' + source['layer']))
            await conn.execute("INSERT INTO collection_attempts(source_id,http_status,status) VALUES(%s,304,'success')", (source['id'],))
            await conn.commit()
            return
        digest = hashlib.sha256(raw).hexdigest()
        if digest == state.get('content_sha256') and same_contract:
            state['checked_at'] = now.isoformat()
            await conn.execute('UPDATE entities SET metadata=%s,updated_at=NOW() WHERE id=%s', (Jsonb(state), 'reference-source:' + source['layer']))
            await conn.execute("UPDATE collection_attempts SET status='success' WHERE source_id=%s AND status='received'", (source['id'],))
            await conn.commit()
            return
        records = heat_records(raw, source) if kind == 'heat' else kostra_records(raw, source) if kind == 'kostra' else catalogue_records(json.loads(raw)) if kind == 'catalogue' else scalar_records(json.loads(raw), kind)
    await store_records(conn, source, records, digest, headers)
