"""ENTSO-E published market intervals with independent archived product snapshots."""

import hashlib
import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree as ET

import httpx
from psycopg.types.json import Jsonb

URL = 'https://web-api.tp.entsoe.eu/api'
GERMANY = '10Y1001A1001A83F'
DE_LU = '10Y1001A1001A82H'
PRODUCTS = {
    'price': {'type': 'A44', 'area': DE_LU, 'label': 'Gebotszone Deutschland–Luxemburg', 'unit': 'EUR/MWh', 'metric': 'day_ahead_price'},
    'load': {'type': 'A65', 'area': GERMANY, 'label': 'Deutschland', 'unit': 'MW', 'metric': 'total_load'},
    'generation': {'type': 'A75', 'area': GERMANY, 'label': 'Deutschland', 'unit': 'MW', 'metric': 'generation_power'},
}


def source(product):
    return 'environment-entsoe-' + product


def parameters(product, start, end):
    spec = PRODUCTS[product]
    params = {'documentType': spec['type'], 'periodStart': start.strftime('%Y%m%d%H%M'), 'periodEnd': end.strftime('%Y%m%d%H%M')}
    if product == 'price':
        params.update(in_Domain=spec['area'], out_Domain=spec['area'])
    else:
        params['processType'] = 'A16'
        params['outBiddingZone_Domain' if product == 'load' else 'in_Domain'] = spec['area']
    return params


async def acquire(client, settings, conn, product, now=None):
    if not settings.entsoe_token:
        raise ValueError('ENTSOE_API_TOKEN is not configured')
    now = now or datetime.now(UTC)
    last = await (await conn.execute('SELECT received_at,status FROM collection_attempts WHERE source_id=%s ORDER BY received_at DESC,id DESC LIMIT 1', (source(product),))).fetchone()
    if last and (now-last[0]).total_seconds() < settings.entsoe_poll_seconds:
        if last[1] != 'success':
            raise ValueError('ENTSO-E retry not due; previous product attempt has not succeeded')
        return None
    start = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)-timedelta(days=1)
    end = start+timedelta(days=3)
    params = parameters(product, start, end)
    try:
        response = await client.get(URL, params=params, headers={'SECURITY_TOKEN': settings.entsoe_token}, timeout=settings.request_timeout, follow_redirects=False)
        body = response.content
        if len(body) > 10*1024*1024 or settings.entsoe_token.encode() in body:
            raise ValueError('ENTSO-E response is oversized or echoes the credential')
    except (httpx.HTTPError, ValueError, TimeoutError):
        await conn.execute("INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'failed','ENTSOE acquisition failed')", (source(product),))
        await conn.commit()
        raise ValueError('ENTSO-E acquisition failed') from None
    sha = hashlib.sha256(body).hexdigest()
    await conn.execute("INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/xml') ON CONFLICT DO NOTHING", (sha,len(body)))
    # The transaction starts before HTTP; now() would predate the response document.
    receipt = await (await conn.execute("INSERT INTO collection_attempts(source_id,http_status,payload_sha256,status,received_at) VALUES (%s,%s,%s,%s,clock_timestamp()) RETURNING id,received_at", (source(product),response.status_code,sha,'received' if response.is_success else 'failed'))).fetchone()
    await conn.commit()
    if not response.is_success:
        raise ValueError(f'ENTSO-E HTTP status {response.status_code}')
    return {'_body': body, 'product': product, 'xml': body.decode('utf-8-sig'), 'sha256': sha, 'attempt_id': receipt[0],
            'snapshot_at': receipt[1].isoformat(), 'start': start.isoformat(), 'end': end.isoformat(), 'parameters': params}


def text(node, path, default=None):
    found = node.find(path)
    return found.text.strip() if found is not None and found.text else default


def instant(value):
    stamp = datetime.fromisoformat(value)
    if stamp.tzinfo is None:
        raise ValueError('ENTSO-E time requires an explicit timezone')
    return stamp.astimezone(UTC)


