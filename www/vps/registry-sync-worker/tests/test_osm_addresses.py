
import pytest
from osm_addresses import extract_addresses


def test_regional_nodes_and_way_centers_without_external_queries(tmp_path):
    path = tmp_path / 'fixture.osm'
    path.write_text('''<osm version="0.6">
    <node id="1" lat="49.6" lon="8.4"><tag k="addr:city" v="Biblis"/><tag k="addr:street" v="One"/><tag k="addr:housenumber" v="2"/></node>
    <node id="10" lat="49.64" lon="8.45"><tag k="railway" v="level_crossing"/><tag k="name" v="Test crossing"/><tag k="crossing:barrier" v="half"/></node>
    <node id="14" lat="49.64" lon="8.45"><tag k="railway" v="crossing"/><tag k="crossing:barrier" v="no"/></node>
    <node id="15" lat="49.64" lon="8.45"><tag k="railway" v="level_crossing"/></node>
    <node id="16" lat="49.64" lon="8.45"><tag k="highway" v="crossing"/><tag k="crossing:barrier" v="yes"/></node>
    <node id="11" lat="52" lon="10"><tag k="railway" v="level_crossing"/></node>
    <node id="2" lat="49.62" lon="8.42"/>
    <node id="3" lat="52" lon="10"><tag k="addr:city" v="Biblis"/><tag k="addr:street" v="Outside"/><tag k="addr:housenumber" v="1"/></node>
    <node id="13" lat="49.61" lon="8.41"><tag k="amenity" v="school"/><tag k="name" v="Testschule"/></node>
    <node id="12" lat="49.61" lon="8.41"><tag k="power" v="generator"/></node>
    <way id="21"><nd ref="1"/><nd ref="10"/><nd ref="2"/><tag k="railway" v="rail"/></way>
    <way id="20"><nd ref="1"/><nd ref="2"/><nd ref="12"/><nd ref="1"/><tag k="landuse" v="farmland"/></way>
    <way id="5"><nd ref="1"/><nd ref="2"/><tag k="addr:city" v="Biblis"/><tag k="addr:street" v="Two"/><tag k="addr:housenumber" v="4"/></way>
    <way id="6"><nd ref="999"/><tag k="addr:city" v="Biblis"/><tag k="addr:street" v="Missing"/><tag k="addr:housenumber" v="4"/></way>
    </osm>''')
    source = {'municipalities': ['Biblis'], 'bbox': [49.55, 8.3, 49.8, 8.65]}
    data = extract_addresses(path, source)
    assert data['map_layers']['places']['features'][0]['properties']['name'] == 'Testschule'
    assert data['map_layers']['crops']['features'][0]['geometry']['type'] == 'Polygon'
    assert len(data['map_layers']['energy']['features']) == 1
    assert len(data['crossings']['rail_edges']) == 2
    assert data['crossings']['inventory_version'] == 3
    assert len(data['crossings']['features']) == 1
    crossing = data['crossings']['features'][0]
    assert crossing['geometry']['coordinates'] == [8.45, 49.64]
    assert crossing['properties']['status'] == 'unknown'
    assert [x['id'] for x in data['elements']] == [1, 5]
    assert data['elements'][1]['center']['lat'] == pytest.approx(49.61)
    assert data['elements'][1]['center']['lon'] == pytest.approx(8.41)
    with pytest.raises(ValueError, match='no matching'):
        extract_addresses(path, {**source, 'municipalities': ['Other']})


def test_suffix_geometry_and_unsupported_compound_addresses(tmp_path):
    path = tmp_path / 'suffix.osm'
    path.write_text('''<osm version="0.6">
    <node id="1" lat="49.6" lon="8.4"><tag k="addr:city" v="Biblis"/><tag k="addr:street" v="One"/><tag k="addr:housenumber" v="9 c"/></node>
    <node id="2" lat="49.62" lon="8.42"/>
    <node id="3" lat="49.6" lon="8.4"><tag k="addr:city" v="Biblis"/><tag k="addr:street" v="Bad"/><tag k="addr:housenumber" v="8-10"/></node>
    <way id="5"><nd ref="1"/><nd ref="2"/><tag k="addr:city" v="Biblis"/><tag k="addr:street" v="Two"/><tag k="addr:housenumber" v="8A"/></way>
    </osm>''')
    data = extract_addresses(path, {'municipalities': ['Biblis'], 'bbox': [49.55, 8.3, 49.8, 8.65]})
    assert data['address_inventory_version'] == 2
    assert [(x['id'], x['tags']['addr:housenumber']) for x in data['elements']] == [(1, '9 c'), (5, '8A')]
    assert data['elements'][1]['center'] == {'lat': pytest.approx(49.61), 'lon': pytest.approx(8.41)}


def test_wlan_places_without_access_tag_and_alongside_their_primary_layer(tmp_path):
    path = tmp_path / 'wifi.osm'
    path.write_text('''<osm version="0.6">
    <node id="1" lat="49.6" lon="8.4"><tag k="addr:city" v="Biblis"/><tag k="addr:street" v="One"/><tag k="addr:housenumber" v="2"/></node>
    <node id="2" lat="49.61" lon="8.41"><tag k="amenity" v="cafe"/><tag k="name" v="Dorfcafe"/><tag k="internet_access" v="wlan"/><tag k="internet_access:fee" v="no"/></node>
    <node id="3" lat="49.61" lon="8.41"><tag k="tourism" v="museum"/><tag k="name" v="Heimatmuseum"/><tag k="internet_access" v="wlan"/></node>
    <node id="4" lat="49.61" lon="8.41"><tag k="amenity" v="restaurant"/><tag k="internet_access" v="no"/></node>
    <node id="5" lat="49.61" lon="8.41"><tag k="amenity" v="cafe"/><tag k="internet_access" v="wlan"/><tag k="internet_access:access" v="private"/></node>
    <node id="6" lat="49.61" lon="8.41"><tag k="amenity" v="restaurant"/><tag k="internet_access" v="terminal"/></node>
    </osm>''')
    data = extract_addresses(path, {'municipalities': ['Biblis'], 'bbox': [49.55, 8.3, 49.8, 8.65]})
    wifi = data['map_layers']['wifi']['features']
    assert [f['properties']['name'] for f in wifi] == ['Dorfcafe', 'Heimatmuseum']
    assert wifi[0]['properties']['fee'] == 'no'
    assert [f['properties']['name'] for f in data['map_layers']['places']['features']] == ['Heimatmuseum']
