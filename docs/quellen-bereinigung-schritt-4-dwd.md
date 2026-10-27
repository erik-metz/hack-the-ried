# Quellenbereinigung – Schritt 4: DWD RADOLAN und MOSMIX

Stand: 7. Oktober 2026.

## Ursachen und Korrekturen

Beide Anbieterdateien waren erreichbar und auswertbar. Der Collector entpackte
jedoch `NormalizedEnvironment` in zwei Listen und suchte die zusätzlichen
Radar- und Prognosefelder anschließend auf der einfachen Wetterliste. Dadurch
wurden die normalisierten DWD-Daten nicht an die Speicherung übergeben.
Die Übergabe verwendet jetzt die Felder des vollständigen Ergebnisses.

MOSMIX zählte außerdem Prognoseobjekte als Messwerte, auch wenn der produktive
Wetter-Schreibmodus `legacy` die eigentlichen Schreiboperationen ausließ.
Prognosen werden jetzt unabhängig vom Schalter für beobachtetes Wetter in
den bereits installierten Messdatenkern geschrieben. Nur tatsächlich
abgeschlossene Wertschreiboperationen zählen zur gemeldeten Menge. Der
numerische Funktionsparameter wird ausdrücklich als PostgreSQL `numeric`
übergeben. Die Daten bleiben Modellprognosen (`basis=model`); `RR1c` ist eine
Stundensumme mit Anfang, Ende und `semantics=period_total`.

RADOLAN verwendet die Header-Zeit und die dort deklarierte Präzision. Ungültige
Header erzeugen keine künstliche aktuelle Messzeit. Die unteren zwölf Bits
enthalten den Wert; Stationsinterpolationsflags werden vom Wert getrennt.
Fehlende, negative und Clutter-Pixel werden nicht als trockene Beobachtung
veröffentlicht. Tatsächliche Nullwerte bleiben 0 mm. Das konfigurierte nationale
900×900-Raster bleibt der unterstützte Gittertyp.

