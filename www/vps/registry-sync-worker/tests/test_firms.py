import hashlib
"""Real publication contracts using provider-format fixtures, never fake live points."""

import io
import logging
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'api/v1'))

import httpx
import pytest
from db_support import DatabaseCase
from firms import COLUMNS, MAX_BYTES, archive, fetch_csv, import_firms, parse_csv
from firms_publication import firms_data, firms_response
from measurement_migration import install
from psycopg.rows import dict_row, tuple_row

SOURCE = {'id': 'nasa-firms', 'url': 'https://firms.modaps.eosdis.nasa.gov/api/area/', 'max_age_seconds': 7200}
KEY = 'private-test-map-key'


def body(frp='1.17', confidence='n', date=None):
    date = date or datetime.now(UTC).date().isoformat()
    return (','.join(COLUMNS) + '\n' + f'49.60,8.45,310.1,0.5,0.66,{date},1,N20,VIIRS,{confidence},2.0NRT,284.11,{frp},N\n').encode()


def test_utc_units_identity_duplicates_and_empty():
    b = body(date='2026-10-08')
    now = datetime(2026, 10, 8, 13, tzinfo=UTC)
    detection = parse_csv(b, now)[0]
    assert detection['acquired_at'] == '2026-10-08T00:01:00+00:00'
    assert detection['frp_mw'] == 1.17 and detection['confidence'] == 'n'
    assert parse_csv(b + b.splitlines()[1] + b'\n', now) == [detection]
    assert parse_csv(body('2', date='2026-10-08'), now)[0]['id'] == detection['id']
    assert parse_csv((','.join(COLUMNS) + '\n').encode(), now) == []
    with pytest.raises(ValueError, match='Conflicting'):
        parse_csv(b + body('2', date='2026-10-08').splitlines()[1] + b'\n', now)


@pytest.mark.parametrize('change', [
    lambda b: b.replace(b'49.60', b'50.60'),
    lambda b: b.replace(b'8.45', b'nan'),
    lambda b: b.replace(b',n,', b',99,'),
    lambda b: b.replace(b',N20,', b',N21,'),
    lambda b: b.replace(b',1,N20', b',2460,N20'),
    lambda b: b.replace(b'1.17', b'-1'),
    lambda b: b.replace(b'2026-10-08', b'2026-10-01'),
    lambda b: b.replace(b'2026-10-08', b'2026-10-09'),
    lambda b: b'Invalid MAP_KEY',
    lambda b: b'<html>Error</html>',
])
def test_invalid_provider_payload_fails_closed(change):
    with pytest.raises(ValueError):
        parse_csv(change(body(date='2026-10-08')), datetime(2026, 10, 8, 13, tzinfo=UTC))


def test_byte_bound():
    with pytest.raises(ValueError, match='byte limit'):
        parse_csv(b'x' * (MAX_BYTES + 1))


class FirmsPersistenceTests(DatabaseCase):
    async def test_access_gate_import_revision_empty_and_api_health(self):
        await install(self.conn)
        with patch.dict('os.environ', {'FIRMS_MAP_KEY': ''}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: pytest.fail('Missing key must not request NASA'))) as client:
                assert await import_firms(self.conn, client, SOURCE) == 'not_configured'
        assert await self.scalar("SELECT count(*) FROM readings") == 0
        with patch.dict('os.environ', {'FIRMS_MAP_KEY': KEY}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=body()))) as client:
                assert await import_firms(self.conn, client, SOURCE) == 'success'
                assert await import_firms(self.conn, client, SOURCE) == 'success'
            assert await self.scalar("SELECT count(*) FROM entities WHERE entity_type='firms_anomaly'") == 1
            assert await self.scalar('SELECT count(*) FROM readings') == 1
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=body('2')))) as client:
                assert await import_firms(self.conn, client, SOURCE) == 'success'
            assert await self.scalar("SELECT metadata->>'frp_mw' FROM entities WHERE entity_type='firms_anomaly'") == '2.0'
            assert await self.scalar('SELECT count(*) FROM readings') == 1
            with pytest.raises(ValueError):
                async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b'Invalid MAP_KEY'))) as client:
                    await import_firms(self.conn, client, SOURCE)
            conn = self.conn
            class Pool:
                @asynccontextmanager
                async def connection(self):
                    yield conn
            conn.row_factory = dict_row
            try:
                data = await firms_data(Pool(), 3)
                assert data['status'] == 'failed' and data['count'] == 1
                assert data['last_successful_fetch_at']
                response = firms_response(data, download=True)
                assert 'attachment' in response.headers['content-disposition']
                assert KEY not in response.body.decode()
            finally:
                conn.row_factory = tuple_row
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=(','.join(COLUMNS) + '\n').encode()))) as client:
                assert await import_firms(conn, client, SOURCE) == 'success'
            conn.row_factory = dict_row
            try:
                data = await firms_data(Pool(), 1)
                assert data['status'] == 'success' and data['count'] == 0
                await conn.execute("UPDATE collected_datasets SET expires_at=NOW()-INTERVAL '1 minute' WHERE dataset='environment/firms/anomalies'")
                assert (await firms_data(Pool(), 3))['status'] == 'stale'
            finally:
                conn.row_factory = tuple_row

    async def test_response_fingerprints_deduplicate_without_storing_retry_bodies(self):
        await archive(self.conn, SOURCE, b'123456', 'failed')
        await archive(self.conn, SOURCE, b'123456', 'failed')
        await archive(self.conn, SOURCE, b'abcdef', 'failed')
        assert await self.scalar('SELECT count(*) FROM collected_payloads')==2
        assert await self.scalar('SELECT count(*) FROM collected_payloads WHERE body IS NOT NULL')==0

    async def test_no_redirect_or_secret_archival(self):
        captured = io.StringIO()
        handler = logging.StreamHandler(captured)
        logger = logging.getLogger('httpx')
        old_level = logger.level
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        requests = []
        def serve(request):
            requests.append(request)
            return httpx.Response(302, headers={'location': 'https://example.com/'}, content=('Error ' + KEY).encode())
        try:
            async with httpx.AsyncClient(transport=httpx.MockTransport(serve), follow_redirects=True) as client:
                with pytest.raises(ValueError, match='302'):
                    await fetch_csv(self.conn, client, SOURCE, KEY)
            assert len(requests) == 1
            assert await self.scalar('SELECT body FROM collected_payloads LIMIT 1') is None
            assert await self.scalar('SELECT sha256 FROM collected_payloads LIMIT 1') == hashlib.sha256(b'Error [REDACTED]').hexdigest()
            assert KEY not in captured.getvalue()
        finally:
            logger.removeHandler(handler)
            logger.setLevel(old_level)


@pytest.mark.asyncio
async def test_stream_byte_limit_before_archival():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b'x' * (MAX_BYTES + 1)))) as client:
        with pytest.raises(ValueError, match='byte limit'):
            await fetch_csv(None, client, SOURCE, KEY)


def test_row_limit():
    b = body()
    with pytest.raises(ValueError, match='bounded'):
        parse_csv(b.splitlines()[0] + b'\n' + (b.splitlines()[1] + b'\n') * 5001)
