from chargers import parse_register

HEADER = ("Ladeeinrichtungs-ID;Betreiber;Anzeigename (Karte);Status;Art der Ladeeinrichtung;"
          "Anzahl Ladepunkte;Nennleistung Ladeeinrichtung [kW];Straße;Hausnummer;Ort;"
          "Kreis/kreisfreie Stadt;Breitengrad;Längengrad")
ROW = "123;Stadtwerke Bürstadt;Rathaus;In Betrieb;Normalladeeinrichtung;2;22,0;Rathausstraße;2;Bürstadt;Bergstraße;49,643;8,457"
REGISTER = f"Ladesäulenregister\nLetzte Aktualisierung vom: 12.11.2026\n{HEADER}\n{ROW}\n"
BBOX = (49.5, 8.25, 49.95, 8.7)


def test_register_is_read_in_utf8_and_windows_1252():
    for encoding in ("utf-8-sig", "cp1252"):
        source_time, stations = parse_register(REGISTER.encode(encoding), BBOX)
        assert source_time.date().isoformat() == "2026-11-12"
        assert [s["operator"] for s in stations] == ["Stadtwerke Bürstadt"]
        assert stations[0]["address"] == "Rathausstraße 2"
