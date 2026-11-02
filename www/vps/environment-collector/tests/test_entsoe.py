"""ENTSO-E official XML shapes, interval contracts, token boundary and snapshots."""

import asyncio
import hashlib
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, patch
from xml.etree import ElementTree as ET

import httpx
from config import Settings
from entsoe import (
    GERMANY,
    PRODUCTS,
    URL,
    acquire,
    normalize,
    parameters,
    persist,
    source,
)
from psycopg.rows import dict_row

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tests'))
from db_support import DatabaseCase


def bundle(product='price', now=None):
    now=now or datetime(2026,10,6,12,tzinfo=UTC)
    start=now.replace(hour=0,minute=0,second=0,microsecond=0)-timedelta(days=1);end=start+timedelta(days=3)
    body=(Path(__file__).parent/f'fixtures/entsoe-{product}-official.xml').read_text()
    root=ET.fromstring(body)
    for node in root.iter():node.tag=node.tag.split('}')[-1]
    root.find('createdDateTime').text=(now-timedelta(hours=1)).isoformat()
    for node in root.iter():
        if node.tag in ('in_Domain.mRID','out_Domain.mRID','inBiddingZone_Domain.mRID','outBiddingZone_Domain.mRID'):
            node.text=PRODUCTS[product]['area']
        if node.tag=='contract_MarketAgreement.type':node.text='A01'
        if node.tag=='start':node.text=start.isoformat()
        if node.tag=='end':node.text=(start+timedelta(hours=1)).isoformat()
    xml=ET.tostring(root,encoding='unicode')
    return {'product':product,'xml':xml,'attempt_id':1,'sha256':hashlib.sha256(xml.encode()).hexdigest(),
        'snapshot_at':now.isoformat(),'start':start.isoformat(),'end':end.isoformat(),'parameters':parameters(product,start,end)}


def change(sample, update):
    root=ET.fromstring(sample['xml']);update(root)
    sample['xml']=ET.tostring(root,encoding='unicode');return sample


class EntsoeParsingTests(unittest.TestCase):
    def test_official_shapes_and_generation_consumption_separation(self):
        for product in PRODUCTS:self.assertTrue(normalize(bundle(product)))
        rows=normalize(bundle('generation'))
        self.assertEqual([r['dimensions']['direction'] for r in rows],['generation','consumption','generation'])
        self.assertEqual(rows[0]['dimensions']['psr_type'],'B14')
        self.assertEqual(rows[0]['value'],100)

    def test_negative_price_zero_and_missing_quantities(self):
        sample=change(bundle(),lambda r:setattr(r.find('.//price.amount'),'text','-15.75'))
        self.assertEqual(normalize(sample)[0]['value'], -15.75)
        sample=change(bundle('load'),lambda r:setattr(r.find('.//quantity'),'text','0'))
        self.assertEqual(normalize(sample)[0]['quality'],'valid');self.assertEqual(normalize(sample)[0]['value'],0)
        sample=change(sample,lambda r:r.find('.//Point').remove(r.find('.//quantity')))
        self.assertIsNone(normalize(sample)[0]['value']);self.assertEqual(normalize(sample)[0]['quality'],'missing')

    def test_a03_variable_blocks_expand_but_a01_gaps_remain_missing(self):
        sample=bundle()
        def adjust(root):
            root.find('.//resolution').text='PT15M'
            root.find('.//curveType').text='A03'
            second=deepcopy(root.find('.//Point'));second.find('position').text='3';second.find('price.amount').text='0'
            root.find('.//Period').append(second)
        change(sample,adjust);rows=normalize(sample)
        self.assertEqual(len(rows),4);self.assertEqual([r['value'] for r in rows],[Decimal('34.39'),Decimal('34.39'),0,0])
        change(sample,lambda r:setattr(r.find('.//curveType'),'text','A01'))
        self.assertEqual([r['quality'] for r in normalize(sample)],['valid','missing','valid','missing'])

    def test_dst_periods_keep_23_and_25_hours(self):
        for now,hours in ((datetime(2026,3,29,12,tzinfo=UTC),23),(datetime(2026,10,25,12,tzinfo=UTC),25)):
            sample=bundle('load',now)
            def adjust(root, hours=hours):
                period=root.find('.//Period');period.find('timeInterval/end').text=(datetime.fromisoformat(period.find('timeInterval/start').text)+timedelta(hours=hours)).isoformat()
                root.find('.//curveType').text='A03'
            change(sample,adjust);rows=normalize(sample)
            self.assertEqual(len(rows),hours)
            self.assertEqual(rows[-1]['end']-rows[0]['start'],timedelta(hours=hours))

    def test_invalid_document_scope_unit_curve_and_positions_fail(self):
        updates=[lambda r:setattr(r.find('type'),'text','A85'),lambda r:setattr(r.find('.//in_Domain.mRID'),'text',GERMANY),
            lambda r:setattr(r.find('.//currency_Unit.name'),'text','USD'),lambda r:setattr(r.find('.//curveType'),'text','A02'),
            lambda r:setattr(r.find('.//position'),'text','9'),lambda r:setattr(r.find('.//resolution'),'text','PT5M'),
            lambda r:setattr(r.find('.//price.amount'),'text','NaN'),lambda r:setattr(r.find('.//contract_MarketAgreement.type'),'text','A07')]
        for update in updates:
            with self.assertRaises(ValueError):normalize(change(bundle(),update))
        sample=bundle();sample['xml']='<!DOCTYPE x [<!ENTITY y "z">]>'+sample['xml']
        with self.assertRaises(ValueError):normalize(sample)
        sample=bundle();sample['xml']='<Acknowledgement_MarketDocument><Reason><code>999</code></Reason></Acknowledgement_MarketDocument>'
        with self.assertRaises(ValueError):normalize(sample)
        sample=change(bundle('load'),lambda r:setattr(r.find('.//quantity'),'text','-1'))
        with self.assertRaises(ValueError):normalize(sample)

    def test_configuration_hides_token_and_checks_cadence(self):
        self.assertNotIn('unit-test-secret',repr(Settings(db={},entsoe_token='unit-test-secret')))
        with patch.dict('os.environ',{'ENTSOE_POLL_SECONDS':'300'}),self.assertRaises(ValueError):Settings.from_env()
        from health import check_health, record_status
        now=datetime.now(UTC)
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'status.json'
            previous={'entsoe':{'last_success':(now-timedelta(hours=2)).isoformat()}}
            record_status(path,previous,details={'complete':False,'entsoe':{'status':'failed'}})
            self.assertEqual(check_health(path,300),0)
            previous['entsoe']['last_success']=(now-timedelta(hours=4)).isoformat()
            record_status(path,previous,details={'complete':False,'entsoe':{'status':'failed'}})
            self.assertEqual(check_health(path,300),1)


class EntsoeStorageTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp();sys.path.append(str(Path(__file__).resolve().parents[2]/'api/v1'))
        from measurement_migration import install
        await install(self.conn)

    async def archive(self,sample,attempt=1):
        body=sample['xml'].encode();sha=hashlib.sha256(body).hexdigest();sample.update(sha256=sha,attempt_id=attempt,_body=body)
        await self.conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/xml') ON CONFLICT DO NOTHING",(sha,len(body)))
        await self.conn.execute("INSERT INTO collection_attempts(id,source_id,received_at,http_status,payload_sha256,status) VALUES (%s,%s,%s,200,%s,'received')",(attempt,source(sample['product']),datetime.fromisoformat(sample['snapshot_at']),sha))

    async def test_idempotence_corrections_and_receipt_integrity(self):
        sample=bundle();await self.archive(sample)
        await persist(self.conn,sample,normalize(sample))
        self.assertEqual(await persist(self.conn,sample,normalize(sample)),0)
        changed=change(deepcopy(sample),lambda r:setattr(r.find('.//price.amount'),'text','-3'))
        with self.assertRaises(ValueError):await persist(self.conn,changed,normalize(changed))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'),1)
        await self.archive(changed,2);await persist(self.conn,changed,normalize(changed))
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM readings'),2)
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM reading_revisions'),0)
        self.assertEqual(await self.scalar("SELECT COUNT(*) FROM readings WHERE period_end-period_start=INTERVAL '1 hour'"),2)

    async def test_api_independent_products_latest_snapshot_pagination_and_visibility(self):
        from endpoints.environment_measurements import energy_market_intervals
        for n,product in enumerate(PRODUCTS,1):
            sample=bundle(product);await self.archive(sample,n);await persist(self.conn,sample,normalize(sample))
        conn=self.conn
        class Pool:
            @asynccontextmanager
            async def connection(self):
                previous=conn.row_factory;conn.row_factory=dict_row
                try:yield conn
                finally:conn.row_factory=previous
        result=await energy_market_intervals(product='generation',limit=1,offset=0,pool=Pool())
        self.assertEqual(result['stored_intervals'],3);self.assertTrue(result['has_more'])
        result=await energy_market_intervals(product='generation',limit=1,offset=2,pool=Pool())
        self.assertFalse(result['has_more'])
        await self.conn.execute("UPDATE entities SET is_hidden=TRUE WHERE id='environment:entsoe:generation'")
        result=await energy_market_intervals(product='generation',limit=100,offset=0,pool=Pool())
        self.assertEqual(result['stored_intervals'],0);self.assertEqual(result['items'],[])
        result=await energy_market_intervals(product='price',limit=100,offset=0,pool=Pool())
        self.assertEqual(result['stored_intervals'],1);self.assertEqual(result['items'][0]['unit'],'EUR/MWh')

    async def test_acquisition_header_token_archiving_and_failure_redaction(self):
        client=AsyncMock();sample=bundle('load',datetime.now(UTC))
        client.get.return_value=httpx.Response(200,content=sample['xml'].encode(),request=httpx.Request('GET',URL))
        settings=Settings(db={},entsoe_token='unit-test-secret')
        captured=await acquire(client,settings,self.conn,'load')
        args=client.get.call_args.kwargs
        self.assertEqual(args['headers']['SECURITY_TOKEN'],'unit-test-secret')
        self.assertEqual(args['timeout'],settings.request_timeout)
        self.assertNotIn('securityToken',args['params'])
        self.assertEqual(await self.scalar('SELECT COUNT(*) FROM collected_payloads'),1)
        await persist(self.conn,captured,normalize(captured))
        client.get.reset_mock();self.assertIsNone(await acquire(client,settings,self.conn,'load'));client.get.assert_not_called()
        with self.assertRaises(ValueError):await acquire(client,Settings(db={}),self.conn,'price')
        client.get.assert_not_called()
        client.get.side_effect=httpx.ConnectError('unit-test-secret')
        with self.assertRaisesRegex(ValueError,'ENTSO-E acquisition failed') as raised:await acquire(client,settings,self.conn,'price')
        self.assertNotIn('unit-test-secret',str(raised.exception))
        self.assertEqual(await self.scalar("SELECT error FROM collection_attempts WHERE status='failed'"),'ENTSOE acquisition failed')

    async def test_response_created_during_fetch_has_later_receipt(self):
        await self.conn.set_autocommit(False)
        try:
            transaction_start = await self.scalar('SELECT CURRENT_TIMESTAMP')

            async def delayed_response(*args, **kwargs):
                await asyncio.sleep(0.05)
                sample = bundle('load', datetime.now(UTC))
                # Use the database clock: CI runs PostgreSQL in a separate container.
                created = await self.scalar('SELECT clock_timestamp()')
                change(sample, lambda r: setattr(r.find('createdDateTime'), 'text', created.isoformat()))
                self.assertGreater(created, transaction_start)
                return httpx.Response(200, content=sample['xml'].encode(), request=httpx.Request('GET', URL))

            client = AsyncMock()
            client.get.side_effect = delayed_response
            captured = await acquire(client, Settings(db={}, entsoe_token='unit-test-secret'), self.conn, 'load')
            rows = normalize(captured)
            self.assertTrue(rows)
            self.assertGreater(datetime.fromisoformat(captured['snapshot_at']), transaction_start)
            self.assertGreater(await persist(self.conn, captured, rows), 0)
        finally:
            await self.conn.rollback()
            await self.conn.set_autocommit(True)


class EntsoePipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_products_fail_independently_and_keep_weather(self):
        from main import poll_cycle
        conn=AsyncMock();conn.__aenter__.return_value=conn
        raw={'pegel':{'currentMeasurement':{'timestamp':'2026-10-06T00:00:00Z','value':250}},
             'weather':{'current':{'time':'2026-10-06T00:00','temperature_2m':15}},
             'entsoe':{'price':bundle(),'load':{'product':'load'},'generation':bundle('generation')}}
        writer=AsyncMock(return_value={'weather':1});entsoe_writer=AsyncMock(return_value=1)
        with patch('main.psycopg.AsyncConnection.connect',AsyncMock(return_value=conn)),patch('main.persist_environment_data',writer),patch('main.entsoe.persist',entsoe_writer):
            result=await poll_cycle(None,Settings(db={},enable_entsoe=True),raw=raw)
        writer.assert_awaited_once();self.assertFalse(result['complete'])
        self.assertEqual(result['entsoe']['products']['price']['status'],'success')
        self.assertEqual(result['entsoe']['products']['load']['status'],'failed')
        self.assertEqual(result['entsoe']['products']['generation']['status'],'success')
