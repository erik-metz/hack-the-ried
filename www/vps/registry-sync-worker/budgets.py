"""Official adopted-budget acquisition with explicit reconciliation gates."""
import asyncio
import io
import re
from datetime import UTC, datetime
from decimal import Decimal
from html import unescape
from urllib.parse import urljoin, urlsplit

from publications import acquire, publish


def parse_summary(cover, page, year):
    if not re.search(rf'Haushaltsjahr\s+{year}\b', cover):
        raise ValueError('Budget year does not match the official listing')
    adoption = re.search(r'Beschluss\s+vom\s+(\d{2}\.\d{2}\.\d{4})', cover)
    if not adoption:
        raise ValueError('Missing adopted-plan evidence')
    adopted_at = datetime.strptime(adoption[1],'%d.%m.%Y').replace(tzinfo=UTC)
    if adopted_at > datetime.now(UTC):
        raise ValueError('Future adoption date')
    section = re.search(r'im Ergebnishaushalt(.*?)im Finanzhaushalt',page,re.DOTALL)
    if not section or 'im ordentlichen Ergebnis' not in section[1] or 'im außerordentlichen Ergebnis' not in section[1]:
        raise ValueError('Budget summary layout changed')
    # Read seven printed monetary entries, never the years or future forecast columns.
    amounts = re.findall(r'(?<![\d.])(-?\s*(?:\d{1,3}(?:\.\d{3})*|\d+|O)(?:,\d{2})?)\s*EUR',section[1])
    if len(amounts) != 7:
        raise ValueError('Ambiguous budget summary amounts')
    values = [Decimal(re.sub(r'\s+','',v).replace('O','0').replace('.','').replace(',','.')) for v in amounts]
    keys = ['ordinary_revenue_eur','ordinary_expense_eur','ordinary_balance_eur',
            'extraordinary_revenue_eur','extraordinary_expense_eur','extraordinary_balance_eur','printed_deficit_eur']
    data = dict(zip(keys,values))
    issues = []
    for prefix in ['ordinary','extraordinary']:
        if data[f'{prefix}_revenue_eur'] - data[f'{prefix}_expense_eur'] != data[f'{prefix}_balance_eur']:
            issues.append(f'{prefix}_totals_do_not_reconcile')
    if data['ordinary_balance_eur'] + data['extraordinary_balance_eur'] != -data['printed_deficit_eur']:
        issues.append('printed_deficit_does_not_reconcile')
    if any(data[key] < 0 for key in ['ordinary_revenue_eur','ordinary_expense_eur',
                                   'extraordinary_revenue_eur','extraordinary_expense_eur']):
        issues.append('unexpected_negative_revenue_or_expense')
    return adopted_at, {key:float(value) for key,value in data.items()}, issues


def parse_pdf(body, year):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(body))
    if len(reader.pages) < 4 or len(reader.pages) > 1000:
        raise ValueError('Unexpected budget document size')
    cover = reader.pages[0].extract_text(extraction_mode='layout')
    summary = reader.pages[3].extract_text(extraction_mode='layout')
    return parse_summary(cover, summary, year)


def validation_error(issues, values):
    details = []
    for issue in issues:
        if issue == 'ordinary_totals_do_not_reconcile':
            required = ('ordinary_revenue_eur', 'ordinary_expense_eur', 'ordinary_balance_eur')
            if all(key in values for key in required):
                calculated = values['ordinary_revenue_eur'] - values['ordinary_expense_eur']
                reported = values['ordinary_balance_eur']
                difference = reported - calculated
                details.append(f'{issue} (reported balance differs by {difference:,.0f} EUR)')
            else:
                details.append(issue)
        else:
            details.append(issue)
    return ','.join(details) or None


async def import_biblis_budget(conn, client, source):
    listing, _, _ = await acquire(conn,client,source)
    links = re.findall(r'href=["\']([^"\']+haushaltsplan-(20\d{2})\.pdf(?:\?[^"\']*)?)["\']',listing.text)
    if not links:
        raise ValueError('No official annual budget document found')
    year = max(int(year) for _,year in links)
    urls = {urljoin(source['url'],unescape(link)) for link,y in links if int(y)==year}
    if len(urls)!=1:
        raise ValueError('Ambiguous current budget document')
    url = urls.pop()
    if urlsplit(url).hostname != 'www.biblis.eu':
        raise ValueError('Unexpected budget document host')
    response,digest,attempt = await acquire(conn,client,source,url)
    adopted,values,issues = await asyncio.to_thread(parse_pdf,response.content,year)
    report = {'municipality':'Biblis','municipality_id':'biblis','fiscal_year':year,
              'record_type':'plan','document_status':'adopted','adopted_at':adopted.isoformat(),
              'source_url':url,'source_page':4,'unit':'EUR','reported_values':values,
              'validation_issues':issues,'quality':'needs_review' if issues else 'reconciled'}
    async with conn.transaction():
        # Review publication preserves the original figures; it is not a normalized budget.
        await publish(conn,source,'finance/budget-review/biblis',report,digest,datetime.now(UTC))
        if issues:
            await conn.execute("DELETE FROM collected_datasets WHERE dataset='finance/adopted-budget/biblis' AND source_id=%s",(source['id'],))
        else:
            report['total_revenue_eur'] = values['ordinary_revenue_eur'] + values['extraordinary_revenue_eur']
            report['total_expense_eur'] = values['ordinary_expense_eur'] + values['extraordinary_expense_eur']
            report['net_result_eur'] = values['ordinary_balance_eur'] + values['extraordinary_balance_eur']
            await publish(conn,source,'finance/adopted-budget/biblis',report,digest,adopted)
        await conn.execute("UPDATE collection_attempts SET status=%s,error=%s WHERE id=%s",
                           ('partial' if issues else 'success',validation_error(issues,values),attempt))
    await conn.commit()
    return 'partial' if issues else 'success'