def normalize(bundle):
    product = bundle['product']; spec = PRODUCTS[product]
    start, end, received = (instant(bundle[k]) for k in ('start','end','snapshot_at'))
    if end-start != timedelta(days=3) or bundle['parameters'] != parameters(product,start,end):
        raise ValueError('Unexpected ENTSO-E query window or product')
    if start.hour or start.minute or start.second or start.microsecond:
        raise ValueError('ENTSO-E query must begin at UTC midnight')
    xml = bundle['xml']
    if len(xml.encode()) > 10*1024*1024 or '<!DOCTYPE' in xml.upper() or '<!ENTITY' in xml.upper():
        raise ValueError('Unsupported ENTSO-E XML declarations or size')
    root = ET.fromstring(xml)
    for element in root.iter(): element.tag = element.tag.split('}')[-1]
    if root.tag == 'Acknowledgement_MarketDocument':
        raise ValueError('ENTSO-E acknowledgement contains no publishable product data')
    if root.tag not in ('Publication_MarketDocument','GL_MarketDocument') or text(root,'type') != spec['type']:
        raise ValueError('Wrong ENTSO-E document type')
    if product != 'price' and text(root,'process.processType') != 'A16':
        raise ValueError('Expected realised load/generation')
    if text(root,'docStatus/value') == 'A13':
        raise ValueError('Withdrawn ENTSO-E document')
    created = instant(text(root,'createdDateTime'))
    if created > received:
        raise ValueError('Document creation exceeds acquisition time')
    document_id, revision = text(root,'mRID'), text(root,'revisionNumber')
    if not document_id or not revision or not revision.isdigit():
        raise ValueError('Missing ENTSO-E document identity/revision')
    rows, seen = [], set()
    for series in root.findall('TimeSeries'):
        series_id = text(series,'mRID'); curve = text(series,'curveType')
        if not series_id or curve not in ('A01','A03') or text(series,'cancelledTS') == 'A01':
            raise ValueError('Unknown/cancelled ENTSO-E series')
        dimensions = {'area_eic': spec['area'], 'series_id': series_id, 'snapshot_sha256': bundle['sha256']}
        if product == 'price':
            if (text(series,'in_Domain.mRID') != spec['area'] or text(series,'out_Domain.mRID') != spec['area']
                    or text(series,'currency_Unit.name') != 'EUR' or text(series,'price_Measure_Unit.name') != 'MWH'
                    or text(series,'contract_MarketAgreement.type','A01') != 'A01' or text(series,'businessType') != 'A62'):
                raise ValueError('Expected EUR/MWh day-ahead DE-LU prices')
            value_tag = 'price.amount'
        else:
            if text(series,'quantity_Measure_Unit.name') != 'MAW':
                raise ValueError('Expected ENTSO-E MW quantities')
            if product == 'load':
                if text(series,'outBiddingZone_Domain.mRID') != spec['area'] or text(series,'businessType') != 'A04':
                    raise ValueError('Unexpected total-load area/business type')
            else:
                incoming, outgoing = text(series,'inBiddingZone_Domain.mRID'), text(series,'outBiddingZone_Domain.mRID')
                if (bool(incoming) == bool(outgoing) or (incoming or outgoing) != spec['area']
                        or text(series,'objectAggregation') != 'A08' or text(series,'businessType') not in ('A01','A93','A94')):
                    raise ValueError('Unexpected generation area or aggregation')
                psr = text(series,'MktPSRType/psrType')
                if not psr or not re.fullmatch(r'B\d{2}',psr):
                    raise ValueError('Missing production type')
                dimensions.update(psr_type=psr, direction='generation' if incoming else 'consumption')
            value_tag = 'quantity'
        periods = series.findall('Period')
        if not periods:
            raise ValueError('ENTSO-E series has no periods')
        for period in periods:
            pstart, pend = instant(text(period,'timeInterval/start')), instant(text(period,'timeInterval/end'))
            resolution = text(period,'resolution')
            minutes = {'PT15M':15,'PT30M':30,'PT60M':60}.get(resolution)
            if not minutes or not timedelta(0) < pend-pstart <= timedelta(days=4):
                raise ValueError('Unexpected ENTSO-E resolution/period')
            step = timedelta(minutes=minutes); slots = (pend-pstart)/step
            if not slots.is_integer() or slots > 400 or pstart < start-timedelta(days=1) or pend > end+timedelta(days=1):
                raise ValueError('Invalid ENTSO-E period alignment/bounds')
            points = {}
            for point in period.findall('Point'):
                pos = int(text(point,'position','0'))
                if not 1 <= pos <= int(slots) or pos in points:
                    raise ValueError('Invalid/duplicate ENTSO-E position')
                raw = text(point,value_tag)
                try: value = Decimal(raw) if raw is not None else None
                except InvalidOperation: raise ValueError('Invalid ENTSO-E numeric value') from None
                if value is not None and (not value.is_finite() or (product != 'price' and value < 0)):
                    raise ValueError('Invalid ENTSO-E price/power')
                points[pos] = value
            if not points:
                raise ValueError('ENTSO-E period contains no points')
            carried = None
            for pos in range(1,int(slots)+1):
                if pos in points: carried = points[pos]
                value = points.get(pos) if curve == 'A01' else carried
                valid_at = pstart+(pos-1)*step; interval_end = valid_at+step
                if valid_at < start or interval_end > end: continue
                key = (series_id,valid_at)
                if key in seen: raise ValueError('Overlapping ENTSO-E intervals')
                seen.add(key)
                rows.append({'dimensions': {**dimensions,'resolution':resolution}, 'start':valid_at, 'end':interval_end,
                    'value':value,'quality':'valid' if value is not None else 'missing',
                    'evidence': {'document_id':document_id,'document_revision':revision,'document_created_at':created.isoformat(),
                                 'series_id':series_id,'curve_type':curve,'business_type':text(series,'businessType')}})
                if len(rows)>20000: raise ValueError('ENTSO-E product exceeds interval cap')
    if not rows: raise ValueError('ENTSO-E document has no intervals in query window')
    return rows


