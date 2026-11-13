"""API reads persisted reference data, never external providers."""
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row

sys.path.insert(0,str(Path(__file__).parents[3] / 'registry-sync-worker'))
sys.path.insert(0,str(Path(__file__).parents[3] / 'tests'))
from db_support import DatabaseCase
from endpoints.reference_data import reference_layer, source_status
from reference_data import scalar_records, store_records

SOURCE={'id':'reference-tax','layer':'tax','url':'https://grundradar.de/daten/grundsteuer-hebesaetze.json',
        'title':'Hebesätze','license':'Quellenbedingungen','note':'Datenjahr','attribution':'Grundradar',
        'interval_seconds':604800}


def test_freshness_is_independent_of_historical_reference_date():
    now=datetime.now(UTC)
    state={'checked_at':now.isoformat(),'reference_date':'2022-05-15','interval_seconds':604800,'members':['private-key-index']}
    assert not source_status(state,now)['stale']
    assert 'members' not in source_status(state,now)
    assert source_status(state,now+timedelta(days=22))['stale']


class ReferenceAPITests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await self.conn.execute((Path(__file__).parents[1]/'migrations/20260930_measurements.sql').read_text())
        class Pool:
            @asynccontextmanager
            async def connection(inner):
                async with await psycopg.AsyncConnection.connect(**self.db,row_factory=dict_row) as conn:
                    yield conn
        self.pool=Pool()

    async def test_reads_values_and_periods_from_canonical_tables(self):
        body={'dataset':'grundsteuer-hebesaetze','rows':[
            {'code':code,'name':code,'data_year':2025,'hebesatz_b_percent':410.5}
            for code in ['06431003','06431005','06431010','06431013']]}
        await store_records(self.conn,SOURCE,scalar_records(body,'tax'),'digest')
        result=await reference_layer('tax',self.pool)
        assert len(result['features'])==4
        value=result['features'][0]['properties']['measurements'][0]
        assert value['value']==410.5 and value['unit']=='%'
        assert value['observed_at'].startswith('2025-01-01')
        assert result['features'][0]['geometry'] is None
        assert 'members' not in result['source']
        # Missing current members must fail; never serve a partial successful publication.
        await self.conn.execute("UPDATE entities SET is_hidden=true WHERE id='reference:tax:06431003'")
        with self.assertRaises(HTTPException) as failure:
            await reference_layer('tax',self.pool)
        assert failure.exception.status_code==503

    async def test_unknown_layer_is_unavailable(self):
        with self.assertRaises(HTTPException) as failure:
            await reference_layer('missing',self.pool)
        assert failure.exception.status_code==503
