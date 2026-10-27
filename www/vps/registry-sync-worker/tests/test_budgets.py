import pytest
from budgets import parse_summary

COVER = 'Haushaltsplan für das Haushaltsjahr 2026 Beschluss vom 11.02.2026'


def summary(revenue='24.166.774', expense='26.800.450', balance='- 2.572.977', deficit='1.972.977'):
    return f'''im Ergebnishaushalt
    im ordentlichen Ergebnis
    mit dem Gesamtbetrag der Erträge auf {revenue} EUR
    mit dem Gesamtbetrag der Aufwendungen auf {expense} EUR
    mit einem Saldo von {balance} EUR
    im außerordentlichen Ergebnis
    mit dem Gesamtbetrag der Erträge auf 600.000 EUR
    mit dem Gesamtbetrag der Aufwendungen auf O EUR
    mit einem Saldo von 600.000 EUR
    mit einem Fehlbedarf von {deficit} EUR
    im Finanzhaushalt'''


def test_printed_source_inconsistency_is_not_silently_corrected():
    adopted, data, issues = parse_summary(COVER,summary(),2026)
    assert adopted.year == 2026
    assert data['ordinary_revenue_eur'] == 24166774
    assert data['ordinary_balance_eur'] == -2572977
    assert issues == ['ordinary_totals_do_not_reconcile']


def test_reconciled_plan_and_zero_are_accepted():
    _,data,issues = parse_summary(COVER,summary(balance='-2.633.676',deficit='2.033.676'),2026)
    assert not issues
    assert data['extraordinary_expense_eur'] == 0


@pytest.mark.parametrize('cover,page,year',[
    (COVER.replace('Beschluss vom','Entwurf vom'),summary(),2026),
    (COVER,summary(),2025),
    (COVER,summary().replace('600.000 EUR',''),2026),
    (COVER,summary().replace('im Finanzhaushalt','anderer Abschnitt'),2026),
])
def test_ambiguous_or_draft_document_is_rejected(cover,page,year):
    with pytest.raises(ValueError):
        parse_summary(cover,page,year)


@pytest.mark.asyncio
async def test_inconsistent_document_is_archived_but_not_published_as_budget():
    from datetime import UTC, datetime
    from unittest.mock import AsyncMock, MagicMock, patch

    import httpx
    from budgets import import_biblis_budget
    conn=MagicMock()
    cursor=MagicMock();cursor.fetchone=AsyncMock(return_value=(1,))
    conn.execute=AsyncMock(return_value=cursor);conn.commit=AsyncMock()
    source={'id':'budget','url':'https://www.biblis.eu/rathaus/ortsrecht/haushaltsplan/'}
    def provider(request):
        return httpx.Response(200,text='<a href="https://www.biblis.eu/budget/haushaltsplan-2026.pdf">Budget</a>') if request.url.path.endswith('/') else httpx.Response(200,content=b'PDF fixture')
    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        with patch('budgets.parse_pdf',return_value=(datetime(2026,2,11,tzinfo=UTC),{
            'ordinary_revenue_eur':24166774,'ordinary_expense_eur':26800450,'ordinary_balance_eur':-2572977,
        },['ordinary_totals_do_not_reconcile'])):
            assert await import_biblis_budget(conn,client,source)=='partial'
    publications=[c.args[1][0] for c in conn.execute.call_args_list if 'INSERT INTO collected_datasets\n' in c.args[0]]
    assert publications==['finance/budget-review/biblis']
    assert any('INSERT INTO collected_payloads' in c.args[0] for c in conn.execute.call_args_list)
    assert any('DELETE FROM collected_datasets' in c.args[0] for c in conn.execute.call_args_list)
    status_update=next(c for c in conn.execute.call_args_list if 'UPDATE collection_attempts' in c.args[0])
    assert '60,699 EUR' in status_update.args[1][1]
