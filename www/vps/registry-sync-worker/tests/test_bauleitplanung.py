import json

import pytest
from bauleitplanung import export_time, page_url, parse_page

SOURCE = {
    'url': 'https://example.test/wfs', 'type_name': 'ft1:Planung',
    'namespaces': 'xmlns(ft1,http://example.test/ns)', 'bbox': [49.55, 8.3, 49.8, 8.65],
    'municipalities': {'06431013': 'Lampertheim', '06431005': 'Bürstadt'},
    'attribution': 'Kreis Bergstraße', 'license': 'dl-de/by-2-0',
}
RING = [[8.42, 49.65], [8.43, 49.65], [8.43, 49.66], [8.42, 49.65]]


def feature(identifier='PLANUNG_1', **changes):
    props = {'AGS': '06431013', 'GEMEINDE': 'Lampertheim', 'GEMARKUNG': 'Hofheim',
             'NAME': '049-00- Im Entenbad', 'NAME_A': '006-31-13-3006-004-049-00',
             'TYP': 'Bebauungsplan', 'RECHTSKR': '1993-12-24', 'SATZBESCHL': '1992-08-14',
             'AUFSTELLB': '', 'EINLEITB': '', 'OFFENLEGB': '', 'RPGENEHM': '-',
             'PLANZEICHN': 'https://buergergis.kreis-bergstrasse.de/x_G.pdf', 'PLANTEXT': '',
             'BEGRUEND': '', 'AKT_DATENS': '2021-01-20', 'AKT_DATENB': 20261014124335.0}
    props.update(changes)
    return {'type': 'Feature', 'id': identifier, 'properties': props,
            'geometry': {'type': 'MultiPolygon', 'coordinates': [[RING]]}}


def page(*features):
    return json.dumps({'type': 'FeatureCollection', 'features': list(features)}).encode()


def test_page_request_is_bounded_geojson_in_lat_lon_order():
    url = page_url(SOURCE, 1000)
    assert 'STARTINDEX=1000' in url and 'COUNT=1000' in url
    assert 'BBOX=49.55%2C8.3%2C49.8%2C8.65' in url
    assert 'OUTPUTFORMAT=application%2Fgeo%2Bjson' in url


def test_plans_keep_official_fields_and_only_configured_municipalities():
    other = feature('PLANUNG_2', AGS='06431001', GEMEINDE='Bensheim')
    ids, plans = parse_page(page(feature(), other), SOURCE)
    assert ids == ['PLANUNG_1', 'PLANUNG_2']
    [plan] = plans
    assert plan['municipality'] == 'Lampertheim' and plan['district'] == 'Hofheim'
    assert plan['status'] == 'rechtskraeftig' and plan['legal_since'] == '1993-12-24'
    assert plan['text_url'] is None and plan['justification_url'] is None
    assert plan['geometry'] == {'type': 'Polygon', 'coordinates': [RING]}
    assert plan['license'] == 'dl-de/by-2-0'


def test_status_comes_only_from_cadastre_dates():
    _, [pending] = parse_page(page(feature(RECHTSKR='', OFFENLEGB='2026-05-01')), SOURCE)
    assert pending['status'] == 'im_verfahren'
    _, [unknown] = parse_page(page(feature(RECHTSKR='', SATZBESCHL='')), SOURCE)
    assert unknown['status'] is None and unknown['status_label'] == 'Status nicht angegeben'


@pytest.mark.parametrize('change', [
    {'PLANZEICHN': 'http://insecure.test/plan.pdf'},
    {'GEMEINDE': 'Bürstadt'},
    {'NAME': ''},
    {'RECHTSKR': '24.12.1993'},
])
def test_invalid_provider_values_are_rejected(change):
    with pytest.raises(ValueError):
        parse_page(page(feature(**change)), SOURCE)


def test_swapped_axis_order_is_rejected():
    swapped = feature()
    swapped['geometry']['coordinates'] = [[[[y, x] for x, y in RING]]]
    with pytest.raises(ValueError):
        parse_page(page(swapped), SOURCE)


def test_unexpected_response_and_missing_identifiers_are_rejected():
    with pytest.raises(ValueError):
        parse_page(b'{"type":"ExceptionReport"}', SOURCE)
    with pytest.raises(ValueError):
        parse_page(page(feature(identifier='')), SOURCE)


def test_export_time_is_the_cadastre_timestamp():
    assert export_time([page(feature())]).isoformat() == '2026-10-14T12:43:35+00:00'
