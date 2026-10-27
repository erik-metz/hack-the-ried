# Groß-Rohrheim: Alternativen zum nicht erreichbaren Jahreskalender

Recherche und direkter Quellenabgleich: 7. Oktober 2026.
Alle genannten Veranstaltungen liegen in Groß-Rohrheim und damit im
vereinbarten Ried-Gebiet. Dieser Schritt dokumentiert die Recherche;
zusätzliche Importquellen wurden bei der Recherche noch nicht aktiviert.
Die anschließend beauftragte Musikkiste-Integration ist unten dokumentiert.

## Sechs datierte Lücken im geprüften Bestand

Der öffentliche Backendbestand lieferte beim Abgleich 110 Groß-Rohrheimer
Einträge einschließlich Archiv. Die folgenden sechs Vorkommen wurden dort
nicht gefunden. Das ist eine Momentaufnahme, kein Anspruch auf Vollständigkeit.
Alle Uhrzeiten sind Ortszeit Europe/Berlin.

| Veranstaltung | Veröffentlichtes Datum | Ort | Primärquelle |
| --- | --- | --- | --- |
| Arbeitsgruppe Senioren, offen für weitere Interessierte | 29.10.2026, 17:00 | Rathaussitzungssaal Groß-Rohrheim | [Gemeindemitteilung in der Orts-App](https://gross-rohrheim.orts.app/-arbeitsgruppen-bei-der-gemeinde-gross-rohrheim_LN6I/nHDc) |
| Vereinsfrühschoppen | 01.11.2026, 10:30 | Bürgerhallen-Gaststätte bei „Eule Andrea“ | [Gemeindemitteilung in der Orts-App](https://gross-rohrheim.orts.app/-arbeitsgruppen-bei-der-gemeinde-gross-rohrheim_LN6I/nHDc) |
| Offene Bühne: Out of the box, Valentina Preziosi, 6over5 | 03.11.2026, 20:00–22:00 | Speisegaststätte Alemannia, Am Sportplatz, Groß-Rohrheim | [Musikkiste – Veranstalterseite](https://www.musikkiste.net/event/offene-buehne-3/) |
| Offene Bühne: Nicefield, De Old-Germany-Walter, NOW, P-Trio | 01.12.2026, 20:00–22:00 | Speisegaststätte Alemannia, Am Sportplatz, Groß-Rohrheim | [Musikkiste – Veranstalterseite](https://www.musikkiste.net/event/offene-buehne-12/) |
| Maimarkt | 22.–23.05.2027; keine Uhrzeit auf dieser Übersicht | Groß-Rohrheim; konkrete Plätze/Uhrzeiten separat bestätigen | [Langfristige Termine der Gemeinde](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender/langfristige-termine) |
| Kirchweih / Rohremer Kerb | 21.08.2027; nur dieser Tag bestätigt | Groß-Rohrheim; Ablauf/Veranstaltungsplätze separat bestätigen | [Langfristige Termine der Gemeinde](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender/langfristige-termine) |

Für die Musikabende bestätigen der direkt abgerufene Feed und die aktuellen
JSON-LD-Daten der Veranstaltungsseiten dieselben Termine. Beide sind als
kostenlos ausgewiesen. Suchmaschinen zeigen unter der November-URL teilweise
noch den alten Termin 04.11.2025; dieser wird nicht übernommen.
Bei anderen Quellen werden fehlende Endzeiten, Preise oder Veranstaltungsorte
nicht aus früheren Jahren abgeleitet. Aus dem Kirchweihtag wird insbesondere
kein mehrtägiges Kerbprogramm für 2027 erfunden.

## Zusätzliche Angebote und Quellen

| Quelle | Gefunden | Eignung / noch zu prüfen |
| --- | --- | --- |
| [Musikkiste – strukturierter Kalender](https://www.musikkiste.net/wp-json/tribe/events/v1/events?start_date=2026-10-07&end_date=2027-03-31&per_page=50) | Zwei bevorstehende Musikabende; Titel, Beginn, Ende, Veranstaltungsort, Preis und Quellen-URL sind strukturiert vorhanden | Erste Wahl für den nächsten Importschritt. Bereits vorhandenen Tribe-Adapter auf dieser Quelle prüfen, Pagination und örtliche Veranstaltungsorte beibehalten. |
| [Langfristige Gemeindeübersicht](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender/langfristige-termine) | Bauernmarkt freitags 14:00–17:00 in der Allee, März–November; außerdem allgemeiner monatlicher Hinweis zur Offenen Bühne | Wiederholungen erst nach Prüfung von Gültigkeitszeitraum und Ausnahmen importieren. Für die Offene Bühne haben aktuelle einzeln datierte Veranstalterdaten Vorrang. |
| [TV Groß-Rohrheim – Zumba](https://tv-grossrohrheim.de/2026/08/30/anmeldung-zumba/) | Kursbeginn Donnerstag, 01.10.2026; Anmeldung angeboten | Angebot belegt, aber für einzelne Folgetermine sind vollständige Kurszeiten, Laufzeit und Ort erforderlich. Kein unbegrenzter wöchentlicher Import aus dem Startdatum. |
| [TC74 Groß-Rohrheim](https://tc74.de/) | Jahresplan 2026 als verlinkte Bilddatei; Orts-App nennt Saisonabschluss 11.10.2026 | Potenzielle ergänzende Vereinsquelle. Jahresplan und aktuelle Details einschließlich öffentlicher Teilnahme und Veranstaltungsort vor Import prüfen. |
| [Heimat- und Geschichtsverein](https://rohrheimer-geschichte.de/) | Veranstaltungsberichte, Arbeitseinsätze und ausdrückliche Absage des Sommerschnittkurses 2026 | Nützlich für einzelne Termine und Absagen; Nachrichten sind keine vollständige strukturierte Jahresliste. |
| [Gemeindlicher Veranstaltungskalender](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender) | Bereits importierte Termine, beispielsweise Nikolausmarkt am 05.12.2026 | Bestehende Quelle weiter nutzen; bekannte Veranstaltungen nicht als neue Funde zählen. |

## PDF-Befund und nächste Schritte

Der aktuell in der Orts-App verlinkte Jahreskalender unter
`/file/1d12216b-e2a3-4520-940c-adb9f90217c6` liefert beim erneuten direkten Abruf
weiterhin HTTP 410. Eine erreichbare Ersatzdatei mit vollständigem Jahreskalender
wurde in dieser Recherche nicht gefunden. Suchmaschinen-Auszüge und
Veranstaltungsaggregatoren ersetzen keine vollständig prüfbare Originalquelle.

Vorgeschlagene Umsetzung in getrennten Schritten:

1. Den öffentlichen Musikkiste-Feed prüfen und als weitere Quelle integrieren;
   die beiden konkret bestätigten Musikabende vollständig bis zur produktiven
   Veröffentlichung nachweisen.
2. Die Gemeindemitteilung zu Arbeitsgruppen/Vereinsfrühschoppen gezielt
   erschließen; fehlende Endzeiten als unbekannt behandeln.
3. Langfristige Festtermine ergänzen, sobald die nötigen Ortsangaben bestätigt
   sind. Wiederkehrende Angebote und bildbasierte Vereinspläne getrennt prüfen.

Der PDF-Schritt bleibt als PDF-Import offen. Die erreichbaren Alternativen
ermöglichen unabhängig davon eine weitere Verbesserung der Ried-Abdeckung.

## Umsetzung: Musikkiste als zusätzliche Importquelle

Die Quelle `musikkiste-gross-rohrheim-events` nutzt den vorhandenen
Tribe-Adapter und die eindeutige ID-Vorsilbe `musikkiste-gr`. Der Abruf erfolgt
alle sechs Stunden für das aktuelle und folgende Kalenderjahr, mit vollständiger
Pagination, Prüfung des tatsächlichen Veranstaltungsortes und Erhalt früherer
Vorkommen. Für die belegten Musikreihen sind exakte Titelzuordnungen zu
`concert` hinterlegt; andere Titel behalten die normale Rubrikzuordnung.

Der vollständige öffentliche Feed liefert aktuell 13 Einträge. Davon werden
zwölf übernommen, einschließlich der Offenen Bühne am 03.11.2026 und
01.12.2026 von jeweils 20:00 bis 22:00 Uhr in der Alemannia, Eintritt frei.
Das ältere Herbstjazz-Konzert bleibt wegen widersprüchlicher Ortsdaten
zurückgestellt: Der Feed nennt Groß-Rohrheim, aber die Postleitzahl `68647`
statt `68649`. Es wird keine ungeprüfte Adresskorrektur vorgenommen.

Die Live-Kette wurde bis zur Veröffentlichung in einer isolierten TimescaleDB
geprüft und veröffentlicht dort zwölf Termine. Neue Regressionstests prüfen
Originaltermine, Preise, Uhrzeiten, Quellenkennungen, fremde/fehlende Orte und
Titelzuordnungen. Ein echter Datenbanktest prüft den vollständigen Import und
seine Wiederholung ohne Duplikate.

Die vollständige Worker-Suite einschließlich aller Datenbanktests besteht:
**217 bestanden, keine übersprungen**. Ruff für die geänderten Python-Dateien
und die Prüfung des Diffs sind erfolgreich.

Der erste Veröffentlichungsversuch scheiterte in einem unabhängigen
Rastplatz-Collector-Test: Die Erkennung von `write_measurement` berücksichtigte
auch Funktionen anderer Datenbankschemas und aktivierte dadurch einen
Speicherpfad ohne passende lokale `entities`-Tabelle. Die Erkennung prüft nun
das aktive Schema und die vorhandene Tabelle. Ein Regressionstest stellt eine
gleichnamige Funktion in einem getrennten Schema bereit. Alle 13 Rastplatz-
Collector-Tests einschließlich Datenbanktests und Ruff sind erfolgreich.

Die gleiche schemaübergreifende Erkennung wurde auch in OpenSenseMap, UBA,
TTN Mapper und EMF korrigiert, ebenso die betroffenen Tabellenprüfungen in
ihren Tests. Die Collector-Suiten wurden mit absichtlich fremder Funktion und
Tabelle in einer eigenen Testdatenbank ausgeführt: Rastplatz 13, OpenSenseMap 12,
UBA 10, TTN Mapper 15 und EMF 5 Tests bestanden. Diese Korrekturen beheben die
konkreten Blockaden der gemeinsamen Container-Veröffentlichung.

### Produktiver Abschluss

Die neue Quelle ist als `8544adc` auf `main` veröffentlicht. Nach den gezielten
CI-Korrekturen ist der Lauf für `1ea5c07e66b3351bf97abe638768c345708193e3`
[vollständig erfolgreich](https://github.com/erik-metz/hack-the-ried/actions/runs/37663098141),
einschließlich aller 17 vorgesehenen Container-Builds und GHCR-Veröffentlichungen.

Der öffentliche Importstatus meldet für `musikkiste-gross-rohrheim-events`
`success` mit Abrufzeit 07.10.2026, 18:12:09 UTC. Im produktiven Eventbestand
sind zwölf zugehörige Termine bestätigt. Die beiden kommenden Offene-Bühne-
Abende am 03.11.2026 und 01.12.2026 sind jeweils mit 20:00–22:00 Ortszeit,
Groß-Rohrheim, Rubrik `concert` und kostenlosem Eintritt enthalten.
Die Veröffentlichung wurde nach der automatischen Image-Übernahme überprüft;
erfolgreiche Tests allein wurden nicht als produktiver Importnachweis gewertet.

## Gemeindemitteilung mit zwei zusätzlichen Terminen

Die offizielle [Gemeindemitteilung](https://gross-rohrheim.orts.app/-arbeitsgruppen-bei-der-gemeinde-gross-rohrheim_LN6I/nHDc)
ist am 08.10.2026 erneut abgerufen und mit dem neuen Parser geprüft worden:

- Arbeitsgruppe Senioren: 29.10.2026, 17:00 Uhr, Rathaussitzungssaal Groß-Rohrheim.
- Vereinsfrühschoppen: 01.11.2026, 10:30 Uhr, Bürgerhallen-Gaststätte bei „Eule Andrea“, Groß-Rohrheim.

Die Quelle `gross-rohrheim-community-notice-events` wird alle sechs Stunden
geprüft. Nur die beiden ausdrücklich ausgewählten Termine und überprüften
Veranstaltungsorte werden übernommen. Endzeiten und Eintrittspreise sind
nicht veröffentlicht; Endzeiten bleiben leer, kostenloser Eintritt wird
nicht behauptet. Die veröffentlichte Einladung wird im Beschreibungstext
beibehalten. Eine unvollständige oder geänderte Mitteilung wird abgelehnt,
bevor bestehende Termine verändert werden. Tests prüfen den originalen
Quelltext, fremde Orte, veränderte Daten sowie Archivierung, Veröffentlichung
und wiederholten Import mit echten Datenbank-Fremdschlüsseln.

### Veröffentlichung und produktiver Nachweis

Implementierung: `425478807c1a098f7f879f3347f550ac7eb70e12`; gezielte
Korrektur eines datumsabhängigen Abfluss-Tests:
`792971a6cd8f75cac5589c791406be3906a78821`.
Lokal: 225 Worker-Tests und acht Abfluss-Tests erfolgreich, Ruff erfolgreich.
Der [CI-Lauf für den abschließenden Code-Commit](https://github.com/erik-metz/hack-the-ried/actions/runs/37735354692)
ist vollständig erfolgreich, einschließlich aller 17 GHCR-Veröffentlichungen.

Die öffentliche API bestätigt am 08.10.2026 den erfolgreichen Quellenabruf
um 06:15:41 UTC und genau beide zusätzlichen Termine mit Herkunftsnachweisen.
Die gespeicherten UTC-Zeiten 29.10.2026, 16:00 und 01.11.2026, 09:30
entsprechen 17:00 und 10:30 Uhr in Deutschland. Beide Veranstaltungsorte
liegen in Groß-Rohrheim, Endzeiten bleiben leer. Die Dokumentation dieses
Nachweises allein löst gemäß den Workflow-Pfadfiltern keine weitere CI aus.

## Langfristige Festtermine 2027

Erneuter direkter Abgleich am 08.10.2026: Die [offizielle langfristige
Terminübersicht](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender/langfristige-termine)
bestätigt Maimarkt am 22.–23.05.2027 und Kirchweih am 21.08.2027.
Beide waren im produktiven Groß-Rohrheimer Eventbestand noch nicht vorhanden.
Die [Kerb-Seite](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/kirchweih)
beschreibt weiterhin das Programm 2026. Ältere Programme belegen daher
keinen Veranstaltungsplatz, Eintrittspreis oder Ablauf für 2027.

Die neue Quelle `gross-rohrheim-long-term-events` übernimmt ausschließlich
diese beiden lokalen Festreihen und das ausdrücklich konfigurierte Jahr 2027.
Pfingsten, Konfirmation, ältere Jahre und unbestätigte weitere Kerbtage werden
nicht importiert. Groß-Rohrheim ist als Ort der beiden gemeindlichen Feste
bestätigt; der genaue Veranstaltungsplatz bleibt ausdrücklich offen.
Das Ortsfeld lautet deshalb „Groß-Rohrheim – genauer Veranstaltungsort noch
nicht veröffentlicht“. Es wird insbesondere keine Bürgerhalle aus alten
Programmen übernommen. Diese Datumshinweise sind keine vollständigen
Programme. Die Beschreibung benennt die fehlenden Uhrzeiten, Plätze,
Eintrittspreise und Programmdetails.

Für die Kalenderdarstellung verwendet der Import die vorhandene Konvention
für Datumshinweise: lokale Tagesgrenzen 00:00–23:59:59. Diese sind keine
behaupteten Öffnungszeiten. Maimarkt umfasst nur die beiden publizierten
Tage, Kirchweih nur den einzelnen publizierten Tag. Der Abruf erfolgt alle
sechs Stunden; stabile Kennungen verhindern Duplikate bei erneutem Abruf.
Fehlende, widersprüchliche oder unlesbare Angaben werden abgelehnt, bevor
eine gute Veröffentlichung verändert wird.

### Produktiver Nachweis der Festtermine

Implementierung `9fcb0f84919dfe232bc88f95f6b67ef96d38425e` ist auf `main`
committed und gepusht. Die gesamte Worker-Suite wurde wegen paralleler
unabhängiger Arbeiten zusätzlich in einem isolierten Stand ausschließlich
dieser Änderungen geprüft: **235 bestanden**, einschließlich der echten
Datenbanktests. Ruff und Diff-Prüfung sind erfolgreich.

Der [CI-Lauf für genau diesen Commit](https://github.com/erik-metz/hack-the-ried/actions/runs/37737882421)
ist vollständig erfolgreich, einschließlich aller 17 Container-Builds und
GHCR-Veröffentlichungen. Die öffentliche Quellen-API bestätigt `success`
mit Abrufzeit 08.10.2026, 06:46:23 UTC. Die öffentliche Event-API bestätigt
beide Datumshinweise mit Quellenherkunft, richtigen lokalen Datumsgrenzen
und ausdrücklichem Hinweis auf die noch nicht veröffentlichten Festplätze.
Ein älterer zwischengespeicherter Gesamtbestand wurde nicht als Gegenbeleg
gewertet; die aktuelle Groß-Rohrheim-Abfrage enthält beide Veranstaltungen.
Dieser abschließende Dokumentationscommit löst gemäß Pfadfiltern keine
weitere CI aus.
