"""Reference publication semantics, atomic replay, pagination and missing values."""
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from db_support import DatabaseCase
from reference_data import (
    arcgis_records,
    import_reference,
    scalar_records,
    store_records,
    validate_geometry,
)

MANIFEST = json.loads((Path(__file__).parents[1] / 'sources.json').read_text())['sources']
TAX = next(s for s in MANIFEST if s['id'] == 'reference-tax')


def taxes():
    return {'dataset': 'grundsteuer-hebesaetze', 'rows': [
        {'code': code, 'name': code, 'data_year': 2025, 'source_date': '2025-06-30',
         'hebesatz_b_percent': 400, 'model': 'HE Flächen-Faktor'}
        for code in ['06431003', '06431005', '06431010', '06431013']]}


def test_year_is_reference_time_and_missing_is_not_zero():
    body = taxes()
    body['rows'][0]['hebesatz_b_percent'] = None
    records = scalar_records(body, 'tax')
    value = records[0]['values'][0]
    assert value['value'] is None
    assert value['time'] == datetime(2025,1,1,tzinfo=UTC)
    assert value['end'] == datetime(2026,1,1,tzinfo=UTC)
    assert 'hebesatz_b_percent' not in records[1]['properties']
    assert value['unit'] == '%'


def test_incomplete_duplicate_negative_and_invalid_geometry_rejected():
    body = taxes()
    body['rows'].pop()
    with pytest.raises(ValueError, match='Incomplete'):
        scalar_records(body, 'tax')
    body = taxes()
    body['rows'].append(body['rows'][0])
    with pytest.raises(ValueError, match='Duplicate'):
        scalar_records(body, 'tax')
    body = taxes()
    body['rows'][0]['hebesatz_b_percent'] = -1
    with pytest.raises(ValueError, match='Negative'):
        scalar_records(body, 'tax')
    for geometry in [None, {'type': 'Point', 'coordinates': [999,49]}, {'type': 'Polygon', 'coordinates': []}]:
        with pytest.raises(ValueError):
            validate_geometry(geometry)


class ReferenceDatabaseTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        migration = Path(__file__).parents[2] / 'api/v1/migrations/20260930_measurements.sql'
        await self.conn.execute(migration.read_text())

    async def test_replay_keeps_four_readings_and_original_dates(self):
        with patch.dict(os.environ, {'REFERENCE_FORCE': '1'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=taxes()))) as client:
                await import_reference(self.conn, client, TAX)
                await import_reference(self.conn, client, TAX)
        assert await self.scalar('SELECT count(*) FROM readings') == 4
        assert await self.scalar('SELECT count(*) FROM measurement_definitions') == 4
        assert await self.scalar("SELECT count(*) FROM readings WHERE observed_at='2025-01-01T00:00:00Z'") == 4
        assert await self.scalar("SELECT count(*) FROM collected_datasets") == 0
        assert await self.scalar("SELECT count(*) FROM entities WHERE entity_type='reference_source'") == 1

    async def test_partial_refresh_and_transaction_failure_preserve_current_set(self):
        records = scalar_records(taxes(),'tax')
        await store_records(self.conn,TAX,records,'first')
        original = await self.scalar("SELECT metadata FROM entities WHERE id='reference-source:tax'")
        records[-1]['values'][0]['value'] = float('nan')
        with self.assertRaises(ValueError):
            await store_records(self.conn,TAX,records,'bad')
        assert await self.scalar("SELECT metadata FROM entities WHERE id='reference-source:tax'") == original
        assert await self.scalar('SELECT count(*) FROM readings') == 4
        body = taxes(); body['rows'].pop()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r, body=body: httpx.Response(200,json=body))) as client:
            with patch.dict(os.environ, {'REFERENCE_FORCE':'1'}), self.assertRaisesRegex(ValueError,'Incomplete'):
                await import_reference(self.conn,client,TAX)
        assert await self.scalar("SELECT metadata FROM entities WHERE id='reference-source:tax'") == original

    async def test_conditional_304_confirms_without_inventing_a_measurement(self):
        records = scalar_records(taxes(),'tax')
        await store_records(self.conn,TAX,records,'first',{'etag':'"v1"'})
        def respond(request):
            assert request.headers['if-none-match'] == '"v1"'
            return httpx.Response(304)
        with patch.dict(os.environ, {'REFERENCE_FORCE':'1'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
                await import_reference(self.conn,client,TAX)
        assert await self.scalar('SELECT count(*) FROM readings') == 4
        assert await self.scalar("SELECT count(*) FROM collection_attempts WHERE http_status=304 AND status='success'") == 1

    async def test_repeated_arcgis_page_and_provider_error_fail_closed(self):
        source = {**TAX, 'layer':'test', 'url':'https://example.org/FeatureServer',
                  'layers':[{'id':0,'name':'Test','fields':'OBJECTID','object_id':'OBJECTID'}]}
        feature = {'type':'Feature','properties':{'OBJECTID':1},'geometry':{'type':'Point','coordinates':[8.4,49.6]}}
        for body in [{'error':{'code':500}}, {'type':'FeatureCollection','features':[feature],'exceededTransferLimit':True}]:
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r, body=body: httpx.Response(200,json=body))) as client:
                with self.assertRaises(ValueError):
                    await arcgis_records(self.conn,client,source)
        assert await self.scalar("SELECT count(*) FROM entities") == 0


