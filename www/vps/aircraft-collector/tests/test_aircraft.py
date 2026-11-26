import unittest
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from collector import MAX_AGE, SOURCE, decode, persist, quota_delay, retry_delay
from db_support import DatabaseCase

NOW = datetime(2026, 10, 5, 12, tzinfo=UTC)


def snapshot(now=NOW, **fields):
    return {'now': now.timestamp()*1000, 'msg': 'No error', 'ac': [{
        'hex': '3c6488', 'type': 'adsb_icao', 'flight': 'DLH1WP  ', 'r': 'D-AIDH',
        't': 'A321', 'lat': 49.65, 'lon': 8.45, 'alt_baro': 10000, 'alt_geom': 10500,
        'gs': 250, 'track': 90, 'baro_rate': -1000, 'seen_pos': 2, **fields}]}


class DecodeTests(unittest.TestCase):
    def test_reported_emitter_category_is_preserved_without_model_guessing(self):
        self.assertEqual(decode(snapshot(category='A7'), NOW)[0]['metadata']['emitter_category'], 'A7')
        for category in [None, 'C1', 'B9', 1, '<script>']:
            self.assertNotIn('emitter_category', decode(snapshot(category=category), NOW)[0]['metadata'])
        self.assertNotIn('emitter_category', decode(snapshot(t='A321'), NOW)[0]['metadata'])
    def test_position_age_units_and_altitude_references(self):
        sample = decode(snapshot(), NOW)[0]
        self.assertEqual(sample['timestamp'], NOW-timedelta(seconds=2))
        self.assertEqual(sample['metadata']['speed_kmh'], 463)
        self.assertEqual(sample['metadata']['altitude_baro_m'], 3048)
        self.assertEqual(sample['metadata']['altitude_geom_m'], 3200.4)
        self.assertEqual(sample['metadata']['vertical_rate_mps'], -5.08)
        self.assertEqual(sample['metadata']['name'], 'DLH1WP')

    def test_invalid_ground_stale_anonymous_and_outside_reports(self):
        for fields in [{'hex': '~3c6488'}, {'hex': 'xyz'}, {'alt_baro': 'ground'},
                       {'lat': float('nan')}, {'lon': 9}, {'lat': 50}, {'seen_pos': 61},
                       {'seen_pos': None}, {'type': 'mode_s'}, {'alt_baro': None, 'alt_geom': None}]:
            self.assertEqual(decode(snapshot(**fields), NOW), [], fields)
        for now in [NOW-timedelta(seconds=61), NOW+timedelta(seconds=11)]:
            with self.assertRaises(ValueError):
                decode(snapshot(now), NOW)
        self.assertEqual(decode({'now': NOW.timestamp()*1000, 'ac': []}, NOW), [])
        with self.assertRaises(TypeError):
            decode({'now': NOW.timestamp()*1000}, NOW)

    def test_optional_values_and_mlat_are_not_invented(self):
        sample = decode(snapshot(type='mlat', track=None, gs=None, baro_rate=None), NOW)[0]
        self.assertEqual(sample['metadata']['geometry_basis'], 'multilateration')
        self.assertNotIn('speed_kmh', sample['metadata'])
        self.assertNotIn('course_deg', sample['metadata'])
        self.assertNotIn('vertical_rate_mps', sample['metadata'])

    def test_cached_snapshot_does_not_get_a_new_observation_time(self):
        self.assertEqual(decode(snapshot(), NOW)[0]['timestamp'],
                         decode(snapshot(), NOW+timedelta(seconds=30))[0]['timestamp'])
        self.assertEqual(decode(snapshot(), NOW+timedelta(seconds=59)), [])

    def test_retry_after_is_respected(self):
        from httpx import Response
        self.assertGreaterEqual(retry_delay(Response(429, headers={'Retry-After': '3600'}), 1, 15), 3600)
        self.assertGreaterEqual(retry_delay(None, 3, 15), 120)

    def test_exhausted_daily_quota_waits_for_reset(self):
        from httpx import Response
        headers = {'x-ratelimit-limit': '500, 500;w=86400', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '39786'}
        self.assertGreaterEqual(retry_delay(Response(429, headers=headers), 1, 15), 39786)
        self.assertEqual(quota_delay(Response(429, headers=headers), 15), 39786)

    def test_daily_quota_is_spread_until_reset(self):
        from httpx import Response
        spread = {'x-ratelimit-remaining': '499', 'x-ratelimit-reset': '86400'}
        self.assertAlmostEqual(quota_delay(Response(200, headers=spread), 15), 86400 / 499)
        # A large quota (e.g. with an API key) keeps the configured interval.
        large = {'x-ratelimit-remaining': '7000', 'x-ratelimit-reset': '3600'}
        self.assertEqual(quota_delay(Response(200, headers=large), 15), 15)
        self.assertEqual(quota_delay(Response(200), 15), 15)
        self.assertEqual(quota_delay(None, 15), 15)