async def persist(conn,bundle,rows):
    product=bundle['product'];spec=PRODUCTS[product];sid=source(product)
    async with conn.transaction():
        await conn.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(sid,))
        receipt=await (await conn.execute("SELECT p.body,a.payload_sha256,a.received_at FROM collection_attempts a JOIN collected_payloads p ON p.sha256=a.payload_sha256 WHERE a.id=%s AND a.source_id=%s AND a.http_status=200 AND a.status IN ('received','success')",(bundle['attempt_id'],sid))).fetchone()
        raw = bundle.get('_body', receipt[0] if receipt else None)
        if (not receipt or raw is None or bytes(raw).decode('utf-8-sig') != bundle['xml'] or receipt[1] != bundle['sha256']
                or hashlib.sha256(bytes(raw)).hexdigest()!=receipt[1] or receipt[2]!=instant(bundle['snapshot_at']) or rows!=normalize(bundle)):
            raise ValueError('ENTSO-E input differs from archived receipt')
        unchanged=await (await conn.execute("SELECT EXISTS(SELECT 1 FROM collection_attempts WHERE source_id=%s AND payload_sha256=%s AND status='success')",(sid,receipt[1]))).fetchone()
        if unchanged[0]:
            await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s",(bundle['attempt_id'],))
            return 0
        entity='environment:entsoe:'+product
        metadata={'area_eic':spec['area'],'area_label':spec['label'],'scope':'bidding_zone' if product=='price' else 'country'}
        await conn.execute("INSERT INTO entities(id,name,entity_type,metadata) VALUES (%s,%s,'energy_area',%s) ON CONFLICT(id) DO UPDATE SET metadata=entities.metadata || EXCLUDED.metadata,updated_at=NOW()",(entity,'ENTSO-E '+spec['label'],Jsonb(metadata)))
        for row in rows:
            provenance={**row['evidence'],'license':'CC-BY-4.0','attribution':'ENTSO-E Transparency Platform / reporting data providers',
                'source_url':URL,'spatial_reference':metadata,'publication_type':'day_ahead_market_price' if product=='price' else 'published_actual_may_include_estimates',
                'request_parameters':bundle['parameters'],'snapshot_at':bundle['snapshot_at']}
            await conn.execute("SELECT write_environment_measurement(%s,%s,%s,%s,'observation',%s,%s,%s::numeric,%s,%s,%s,%s,%s,%s)",
                (entity,spec['metric'],spec['unit'],sid,Jsonb(row['dimensions']),row['start'],row['value'],bundle['attempt_id'],Jsonb(provenance),row['quality'],row['start'],row['end'],'state' if product=='price' else 'rate'))
        await conn.execute("UPDATE collection_attempts SET status='success' WHERE id=%s",(bundle['attempt_id'],))
    return len(rows)