Grundlage für die RADOLAN-Wertcodierung:
[DWD-Unterstützungsdokument zum Binärformat](https://opendata.dwd.de/climate_environment/CDC/help/RADOLAN/Unterstuetzungsdokumente/Unterstuetzungsdokument_fuer_Programmierer-Lesen_des_RADOLAN-Binaerformats.pdf).
Prognoseformat:
[DWD-MOSMIX-KML-Beschreibung](https://www.dwd.de/EN/ourservices/met_application_mosmix/mosmix_kml_format_description.pdf?__blob=publicationFile&v=4).

Die korrigierte Übergabe betrifft auch das zusätzliche Blitzfeld. Fehlt dessen
Download, wird kein Blitzobjekt mit einer erfundenen Nullmenge erzeugt. Der
separate HTTP-401-Zugriffsfehler bei Blitzortung bleibt ein offener Schritt.

## Lokale Nachweise

- Vollständige Umweltcollector-Suite: **64 Tests bestanden**, einschließlich
  echter PostgreSQL-Speicherprüfungen in isolierten Testschemata.
- Ruff und Prüfung auf Diff-Formatfehler erfolgreich.
- Reale HTTP-Abrufe durch den Collector mit Antwortarchivierung, Normalisierung
  und Speicherung in einer isolierten Testdatenbank erfolgreich: RADOLAN
  **1 Messwert**, MOSMIX **120 Messwerte** über **24 Prognosestunden**.
- Der Radarwert im geprüften Lauf beträgt tatsächlich 0 mm. Die MOSMIX-Werte
  verteilen sich auf Temperatur, Taupunkt, Windgeschwindigkeit,
  Niederschlagswahrscheinlichkeit und Stundenniederschlag, jeweils 24.
- Wiederholte Speicherung erzeugt keine zusätzlichen identischen Messungen.
- Auf dem produktiven VPS ist der benötigte Messdatenkern bereits installiert.

Lokale Simulationsdaten wurden nicht in die produktive Datenbank übertragen. Die RADOLAN-Abfrage repräsentiert eine Rasterzelle am konfigurierten
Ried-Punkt; MOSMIX bezieht sich auf die konfigurierte DWD-Station 10729. Daraus
folgt keine vollständige räumliche Abdeckung des Rieds.


## Produktiver Abschlussnachweis

Die Korrektur wurde als `a3aef12e47aeee06386d6495fdf08e96fe518ba4` auf `main`
veröffentlicht. Der zugehörige
[FastAPI-&-Docker-CI/CD-Lauf](https://github.com/erik-metz/hack-the-ried/actions/runs/37663137460)
ist vollständig erfolgreich: alle Prüfungen und alle **17 vorgesehenen
Container-Builds samt GHCR-Veröffentlichung**.

Beim ersten Update über `latest` wurde dennoch eine ältere Collector-Version
geladen. Deshalb wurde ausschließlich der Umweltcollector über die zusätzliche
VPS-Datei `/root/docker-compose.dwd-fix-a3aef12.yml` auf den eindeutigen Digest
des geprüften CI-Laufs festgelegt:

`ghcr.io/erik-metz/hack-the-ried-environment-collector@sha256:ab5d13aed4d25808db6cb88223abd05bdccd4b6eb57f5edcaa98a9bb0e4d5259`

Diese Datei ergänzt die vorhandenen `/root/docker-compose.yml` und
`/root/docker-compose.override.yml`. Beim nächsten beabsichtigten Update des
Umweltcollectors muss der Digest gezielt aktualisiert oder diese Fixierung
nach Prüfung der neuen Version entfernt werden. Automatische `latest`-Updates
erfassen den auf einen Digest festgelegten Collector nicht.

Die SHA-256-Prüfung der drei geänderten produktiven Dateien `main.py`,
`normalize.py` und `storage.py` stimmt mit dem veröffentlichten Commit überein.
Die Produktionsdatenbank und die
[öffentliche Quellenstatus-API](https://api.hack-the-ried.de/api/v1/collection/status)
bestätigen am **7. Oktober 2026 um 20:09 Uhr Europe/Berlin**:

- RADOLAN: `success`, **1 Messwert**, HTTP 200, bestätigter Abschluss, kein Fehler.
  Gespeicherter Quellenzeitpunkt 19:40 Uhr, tatsächliche Stundensumme 0 mm.
- MOSMIX: `success`, **120 Messwerte**, HTTP 200, bestätigter Abschluss, kein Fehler.
  In `readings` stehen je 24 Werte für die fünf Prognosemetriken. Mengenabgleich
  mit dem jüngsten Import erfolgreich; alle Definitionen haben `basis=model`.

Damit sind die zuvor gemeldeten Nullimporte beider DWD-Quellen behoben.
Blitzortung, DB OpenStation SIRI-FM, INVEKOS und der Haushaltsabgleich bleiben
separate Schritte, die dieser Abschluss nicht als erfolgreich bewertet.

## Gesonderter Healthcheck-Befund

Nach dem ersten vollständigen Lauf meldet die Statusdatei `healthy`, ohne
Fehlerkategorie und mit null aufeinanderfolgenden Laufabbrüchen. Der gemeinsame
CLI-Healthcheck liefert dennoch **1**: Der letzte erfolgreiche Bodenimport
liegt bei 09:32 Uhr Europe/Berlin, der Pollenimport bei 08:30 Uhr. Die
konfigurierten Healthcheck-Altersgrenzen von drei bzw. neun Stunden sind
überschritten; beide Teilquellen melden derzeit `not_due`. Die neue
DWD-Speicherung und deren öffentliche Erfolgsmeldungen sind separat bestätigt.
Dieser zusätzliche Aktualitäts-/Überwachungsbefund wird nicht als vollständig
gesunder Umweltcollector ausgegeben und bleibt ein eigener Folgeschritt.
