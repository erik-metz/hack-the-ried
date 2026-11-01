"""Download contracts, including real SQL and referential integrity."""
import csv
import io
import json
import sys
import unittest
import zipfile
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

from endpoints.data_exports import csv_bytes, download_data, export_range
from fastapi import HTTPException
from measurement_migration import install
from parquet_exports import table_from_rows
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tests'))
from db_support import DatabaseCase


class ExportFormatTests(unittest.TestCase):
    def test_precision_formulas_and_json_roundtrip(self):
        payload = csv_bytes([{'value': Decimal('-1.234567890123456789'),
                              'label': '=SUM(A1)', 'metadata': {'name': 'Bürstadt, Ried'},
                              'missing': None}], ('value', 'label', 'metadata', 'missing'))
        row = next(csv.DictReader(io.StringIO(payload.decode('utf-8-sig'))))
        self.assertEqual(row['value'], '-1.234567890123456789')
        self.assertEqual(row['label'], "'=SUM(A1)")
        self.assertEqual(json.loads(row['metadata']), {'name': 'Bürstadt, Ried'})
        self.assertEqual(row['missing'], '')

    def test_parquet_contract_keeps_exact_ids_and_values_and_types_timestamps(self):
        table = table_from_rows([{'measurement_id': 9007199254740993,
                                  'observed_at': datetime(2030, 1, 1, tzinfo=UTC),
                                  'value': Decimal('12.1234567890123456789')}],
                                ('measurement_id', 'observed_at', 'value'))
        self.assertEqual(table.schema.field('measurement_id').type, __import__('pyarrow').string())
        self.assertEqual(str(table.schema.field('observed_at').type), 'timestamp[us, tz=UTC]')
        self.assertEqual(table['measurement_id'][0].as_py(), '9007199254740993')
        self.assertEqual(table['value'][0].as_py(), '12.1234567890123456789')

    def test_inclusive_dates_and_invalid_ranges(self):
        start, end = export_range(date(2030, 1, 1), date(2030, 1, 31), False)
        self.assertEqual((end - start).days, 31)
        self.assertEqual(end, datetime(2030, 2, 1, tzinfo=UTC))
        for start, end in [(None, None), (date(2030, 1, 2), date(2030, 1, 1)),
                           (date(2030, 1, 1), date(2030, 2, 1))]:
            with self.assertRaises(HTTPException):
                export_range(start, end, False)


class ExportDatabaseTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await install(self.conn)
        self.conn.row_factory = dict_row
        connection = self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                yield connection
        self.pool = Pool()

    async def reading(self, entity, metric='temperature', value='12.1234567890123456789',
                      hidden=False, kind='environmental_sensor', basis='observed', dimensions=None):
        await self.conn.execute('INSERT INTO entities(id,name,entity_type,is_hidden) VALUES (%s,%s,%s,%s)',
                                (entity, entity, kind, hidden))
        await self.conn.execute("""SELECT write_measurement(%s,%s,'°C','export-test',%s,
            %s::jsonb,'2030-01-15T12:00:00Z',%s::numeric,'2030-01-15T12:01:00Z','{}'::jsonb)""",
                                (entity, metric, basis, json.dumps(dimensions or {}), value))

    async def unzip(self, response):
        data = response.body if hasattr(response, "body") else b"".join([chunk async for chunk in response.body_iterator])
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            tables = {name: list(csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig'))))
                      for name in archive.namelist() if name.endswith('.csv')}
            manifest = json.loads(archive.read('manifest.json'))
        return tables, manifest

    async def test_sample_references_and_visibility(self):
        await self.reading('public')
        await self.reading('private', hidden=True)
        await self.conn.execute("INSERT INTO sensor_metadata(id,friendly_name,is_hidden) VALUES ('hidden','Hidden',true)")
        await self.reading('sensor:hidden')
        response = await download_data(sample=True, pool=self.pool)
        tables, manifest = await self.unzip(response)
        self.assertEqual(set(tables), {'entities.csv', 'measurement_definitions.csv', 'readings.csv'})
        self.assertEqual([r['id'] for r in tables['entities.csv']], ['public'])
        definition = tables['measurement_definitions.csv'][0]
        self.assertEqual(definition['entity_id'], 'public')
        self.assertEqual(tables['readings.csv'][0]['measurement_id'], definition['id'])
        self.assertEqual(tables['readings.csv'][0]['value'], '12.1234567890123456789')
        self.assertTrue(manifest['sample'])

    async def test_sample_parquet_contains_typed_tables_and_exact_values(self):
        await self.reading('public')
        response = await download_data(sample=True, format='parquet', pool=self.pool)
        with zipfile.ZipFile(io.BytesIO(response.body)) as archive:
            self.assertEqual(set(archive.namelist()), {'entities.parquet', 'measurement_definitions.parquet', 'readings.parquet', 'manifest.json', 'README.txt'})
            import pyarrow.parquet as pq
            readings = pq.read_table(io.BytesIO(archive.read('readings.parquet')))
            self.assertEqual(readings['value'][0].as_py(), '12.1234567890123456789')
            self.assertEqual(str(readings.schema.field('observed_at').type), 'timestamp[us, tz=UTC]')
            manifest = json.loads(archive.read('manifest.json'))
            self.assertEqual(manifest['format'], 'parquet')

    async def test_temperature_exports_all_stations_and_keeps_basis(self):
        await self.reading('a')
        await self.reading('b', metric='soil_temperature', basis='model')
        await self.reading('c', metric='humidity')
        tables, manifest = await self.unzip(await download_data(topic='temperature', sample=False,
            start=date(2030,1,1), end=date(2030,1,31), pool=self.pool))
        self.assertEqual({r['id'] for r in tables['entities.csv']}, {'a', 'b'})
        self.assertEqual({r['basis'] for r in tables['measurement_definitions.csv']}, {'model', 'observed'})
        self.assertEqual(manifest['end_exclusive'], '2030-02-01T00:00:00+00:00')

    async def test_inaturalist_cannot_bypass_current_publication_rules(self):
        from endpoints.environment_measurements import environment_measurements

        await self.reading('ordinary', dimensions={'contract': 'environment-v1'})
        await self.reading('inat', kind='inaturalist_observation', dimensions={'contract': 'environment-v1'})
        for sample in (True, False):
            tables, _ = await self.unzip(await download_data(topic='all', sample=sample,
                start=date(2030,1,1), end=date(2030,1,31), pool=self.pool))
            self.assertEqual([r['id'] for r in tables['entities.csv']], ['ordinary'])
            self.assertEqual(len(tables['measurement_definitions.csv']), 1)
            self.assertEqual(len(tables['readings.csv']), 1)
        for entity, expected in [('ordinary', 1), ('inat', 0)]:
            result = await environment_measurements(entity_id=entity,
                start=datetime(2030,1,1,tzinfo=UTC), end=datetime(2030,2,1,tzinfo=UTC),
                kind=None, metric=None, limit=100, pool=self.pool)
            self.assertEqual(len(result['items']), expected)

    async def test_mobility_includes_service_trips_and_traffic_metrics(self):
        await self.reading('trip', metric='latitude', kind='service_trip', basis='schedule_prediction')
        await self.reading('traffic', metric='traffic_total_hourly', kind='sensor')
        # Canonical legacy sensors require a currently public sensor entry.
        await self.reading('weather')
        tables, _ = await self.unzip(await download_data(topic='mobility', sample=False,
            start=date(2030,1,1), end=date(2030,1,31), pool=self.pool))
        self.assertEqual({r['id'] for r in tables['entities.csv']}, {'trip', 'traffic'})
        self.assertIn('schedule_prediction', {r['basis'] for r in tables['measurement_definitions.csv']})

    async def test_environmental_topics_filter_readings_and_preserve_links(self):
        metrics = {
            'humidity': ['humidity', 'relative_humidity'],
            'precipitation': ['precipitation', 'rainfall'],
            'water': ['groundwater_level', 'water_level_delta', 'discharge'],
            'soil': ['soil_moisture_30cm', 'soil_temperature'],
        }
        for topic, names in metrics.items():
            for metric in names:
                await self.reading(metric, metric=metric)
        await self.reading('unrelated', metric='traffic_count')
        for topic, names in metrics.items():
            with self.subTest(topic=topic):
                tables, manifest = await self.unzip(await download_data(
                    topic=topic, sample=False, start=date(2030, 1, 1),
                    end=date(2030, 1, 31), pool=self.pool))
                self.assertEqual({row['id'] for row in tables['entities.csv']}, set(names))
                definitions = tables['measurement_definitions.csv']
                self.assertEqual({row['metric'] for row in definitions}, set(names))
                self.assertEqual({row['measurement_id'] for row in tables['readings.csv']},
                                 {row['id'] for row in definitions})
                self.assertEqual(manifest['topic'], topic)
                self.assertNotIn('traffic_incidents.csv', tables)

    async def test_full_export_streams_every_batch_without_a_row_limit(self):
        await self.reading('a')
        definition = (await (await self.conn.execute('SELECT id FROM measurement_definitions')).fetchone())['id']
        await self.conn.execute("""INSERT INTO readings(measurement_id,observed_at,value)
            SELECT %s,'2030-01-16'::timestamptz + n*interval '1 second',n
            FROM generate_series(1,2500) n""", (definition,))
        response = await download_data(topic='temperature', sample=False, start=date(2030,1,1), end=date(2030,1,31), pool=self.pool)
        self.assertTrue(hasattr(response, 'body_iterator'))
        tables, manifest = await self.unzip(response)
        self.assertEqual(len(tables['readings.csv']), 2501)
        self.assertEqual(manifest['tables']['readings'], 2501)
        self.assertTrue(manifest['complete'])

    async def test_availability_check_does_not_generate_a_zip(self):
        await self.reading('a')
        response = await download_data(topic='temperature', sample=False, check=True,
            start=date(2030,1,1), end=date(2030,1,31), pool=self.pool)
        self.assertEqual(json.loads(response.body), {'available': True})
        self.assertNotIn('content-disposition', response.headers)

    async def test_roadworks_overlap_and_singular_provider_category(self):
        for identifier, cause in [('work','roadwork'), ('closed','closure'), ('jam','congestion')]:
            await self.conn.execute("""INSERT INTO traffic_incidents
                (id,road_name,direction,location_from,location_to,start_time,end_time,last_seen_at,cause_type)
                VALUES (%s,'A67','north','a','b','2029-12-20','2030-01-20','2030-01-15',%s)""", (identifier, cause))
        tables, _ = await self.unzip(await download_data(topic='roadworks', sample=False,
            start=date(2030,1,1), end=date(2030,1,31), pool=self.pool))
        self.assertEqual({r['id'] for r in tables['traffic_incidents.csv']}, {'work','closed'})
        self.assertEqual(tables['readings.csv'], [])

    async def test_empty_export_reports_missing_data(self):
        with self.assertRaises(HTTPException) as error:
            await download_data(topic='temperature', sample=False, start=date(2030,1,1), end=date(2030,1,31), pool=self.pool)
        self.assertEqual(error.exception.status_code, 404)
