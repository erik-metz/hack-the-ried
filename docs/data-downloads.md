# Daten und Quellen

`/daten` bündelt Downloads und den Link zur FastAPI-Dokumentation. Der kurze
Mitmachblock steht am Anfang; API-Client-Import und Satellitendownloads sind
aufklappbar. Regionale Kataloge, Originalquellen und Erfassungsstatus stehen unter
`/quellen`. Berechnete Datenvolumina aus pauschalen Annahmen werden nicht angezeigt.

## CSV- und Parquet-Pakete

`GET /api/v1/downloads?sample=true&format=csv` liefert ein ZIP mit
`entities.csv`, `measurement_definitions.csv`, `readings.csv`, README und
Manifest. `format=parquet` liefert dieselben Tabellen als Parquet-Dateien.
Ohne `format` gilt aus Kompatibilitätsgründen CSV. Die Stichprobe enthält bis zu
300 Messgrößen mit je einem zuletzt gespeicherten Wert und den dazugehörigen Objekten.

`GET /api/v1/downloads?topic=temperature&start=2026-09-01&end=2026-09-30&format=parquet`
exportiert den öffentlichen kanonischen Bestand des gewählten Themas für bis
zu 31 inklusive UTC-Kalendertage. Themen: `all`, `temperature`, `mobility`,
`roadworks`, `humidity`, `precipitation`, `water` und `soil`. Temperaturen umfassen auch Boden- und Modellwerte; Basis, Dimensionen
und Qualität bleiben enthalten. Mobilität umfasst skalare Verkehrs-, Park-,
Lade- und Bewegungsdaten, keine vollständigen GTFS-Dateien.

Baustellen/Sperrungen werden als zusätzliche Tabellen `street_closures` und
`traffic_incidents` exportiert, wenn ihre Gültigkeit den Zeitraum überlappt.
Die Meldungen enthalten ihren zuletzt gespeicherten Stand, keine historische
Versionsfolge. Die drei Kerntabellen bleiben in jedem Paket enthalten; bei einem
reinen Meldungsexport haben sie gegebenenfalls nur Spaltenüberschriften.

Vollständige CSV-Exporte laufen ohne Zeilenlimit über Servercursor in einer konsistenten
Datenbanktransaktion. CSV-ZIP-Inhalte werden paketweise gestreamt. Parquet wird in
UTC- und Mikrosekunden-Zeitstempelspalten geschrieben und in temporären Dateien
mit begrenztem Arbeitsspeicher erzeugt. IDs und Dezimalwerte bleiben als Text
exakt erhalten. Ein abgeschlossenes
Paket enthält `manifest.json` mit `complete: true` und den Zeilenzahlen. Ein
unterbrochener Download muss erneut gestartet werden. Die Browseroberfläche lädt
das ZIP direkt über die native Downloadfunktion, ohne die ganze Datei zuerst
als Blob im Arbeitsspeicher zu sammeln. `check=true` prüft zuvor die Verfügbarkeit
und liefert JSON statt eines ZIPs. Ausgeblendete und gelöschte Stationen werden
gefiltert, Dezimalwerte ohne Float-Konvertierung exportiert. CSV-Text mit
Formelzeichen wird für Tabellenprogramme mit einem Apostroph geschützt.

## Veröffentlichung

Backend mit dem neuen Downloads-Router vor dem Frontend bereitstellen. Die
kanonischen Tabellen und deren bestehende Migration müssen eingerichtet sein;
der Download aktiviert keinen Read-Cutover und startet keinen History-Backfill.
Noch nicht migrierte Daten gehören nicht zum kanonischen Exportbestand.

Die UploadThing-Monatsarchive veröffentlichen je Teil separate CSV- und Parquet-ZIPs.
Beide Formate enthalten `entities`, `measurement_definitions` und `readings` sowie README und
Manifest. Jeder ZIP-Teil enthält die zu seinen Messwerten gehörenden Objekte und
Messgrößen; beim Zusammenführen mehrerer Teile Metadaten nach `id` deduplizieren.
Der Archiv-Worker übernimmt fehlende öffentliche Legacy-Sensormesswerte des
Zeitraums transaktional in den kanonischen Bestand, ohne vorhandene Werte zu
überschreiben, und exportiert anschließend alle öffentlichen kanonischen Werte.
Er aktiviert weder Shadow-Writes noch einen API-Read-Cutover. Widersprüchliche
Legacy-Duplikate stoppen den Export; identische Schlüssel werden dedupliziert.
Alte Archivformate werden beim nächsten Worker-Lauf automatisch ersetzt, erst
nach erfolgreicher Veröffentlichung der neuen Dateien. Der öffentliche Katalog
nennt `format_version`; siehe [Archiv-Worker](../www/vps/archive-worker/README.md).

## Prüfung

Frontend: `node --test tests/dataDownloads.test.mjs tests/sources.test.mjs tests/security.test.mjs`,
TypeScript und ESLint für die betroffenen Komponenten.

Backend: `python -m unittest discover -s tests -p test_data_exports.py -v` im
Verzeichnis `www/vps/api/v1`; mit `COLLECTOR_TEST_DATABASE_URL` gegen eine
wegwerfbare lokale PostgreSQL-Datenbank. Die Tests prüfen CSV-Präzision,
Sichtbarkeit, Verknüpfungen, Themen, Gültigkeitsintervalle, Verfügbarkeitsprüfung,
Parquet-Typen und Dezimalpräzision sowie ZIPs über mehrere Cursor-Batches.