def test_raster_units_nodata_and_native_grid(tmp_path):
    import io
    import zipfile

    import numpy as np
    import rasterio
    from rasterio.transform import from_origin
    from rasterio.warp import transform
    from reference_data import groundwater_records, kostra_records

    # Native DWD grid carries mm, with no-data cells outside the published domain.
    values = np.full((300,300), 42.5)
    lines = ['ncols 300','nrows 300','xllcorner 3600000','yllcorner 2300000','cellsize 5000','nodata_value -99.9']
    lines += [' '.join(str(x) for x in row) for row in values]
    raw = io.BytesIO()
    with zipfile.ZipFile(raw,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('Hn_KOSTRA-DWD-2020_D00060_T100.asc','\n'.join(lines))
    records=kostra_records(raw.getvalue(),{})
    assert records and all(r['values'][0]['value']==42.5 for r in records)
    assert records[0]['values'][0]['unit']=='mm'
    assert records[0]['values'][0]['start'].year==1951

    # The actual UBA export documents decimetres, never metres.
    x,y=transform('EPSG:4326','EPSG:25833',[8.46],[49.65])
    path=tmp_path/'ground.tif'
    with rasterio.open(path,'w',driver='GTiff',height=100,width=100,count=1,dtype='float32',
                       crs='EPSG:25833',transform=from_origin(x[0]-500,y[0]+500,10,10),nodata=-99999) as dst:
        dst.write(np.full((100,100),12,dtype='float32'),1)
    archive_path=tmp_path/'ground.zip'
    with zipfile.ZipFile(archive_path,'w') as archive:
        archive.write(path,'ground.tif')
        archive.writestr('readme_ground.txt','2025-07-04 06:30:13\nParameter: Mittlerer Grundwasserflurabstand (dm)')
    records=groundwater_records(str(archive_path),{})
    assert records and all(abs(r['values'][0]['value']-1.2)<0.001 for r in records)
    assert records[0]['values'][0]['time'].year==2025


class WFSReferenceTests(DatabaseCase):
    async def test_stable_provider_ids_and_matched_counts(self):
        from reference_data import wfs_records
        source={**TAX,'url':'https://example.org/wfs','type_name':'opendata:radonpotential','reference_date':'2020-12-31'}
        feature={'type':'Feature','id':'ephemeral','geometry':{'type':'Point','coordinates':[8.4,49.6]},'properties':{'gid':1,'grp_pb_':22.5}}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'type':'FeatureCollection','features':[feature],'numberMatched':1,'numberReturned':1}))) as client:
            records,_=await wfs_records(self.conn,client,source)
        assert records[0]['id']=='1' and records[0]['values'][0]['value']==22.5
        assert records[0]['values'][0]['unit']=='1'
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'type':'FeatureCollection','features':[feature],'numberMatched':2,'numberReturned':1}))) as client:
            with self.assertRaisesRegex(ValueError,'Duplicate'):
                await wfs_records(self.conn,client,source)
