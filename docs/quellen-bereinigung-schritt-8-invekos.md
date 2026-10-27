# Schritt 8: INVEKOS Hessen

Der WFS-Abruf lieferte HTTP 200. Die anschließende Speicherung scheiterte mit `UndefinedFunction`: Python-Fließkommazahlen wurden als `double precision` übergeben, die Funktion `write_measurement` erwartet `numeric`. Fläche und Koordinaten werden nun ausdrücklich als `numeric` gebunden.

Fehlende Flächen werden als fehlend gespeichert; fehlende Bio-Angaben bleiben unbekannt. Referenzjahr und Gültigkeit stammen aus der Quelle. Abrufzeit und fachlicher Datenstand werden getrennt ausgewiesen. Ungültige oder abgeschnittene GeoJSON-Antworten ersetzen keinen veröffentlichten Datensatz. Erfolgreiche Abrufe melden die tatsächlich verarbeiteten Parzellen.

## Prüfung vor Veröffentlichung

- Zwei PostgreSQL-Integrationstests prüfen echte Speicherung, fehlende Werte, Veröffentlichungen und den Schutz vor abgeschnittenen Antworten; zusammen mit dem bestehenden Parsertest: drei Tests erfolgreich.
- Simulation mit der archivierten echten Antwort: 4.877 gelieferte Features, nach bestehendem räumlichem Filter 4.766 Parzellen, 14.298 gespeicherte Messwerte, 10.484,36 ha. Referenzjahr 2025; Bio-Angabe bei allen 4.766 Parzellen unbekannt.
- Gesamter Registry-Testlauf lokal: 256 erfolgreich; ein anderer GTFS-Test benötigt die lokal nicht installierte TimescaleDB-Erweiterung. Der vollständige Lauf wird zusätzlich in der vorgesehenen CI mit TimescaleDB geprüft.
- Ruff für geänderte Python-Dateien und `git diff --check` erfolgreich.

## Veröffentlichung und Produktionsnachweis

- Reparatur-Commit `1a192768c8303942d5ee2626553574aa34dc330d` auf `main` gepusht.
- [FastAPI & Docker CI/CD](https://github.com/erik-metz/hack-the-ried/actions/runs/37769638890) für genau diesen Commit vollständig erfolgreich, einschließlich TimescaleDB-Verträgen und aller 17 Container-Builds samt GHCR-Veröffentlichung.
- Nur Registry-Worker aktualisiert: `ghcr.io/erik-metz/hack-the-ried-registry-sync-worker@sha256:ce8e95d52c16479afde27b9a038e556e77fcadda916ced69ea68f8535fd95fe6`, festgehalten in `/root/docker-compose.invekos.yml`. Datei-Prüfwert von `invekos.py` stimmt mit geprüftem Code überein.
- Beim Container-Austausch meldete Docker zunächst eine noch laufende Entfernung. Der anschließende Start und die Wiederherstellung des regulären Containernamens waren erfolgreich; Registry-Worker läuft.
- Gezielter Live-Abruf: empfangen am 8. Oktober 2026 um 11:31:50 UTC, erfolgreich verarbeitet um 11:32:57 UTC. HTTP 200, 4.766 Parzellen, 14.298 Messwerte für genau diesen Snapshot und zwei veröffentlichte Datensätze.
- Öffentliche Status-API bestätigt `success`, `completion_recorded=true`, `item_count=4766`, Einheit `parcels`, zwei Veröffentlichungen und keinen Fehler.
- Fachlicher Datenstand bleibt 2025; Bio-Angabe bei allen Parzellen unbekannt. Der bestehende räumliche Filter wählt 4.766 der 4.877 gelieferten Features aus.
- Umwelt-Collector weiterhin auf seinem bisherigen Digest und gesund. Deutsche-Bahn-Quellen bleiben übersprungen.
- Keine Frontend-Dateien geändert; daher kein Frontend-CI-Lauf für diesen Schritt vorgesehen.
