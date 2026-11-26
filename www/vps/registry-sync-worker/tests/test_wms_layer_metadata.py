import pytest
from map_tiles import data_stand, resolve_layer

CAPABILITIES = b"""<?xml version="1.0"?>
<WMS_Capabilities xmlns="http://www.opengis.net/wms" version="1.3.0"><Capability><Layer><Title>wms</Title>
  <Layer><Title>Festnetz</Title>
    <Layer><Title>Privathaushalte</Title>
      <Layer><Title>\xe2\x89\xa5 1000 Mbit/s</Title>
        <Layer><Name>Festnetz__100m_Gitter__Privathaushalte_1000_37730</Name>
          <Title>Festnetz, 100m Gitter, Privathaushalte \xe2\x89\xa5 1000 Mbit/s</Title></Layer>
      </Layer>
    </Layer>
    <Layer><Title>Alle Unternehmen</Title>
      <Layer><Title>\xe2\x89\xa5 1000 Mbit/s</Title>
        <Layer><Name>Festnetz__100m_Gitter__Alle_1000_23376</Name>
          <Title>Festnetz, 100m Gitter, Alle Unternehmen \xe2\x89\xa5 1000 Mbit/s</Title></Layer>
      </Layer>
    </Layer>
  </Layer>
</Layer></Capability></WMS_Capabilities>"""
PATH = ['Festnetz', 'Privathaushalte', '≥ 1000 Mbit/s', 'Festnetz, 100m Gitter, Privathaushalte ≥ 1000 Mbit/s']


def test_layer_is_found_by_title_path_not_by_renumbered_name():
    assert resolve_layer(CAPABILITIES, PATH) == 'Festnetz__100m_Gitter__Privathaushalte_1000_37730'


def test_missing_or_ambiguous_layer_fails():
    with pytest.raises(ValueError):
        resolve_layer(CAPABILITIES, ['Festnetz', 'Unbekannt'])
    with pytest.raises(ValueError):
        resolve_layer(CAPABILITIES, ['≥ 1000 Mbit/s'])


def test_data_stand_uses_newest_dated_download():
    listing = (b'<a href="Versorgungsdaten_Gitterzellen_Stand_20251231_gpkg.zip">'
               b'<a href="Versorgungsdaten_Gitterzellen_Stand_20260630_gpkg.zip">')
    stand = data_stand(listing, r'Versorgungsdaten_Gitterzellen_Stand_(\d{8})')
    assert stand.date().isoformat() == '2026-06-30'
    with pytest.raises(ValueError):
        data_stand(b'no date', r'Stand_(\d{8})')
