import json
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from endpoints.collected import dataset_publication, movements
from fastapi import HTTPException
from starlette.requests import Request


def request(path='/'):
    return Request({'type':'http','method':'GET','path':path,'headers':[],'query_string':b''})


def pool_for(row=None,rows=None):
    pool=MagicMock(); conn=MagicMock(); cursor=MagicMock()
    pool.connection.return_value.__aenter__.return_value=conn
    conn.execute=AsyncMock(return_value=cursor)
    cursor.fetchone=AsyncMock(return_value=row); cursor.fetchall=AsyncMock(return_value=rows or [])
    return pool,conn


class CollectedEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from endpoints.infrastructure import EmfSitesSummary
        self.emf_mock = patch("endpoints.collected.get_emf_sites", new_callable=AsyncMock)
        self.emf = self.emf_mock.start()
        self.emf.return_value = EmfSitesSummary(total_sites=0, providers={}, sites=[])
        self.addCleanup(self.emf_mock.stop)
        self.publication_emf = patch('publication_service.get_emf_sites', self.emf)
        self.publication_emf.start()
        self.addCleanup(self.publication_emf.stop)
        from endpoints.collected import emf_cache
        emf_cache.clear()
        self.addCleanup(emf_cache.clear)
        self.gateways_mock = patch("endpoints.collected.lora_gateways", new_callable=AsyncMock, return_value=[])
        self.gateways = self.gateways_mock.start()
        self.addCleanup(self.gateways_mock.stop)

    async def test_emf_sites_reach_map_and_infrastructure(self):
        from endpoints.collected import map_layers
        from endpoints.infrastructure import EmfSiteResponse, EmfSitesSummary
        self.emf.return_value = EmfSitesSummary(total_sites=1, providers={}, sites=[
            EmfSiteResponse(id="bnetza:emf:123", name="Funkanlage", fid=123,
                            latitude=49.65, longitude=8.45, antenna_count=3)])
        pool, _ = pool_for(rows=[])
        body = json.loads((await map_layers(request(), pool)).body)
        feature = body["layers"]["emf"]["features"][0]
        self.assertEqual(feature["geometry"]["coordinates"], [8.45, 49.65])
        self.assertEqual(feature["properties"]["antenna_count"], 3)
        self.assertNotIn("emf", body["unavailable"])
        summary = json.loads((await dataset_publication("infrastructure/emf", request(), pool)).body)
        self.assertEqual(summary["total_sites"], 1)

    async def test_missing_and_expired_publications_are_unavailable(self):
        now=datetime.now(UTC)
        for row in [None,{'expires_at':now-timedelta(seconds=1),'source_updated_at':now-timedelta(days=1)}]:
            pool,_=pool_for(row)
            with self.assertRaises(HTTPException) as context:
                await dataset_publication('example',request(),pool)
            self.assertEqual(context.exception.status_code,503)

    async def test_empty_publication_is_authoritative_and_has_provenance(self):
        now=datetime.now(UTC)
        pool,_=pool_for({'data':[],'expires_at':now+timedelta(hours=1),'source_updated_at':now,'fetched_at':now,'source_id':'test'})
        response=await dataset_publication('example',request(),pool)
        self.assertEqual(json.loads(response.body),[])
        self.assertEqual(response.headers['x-data-source'],'test')
        self.assertIn('x-data-expires-at',response.headers)
        self.assertIn('s-maxage=',response.headers['cache-control'])

    async def test_position_read_prefers_observations_and_excludes_expired(self):
        pool,conn=pool_for(rows=[])
        response=await movements(request(),pool)
        self.assertEqual(json.loads(response.body),{'positions':[], 'crossings':[], 'crossings_available':False, 'ship_source': {'status':'unavailable','last_contact':None}, 'aircraft_source': {'status':'unavailable','last_contact':None}, 'ogn_source': {'status':'unavailable','last_contact':None}})
        sql=conn.execute.call_args_list[0].args[0]
        self.assertIn('valid_until > NOW()',sql)
        self.assertIn("basis='observed'",sql)

    async def test_map_includes_collected_traffic_without_provider_requests(self):
        from endpoints.collected import map_layers
        pool, conn = pool_for()
        publications = MagicMock()
        publications.fetchall = AsyncMock(return_value=[])
        traffic = MagicMock()
        traffic.fetchall = AsyncMock(return_value=[{
            'id': 'closure-1', 'road_name': 'A67', 'cause_type': 'closure',
            'coordinates': [[49.6, 8.4], [49.61, 8.41]],
        }])
        closures = MagicMock()
        closures.fetchall = AsyncMock(return_value=[])
        conn.execute.side_effect = [publications, traffic, closures, closures]
        response = await map_layers(request(), pool)
        data = json.loads(response.body)
        feature = data['layers']['traffic']['features'][0]
        self.assertEqual(feature['geometry']['coordinates'], [[8.4, 49.6], [8.41, 49.61]])
        self.assertEqual(data['layers']['closures']['features'], [feature])
        executed_queries = [call.args[0] for call in conn.execute.call_args_list]
        self.assertTrue(any("FROM traffic_events" in q for q in executed_queries))
        self.assertIn('crossings', data['unavailable'])

    async def test_gateway_in_lorsch_is_published_independently_of_heatmap(self):
        from endpoints.collected import map_layers
        pool, conn = pool_for()
        publications, traffic, closures = [MagicMock() for _ in range(3)]
        for cursor in [publications, traffic, closures]:
            cursor.fetchall = AsyncMock(return_value=[])
        self.gateways.return_value = [
            {'id': 'lora:gateway:lorsch', 'name': 'Gateway Lorsch',
             'metadata': {'gateway_id': 'lorsch', 'antenna_placement': 'OUTDOOR'},
             'latitude': 49.653, 'longitude': 8.568, 'online_status': 1},
            {'id': 'lora:gateway:offline', 'name': 'Offline', 'metadata': {},
             'latitude': 49.653, 'longitude': 8.568, 'online_status': 0},
            {'id': 'lora:gateway:unknown', 'name': 'Unknown', 'metadata': {},
             'latitude': 49.653, 'longitude': 8.568, 'online_status': None},
            {'id': 'lora:gateway:invalid', 'name': 'Invalid', 'metadata': {},
             'latitude': float('nan'), 'longitude': 8.568, 'online_status': 1},
        ]
        conn.execute.side_effect = [publications, traffic, closures, closures]
        body = json.loads((await map_layers(request(), pool)).body)
        features = body['layers']['lora']['features']
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]['geometry']['coordinates'], [8.568, 49.653])
        self.assertEqual(features[0]['properties']['online_status'], 'Online')
        self.assertNotIn('lora', body['unavailable'])

    async def test_tile_layer_metadata_marks_broadband_available(self):
        from endpoints.collected import map_layers
        pool, conn = pool_for()
        publications, traffic, closures = [MagicMock() for _ in range(3)]
        expires = datetime.now(UTC) + timedelta(days=30)
        meta = {'attribution': '© BNetzA. Datenstand: 06.2026.', 'layer': 'broadband', 'min_zoom': 13}
        plans = {'type': 'FeatureCollection', 'metadata': {'missing_municipalities': ['Bürstadt']}, 'features': []}
        publications.fetchall = AsyncMock(return_value=[
            {'dataset': 'map/tiles/broadband', 'expires_at': expires, 'data': meta},
            {'dataset': 'map/tiles/unknown', 'expires_at': expires, 'data': {}},
            {'dataset': 'map/layers/devplans', 'expires_at': expires, 'data': plans},
        ])
        for cursor in [traffic, closures]:
            cursor.fetchall = AsyncMock(return_value=[])
        conn.execute.side_effect = [publications, traffic, closures, closures]
        body = json.loads((await map_layers(request(), pool)).body)
        self.assertEqual(body['tile_layers'], {'broadband': meta})
        self.assertNotIn('broadband', body['layers'])
        self.assertNotIn('broadband', body['unavailable'])
        self.assertEqual(body['layers']['devplans']['metadata']['missing_municipalities'], ['Bürstadt'])
        self.assertNotIn('devplans', body['unavailable'])
        self.assertIn("map/tiles/", conn.execute.call_args_list[0].args[0])

    async def test_broadband_tiles_are_served_only_from_collected_tiles(self):
        from endpoints.collected import tile
        pool, _ = pool_for(row=None)
        with self.assertRaises(HTTPException) as missing:
            await tile('broadband', 14, 8573, 5612, request(), pool)
        self.assertEqual(missing.exception.status_code, 404)
        self.assertEqual(missing.exception.detail, 'Tile not collected')
        with self.assertRaises(HTTPException) as unknown:
            await tile('anything', 14, 8573, 5612, request(), pool)
        self.assertEqual(unknown.exception.detail, 'Not Found')

    async def test_no_online_gateways_does_not_restore_historical_dataset(self):
        from endpoints.collected import map_layers
        pool, conn = pool_for()
        publications, traffic, closures = [MagicMock() for _ in range(3)]
        publications.fetchall = AsyncMock(return_value=[{
            'dataset': 'map/layers/lora',
            'expires_at': datetime.now(UTC) + timedelta(hours=1),
            'data': {'type': 'FeatureCollection', 'features': [{'id': 'historical'}]},
        }])
        self.gateways.return_value = [{
            'id': 'lora:gateway:offline', 'name': 'Offline', 'metadata': {},
            'latitude': 49.653, 'longitude': 8.568, 'online_status': 0,
        }]
        for cursor in [traffic, closures]:
            cursor.fetchall = AsyncMock(return_value=[])
        conn.execute.side_effect = [publications, traffic, closures, closures]
        body = json.loads((await map_layers(request(), pool)).body)
        self.assertNotIn('lora', body['layers'])
        self.assertIn('lora', body['unavailable'])

    async def test_stream_delivers_vehicle_and_barrier_snapshots_from_shared_reader(self):
        from endpoints.collected import movement_stream
        stream_request = MagicMock()
        stream_request.is_disconnected = AsyncMock(side_effect=[False, False, False, True])
        batches = [{'positions':[{'id':'train', 'valid_until':'2099-01-01T00:00:00+00:00'}], 'crossings':[{'status':'closed'}]},
                   {'positions':[{'id':'train', 'valid_until':'2099-01-01T00:00:00+00:00'}], 'crossings':[{'status':'open'}]}]
        with patch('endpoints.collected.mobility_snapshot', new_callable=AsyncMock) as reader, \
             patch('endpoints.collected.asyncio.sleep', new_callable=AsyncMock) as sleep, \
             patch('endpoints.collected.monotonic', side_effect=[0,0,1,10,10]):
            reader.side_effect = batches
            response = await movement_stream(stream_request, MagicMock())
            events = [event async for event in response.body_iterator]
        self.assertEqual([json.loads(event[6:]) for event in events], [batches[0], batches[0], batches[1]])
        self.assertEqual(reader.await_count, 2)
        self.assertEqual(sleep.await_count, 3)
        sleep.assert_awaited_with(1)
        self.assertEqual(response.headers['x-accel-buffering'],'no')
        self.assertEqual(response.headers['cache-control'],'no-store')

    async def test_mobility_telemetry_never_generates_data_for_missing_core(self):
        from endpoints.collected import movement_telemetry
        pool,_ = pool_for({'ready':False})
        with self.assertRaises(HTTPException) as context:
            await movement_telemetry('crossing:gate',request(),pool)
        self.assertEqual(context.exception.status_code,503)
        with self.assertRaises(HTTPException) as context:
            await movement_telemetry('other:gate',request(),pool)
        self.assertEqual(context.exception.status_code,400)


class LoraGatewayReadTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        from endpoints import collected
        self.collected = collected
        collected.gateway_cache.clear()
        self.addCleanup(collected.gateway_cache.clear)

    def connection(self, heads, rows=None, error=None):
        conn, cur = MagicMock(), MagicMock()
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock(return_value=False)
        conn.cursor.return_value.__aenter__ = AsyncMock(return_value=cur)
        conn.cursor.return_value.__aexit__ = AsyncMock(return_value=False)
        cur.execute = AsyncMock()
        cur.fetchone = AsyncMock(return_value={'ready': heads})
        cur.fetchall = AsyncMock(side_effect=error, return_value=rows or [])
        self.cur = cur
        return conn

    async def test_core_storage_looks_up_heads_instead_of_joining_all_readings(self):
        conn = self.connection(True, [{'id': 'gw'}])
        self.assertEqual(await self.collected.lora_gateways(conn), [{'id': 'gw'}])
        sql = self.cur.execute.call_args_list[1].args[0]
        self.assertIn('JOIN measurement_heads h', sql)
        self.assertIn('CROSS JOIN LATERAL', sql)
        self.assertNotIn('latest_readings', sql)

    async def test_legacy_storage_reads_latest_table(self):
        await self.collected.lora_gateways(self.connection(False, []))
        self.assertIn('JOIN latest_readings lr', self.cur.execute.call_args_list[1].args[0])

    async def test_recent_result_is_reused_without_database_reads(self):
        await self.collected.lora_gateways(self.connection(True, [{'id': 'gw'}]))
        conn = MagicMock()
        self.assertEqual(await self.collected.lora_gateways(conn), [{'id': 'gw'}])
        conn.cursor.assert_not_called()

    async def test_failed_read_keeps_recent_rows_and_expires_old_ones(self):
        import psycopg
        cache = self.collected.gateway_cache
        await self.collected.lora_gateways(self.connection(True, [{'id': 'gw'}]))
        with patch('endpoints.collected.monotonic', return_value=cache.at + 600):
            rows = await self.collected.lora_gateways(self.connection(True, error=psycopg.errors.DiskFull()))
        self.assertEqual(rows, [{'id': 'gw'}])
        with patch('endpoints.collected.monotonic', return_value=cache.at + 1000):
            rows = await self.collected.lora_gateways(self.connection(True, error=psycopg.errors.DiskFull()))
        self.assertEqual(rows, [])

    async def test_failed_emf_read_keeps_other_map_layers(self):
        import psycopg
        from endpoints.collected import emf_cache, map_emf_sites
        emf_cache.clear()
        self.addCleanup(emf_cache.clear)
        with patch('endpoints.collected.get_emf_sites', new_callable=AsyncMock,
                   side_effect=psycopg.errors.DiskFull()):
            summary = await map_emf_sites(MagicMock())
        self.assertEqual(summary.sites, [])
