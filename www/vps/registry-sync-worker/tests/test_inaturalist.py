"""Provider fixtures and real PostgreSQL privacy/withdrawal contracts."""

import hashlib
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'api/v1'))

import httpx
import pytest
from db_support import DatabaseCase
from inaturalist import (
    DATASET,
    MAX_BYTES,
    gbif_index,
    import_inaturalist,
    inaturalist_id,
    observation,
    request_page,
)
from inaturalist_publication import inaturalist_data, inaturalist_response
from measurement_migration import install
from psycopg.rows import dict_row, tuple_row
from psycopg.types.json import Jsonb

SOURCE = {'id': 'inaturalist-ried', 'url': 'https://api.inaturalist.org/v1/observations', 'max_age_seconds': 129600}


def record(**changes):
    return {'id': 123, 'taxon': {'id': 42, 'name': 'Testus species', 'rank': 'species', 'default_photo': {'url': 'private'}},
            'observed_on': '2026-10-01', 'updated_at': '2026-10-02T12:00:00Z',
            'location': '49.60,8.45', 'public_positional_accuracy': 25, 'obscured': False,
            'geoprivacy': None, 'taxon_geoprivacy': 'open', 'quality_grade': 'research',
            'license_code': 'cc-by', 'user': {'login': 'fixture_observer', 'name': 'EXCLUDED NAME', 'email': 'EXCLUDED EMAIL'},
            'photos': [{'license_code': None, 'url': 'EXCLUDED PHOTO'}], 'comments': ['EXCLUDED COMMENT'],
            'private_location': 'EXCLUDED PRIVATE LOCATION', **changes}


def response(records, total=None):
    return httpx.Response(200, json={'total_results': len(records) if total is None else total, 'results': records})


def test_projection_attribution_and_separate_photo_license():
    result = observation(record())
    assert result['date_precision'] == 'day' and result['license'] == 'cc-by'
    assert result['attribution'] == 'fixture_observer' and result['coordinate_uncertainty_m'] == 25
    assert 'EXCLUDED' not in json.dumps(result) and 'default_photo' not in result
    assert observation(record(license_code='cc0', user={}))['attribution'] is None
    assert observation(record(license_code='cc-by-sa'))['license_url'].endswith('/by-sa/4.0/')


@pytest.mark.parametrize('change', [
    {'obscured': True}, {'obscured': None}, {'geoprivacy': 'private'}, {'geoprivacy': 'obscured'},
    {'taxon_geoprivacy': 'obscured'}, {'taxon_geoprivacy': 'private'}, {'taxon_geoprivacy': 'unknown'},
    {'license_code': 'cc-by-nc'}, {'license_code': None}, {'license_code': 'all rights reserved'},
    {'location': 'nan,8.45'}, {'location': '50,8.45'}, {'location': '49.60,9'},
    {'public_positional_accuracy': -1}, {'public_positional_accuracy': float('nan')},
    {'id': True}, {'user': {}}, {'observed_on': 'invalid'}, {'observed_on': '2999-01-01'},
    {'updated_at': '2026-10-02'}, {'updated_at': '2999-01-01T12:00:00Z'}, {'quality_grade': 'unknown'},
])
def test_invalid_or_private_is_never_projected(change):
    with pytest.raises((ValueError, TypeError)):
        observation(record(**change))


@pytest.mark.parametrize('url, expected', [
    ('https://www.inaturalist.org/observations/123', 123),
    ('http://inaturalist.org/observations/123/?x=1', 123),
    ('https://www.inaturalist.org.evil.test/observations/123', None),
    ('https://evil@www.inaturalist.org/observations/123', None),
    ('123', None), ('https://www.inaturalist.org/taxa/123', None),
])
def test_origin_links_only(url, expected):
    assert inaturalist_id(url) == expected


@pytest.mark.asyncio
async def test_transport_redirects_retries_and_byte_bound():
    for status in (302, 403):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r, status=status: httpx.Response(status, headers={'Location': 'https://evil.test'}))) as client:
            with pytest.raises(ValueError, match='HTTP'):
                await request_page(client, {})
    attempts = []
    def handler(req):
        attempts.append(req)
        return httpx.Response(429) if len(attempts) < 3 else response([])
    with patch('inaturalist.asyncio.sleep', new_callable=AsyncMock) as sleep:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert (await request_page(client, {}))[0]['results'] == []
        assert len(attempts) == 3 and sleep.await_count == 2
        assert not attempts[0].headers.get('Authorization')
    with patch('inaturalist.MAX_BYTES', 20):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b'x'*21))) as client:
            with pytest.raises(ValueError, match='byte limit'):
                await request_page(client, {})
    assert MAX_BYTES == 20*1024*1024


class InaturalistPersistenceTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await install(self.conn)

    async def data(self, **kwargs):
        conn = self.conn
        class Pool:
            @asynccontextmanager
            async def connection(self):
                yield conn
        conn.row_factory = dict_row
        try:
            return await inaturalist_data(Pool(), **kwargs)
        finally:
            conn.row_factory = tuple_row

    async def ingest(self, rows):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: response(rows))) as client:
            return await import_inaturalist(self.conn, client, SOURCE)

    async def test_reimport_revision_revocation_and_minimal_archives(self):
        assert await self.ingest([record()]) == 'success'
        definition=await self.scalar('SELECT id FROM measurement_definitions')
        assert await self.ingest([record()]) == 'success'
        assert await self.scalar('SELECT id FROM measurement_definitions') == definition
        assert await self.scalar('SELECT count(*) FROM readings') == 1
        await self.ingest([record(quality_grade='needs_id', location='49.61,8.46')])
        assert (await self.data())['observations'][0]['latitude'] == 49.61
        assert await self.scalar('SELECT count(*) FROM collected_dataset_versions WHERE dataset=%s', (DATASET,)) == 0
        archives = await (await self.conn.execute('SELECT body FROM collected_payloads')).fetchall()
        assert all(r[0] is None for r in archives)
        await self.ingest([record(obscured=True)])
        assert (await self.data())['count'] == 0
        assert await self.scalar("SELECT count(*) FROM entities WHERE entity_type='inaturalist_observation'") == 0
        assert await self.scalar('SELECT count(*) FROM readings') == 0
        assert await self.scalar('SELECT count(*) FROM latest_readings') == 0
        assert await self.scalar('SELECT count(*) FROM reading_revisions') == 0
        await self.ingest([record()])
        for change in ({'license_code': 'cc-by-nc'}, {'taxon_geoprivacy': 'obscured'}, {'geoprivacy': 'private'}):
            await self.ingest([record(**change)])
            assert (await self.data())['count'] == 0
            assert await self.scalar('SELECT count(*) FROM readings') == 0
            await self.ingest([record()])
        await self.ingest([record()])
        await self.ingest([])  # deleted or moved outside the allowed query
        assert (await self.data())['count'] == 0

    async def test_withdrawal_preserves_other_public_observation_identity(self):
        await self.ingest([record(id=123),record(id=124)])
        retained=await self.scalar("SELECT id FROM measurement_definitions WHERE entity_id='inaturalist:124'")
        await self.ingest([record(id=123,obscured=True),record(id=124)])
        assert await self.scalar("SELECT count(*) FROM entities WHERE id='inaturalist:123'") == 0
        assert await self.scalar('SELECT count(*) FROM readings') == 1
        assert await self.scalar("SELECT id FROM measurement_definitions WHERE entity_id='inaturalist:124'") == retained
        assert await self.scalar('SELECT count(*) FROM reading_revisions') == 0

    async def test_corrected_observation_date_replaces_old_time_without_recreating_definition(self):
        await self.ingest([record()])
        definition=await self.scalar('SELECT id FROM measurement_definitions')
        await self.ingest([record(observed_on='2026-09-30')])
        assert await self.scalar('SELECT id FROM measurement_definitions') == definition
        assert await self.scalar('SELECT count(*) FROM readings') == 1
        assert str((await self.scalar('SELECT observed_at FROM readings')).date()) == '2026-09-30'
        assert await self.scalar('SELECT count(*) FROM reading_revisions') == 0

    async def test_failure_withdraws_and_expired_api_hides(self):
        await self.ingest([record()])
        await self.conn.execute("UPDATE collected_datasets SET expires_at=NOW()-INTERVAL '1 hour'")
        assert (await self.data())['status'] == 'stale'
        assert (await self.data())['observations'] == []
        with pytest.raises(ValueError):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500))) as client:
                with patch('inaturalist.asyncio.sleep', new_callable=AsyncMock):
                    await import_inaturalist(self.conn, client, SOURCE)
        assert (await self.data())['status'] == 'failed'
        assert await self.scalar('SELECT count(*) FROM collected_dataset_versions WHERE dataset=%s', (DATASET,)) == 0
        assert await self.scalar('SELECT count(*) FROM readings') == 0

    async def test_incremental_revalidation_with_core_views_and_key_only_heads(self):
        migrations=Path(__file__).resolve().parents[2]/'api/v1/migrations'
        await self.conn.execute((migrations/'20261103_core_storage.sql').read_text())
        async with self.conn.transaction():
            await self.conn.execute("SET LOCAL ried.core_retirement_verified='yes'")
            await self.conn.execute((migrations/'20261103_core_retirement.sql').read_text())
        await self.conn.execute((migrations/'20261103_measurement_heads.sql').read_text())
        await self.conn.execute((migrations/'20261103_snapshot_identity.sql').read_text())
        await self.ingest([record(id=123),record(id=124)])
        retained=await self.scalar("SELECT id FROM measurement_definitions WHERE entity_id='inaturalist:124'")
        await self.ingest([record(id=123,geoprivacy='private'),record(id=124,observed_on='2026-09-30')])
        assert await self.scalar('SELECT count(*) FROM readings') == 1
        assert await self.scalar('SELECT count(*) FROM measurement_heads') == 1
        assert await self.scalar("SELECT id FROM measurement_definitions WHERE entity_id='inaturalist:124'") == retained
        assert str((await self.scalar('SELECT observed_at FROM latest_readings')).date()) == '2026-09-30'
        assert await self.scalar('SELECT count(*) FROM reading_revisions') == 0
        with pytest.raises(ValueError):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500))) as client:
                with patch('inaturalist.asyncio.sleep',new_callable=AsyncMock):
                    await import_inaturalist(self.conn,client,SOURCE)
        assert await self.scalar('SELECT count(*) FROM readings') == 0
        assert await self.scalar('SELECT count(*) FROM measurement_heads') == 0

    async def test_bounded_pagination_exact_overlap_and_export(self):
        # Normalized GBIF lacks origin links: use current archived public records.
        raw = json.dumps({'results': [{'key': 987, 'occurrenceID': 'https://www.inaturalist.org/observations/123'}, {'key': 999, 'occurrenceID': 'https://www.inaturalist.org/observations/124'}]}).encode()
        digest = hashlib.sha256(raw).hexdigest()
        snapshot = hashlib.sha256(digest.encode()).hexdigest()
        await self.conn.execute("INSERT INTO entities(id,name,entity_type,metadata) VALUES ('environment:gbif:ried','GBIF','monitoring_area',%s)", (Jsonb({'snapshot_sha256': snapshot}),))
        await self.conn.execute("INSERT INTO entities(id,name,entity_type,metadata) VALUES ('environment:gbif:987','GBIF','biodiversity_occurrence',%s)", (Jsonb({'gbif_id': 987}),))
        await self.conn.execute("SELECT write_measurement('environment:gbif:987','occurrence_presence','count','environment-gbif','observed',%s,NOW(),1,NOW(),'{}','valid',NULL,NULL,'reference')", (Jsonb({'snapshot_sha256': snapshot}),))
        await self.conn.execute("INSERT INTO collected_payloads(sha256,body,content_type) VALUES (%s,%s,'application/json')", (digest, raw))
        await self.conn.execute("INSERT INTO collection_attempts(source_id,status,http_status,payload_sha256) VALUES ('environment-gbif','success',200,%s)", (digest,))
        assert (await gbif_index(self.conn))[0] == {123: [987]}
        await self.conn.execute("UPDATE entities SET metadata=%s WHERE id='environment:gbif:ried'", (Jsonb({'snapshot_sha256': 'different-current-snapshot'}),))
        assert (await gbif_index(self.conn))[0] == {}  # old links cannot prove current overlap
        await self.conn.execute("UPDATE entities SET metadata=%s WHERE id='environment:gbif:ried'", (Jsonb({'snapshot_sha256': snapshot}),))
        pages = []
        def handler(req):
            page = int(req.url.params['page']); pages.append(page)
            return response([record(id=123+page-1)], total=3)
        with patch('inaturalist.PAGE_SIZE', 1), patch('inaturalist.MAX_PAGES', 2), patch('inaturalist.asyncio.sleep', new_callable=AsyncMock):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                await import_inaturalist(self.conn, client, SOURCE)
        assert pages == [1, 2]
        data = await self.data()
        assert data['truncated'] and data['gbif_overlap_count'] == 1
        assert [r['id'] for r in data['observations']] == [124]
        assert len((await self.data(include_duplicates=True))['observations']) == 2
        exported = inaturalist_response(await self.data(include_duplicates=True), download=True)
        assert exported.headers['Cache-Control'] == 'no-store'
        assert 'attachment' in exported.headers['Content-Disposition']
        assert await self.scalar("SELECT count(*) FROM entities WHERE id='environment:gbif:987'") == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('data', [{'results': []}, {'total_results': -1, 'results': []},
                                 {'total_results': 1, 'results': None}, {'total_results': True, 'results': []}])
async def test_malformed_envelope_cannot_publish_empty_success(data):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=data))) as client:
        with pytest.raises(ValueError, match='envelope'):
            await request_page(client, {})