class PersistenceTests(DatabaseCase):
    async def test_history_core_stream_expiry_and_repeated_install(self):
        from endpoints.collected import (
            mobility_snapshot,
            movement_stream,
            movement_telemetry,
        )
        from measurement_migration import install
        from psycopg.rows import dict_row, tuple_row
        from starlette.requests import Request
        now = datetime.now(UTC)
        await install(self.conn)
        self.assertEqual(await persist(self.conn, snapshot(now, category='A3'), now), 1)
        self.assertEqual(await persist(self.conn, snapshot(now, category='A3'), now), 0)
        self.assertEqual(await persist(self.conn, snapshot(now-timedelta(seconds=15), category='A3'), now), 1)
        await install(self.conn)  # Existing aircraft must survive all AIS/schema constraints.
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM movement_positions WHERE kind='aircraft'"), 2)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM collected_payloads'), 2)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.entity_id='movement:aircraft:3c6488' AND d.metric='altitude_baro' AND d.dimensions='{"+'"reference":"pressure_1013.25_hPa"'+"}'::jsonb"), 2)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM movement_contexts'), 1)
        await self.conn.execute("INSERT INTO collection_attempts(source_id,status) VALUES (%s,'success')", (SOURCE,))
        self.conn.row_factory = dict_row
        class Pool:
            @asynccontextmanager
            async def connection(inner):
                yield self.conn
        for mode in ['legacy', 'core']:
            with patch.dict('os.environ', {'MEASUREMENT_READ_MODE': mode}):
                body = await mobility_snapshot(Pool())
                aircraft = next(p for p in body['positions'] if p['kind'] == 'aircraft')
                self.assertEqual(aircraft['name'], 'DLH1WP')
                self.assertEqual(aircraft['emitter_category'], 'A3')
                self.assertEqual(aircraft['altitude_baro_m'], 3048)
                self.assertEqual(body['aircraft_source']['status'], 'connected')
                self.assertEqual(datetime.fromisoformat(aircraft['valid_until']), datetime.fromisoformat(aircraft['timestamp'])+timedelta(seconds=MAX_AGE))
        from unittest.mock import AsyncMock, MagicMock
        request = MagicMock()
        request.is_disconnected = AsyncMock(return_value=False)
        stream = await movement_stream(request, Pool())
        frame = await anext(stream.body_iterator)
        self.assertIn('"kind":"aircraft"', frame)
        await stream.body_iterator.aclose()
        await self.conn.execute("UPDATE movement_latest SET data=jsonb_set(data,'{altitude_baro_m}','99999')")
        with patch.dict('os.environ', {'MEASUREMENT_READ_MODE': 'core'}):
            self.assertEqual((await mobility_snapshot(Pool()))['positions'][0]['altitude_baro_m'], 3048)
        response = await movement_telemetry('movement:aircraft:3c6488', Request({'type':'http','method':'GET','path':'/','headers':[], 'query_string':b''}), Pool())
        import json
        readings = json.loads(response.body)['readings']
        self.assertIn('altitude_baro', [r['metric'] for r in readings])
        await persist(self.conn, snapshot(now+timedelta(seconds=1), baro_rate=None), now)
        missing = await movement_telemetry('movement:aircraft:3c6488', Request({'type':'http','method':'GET','path':'/','headers':[], 'query_string':b''}), Pool())
        self.assertNotIn('vertical_rate', [r['metric'] for r in json.loads(missing.body)['readings']])
        await self.conn.execute("UPDATE movement_latest SET valid_until=NOW()-INTERVAL '1 second'")
        self.assertEqual((await mobility_snapshot(Pool()))['positions'], [])
        expired = await movement_telemetry('movement:aircraft:3c6488', Request({'type':'http','method':'GET','path':'/','headers':[], 'query_string':b''}), Pool())
        self.assertEqual(json.loads(expired.body)['readings'], [])
        self.conn.row_factory = tuple_row
