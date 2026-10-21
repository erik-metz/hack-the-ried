# Ried-Veranstaltungen: Bestandsaufnahme und Umsetzung

Stand: 6. Oktober 2026. Schritt 1 abgeschlossen durch Prüfung des Repositorys.
Die laufende Datenbank und die produktive Anzeige wurden dabei nicht geprüft.
Quellen gelten hier als konfiguriert, nicht als nachweislich erfolgreich importiert.

## Verbindliches Veranstaltungsgebiet

Für diesen Kalender umfasst das Ried die vier bisherigen Projektkommunen:

| Gemeinde | Eingeschlossene Orte |
| --- | --- |
| Bürstadt | Kernstadt, Bobstadt, Riedrode |
| Lampertheim | Kernstadt, Hofheim, Hüttenfeld, Neuschloß, Rosengarten |
| Biblis | Kernort, Nordheim, Wattenheim |
| Groß-Rohrheim | Gemeindegebiet |

Maßgeblich ist der tatsächliche Veranstaltungsort, nicht Vereinssitz,
Quellkalender oder ein Suchradius. Beispielsweise bleibt ein Ausflug eines
Bibliser Vereins nach Heppenheim ausgeschlossen. Außerhalb dieser vier
Gemeindegebiete liegende Veranstaltungen werden nicht aufgenommen.
Unklare Orte werden zur Prüfung zurückgestellt; fehlende Ortsangaben dürfen
nicht automatisch durch den Sitz des Quellanbieters ersetzt werden.
Ortsteile werden ihrer Gemeinde zugeordnet und zusätzlich als Ort erhalten.
Diese Festlegung beschreibt den vereinbarten Projektumfang, keine allgemeine
geografische Definition des Hessischen Rieds.

## Bestehende Datenstrecke

1. `www/vps/registry-sync-worker/sources.json` konfiguriert drei aktive
   Eventquellen mit jeweils sechs Stunden Abrufintervall: `cross7-buerstadt`
   (Kalender 667), `cross7-gross-rohrheim` (Kalender 1106) und
   `lampertheim-events` (kommunaler HTML-Kalender).
2. `adapters.py` schreibt in `cultural_events` und veröffentlicht zusätzlich
   einen aggregierten Datensatz `social/events`.
3. `api/v1/endpoints/collected.py` liefert den gespeicherten Datensatz.
   Daneben existiert der Tabellen-Endpunkt in `social_daily_life.py`.
4. `www/open-ried-sens/lib/regionalStats.ts` fordert `/api/v1/social/events` an;
   der dort als `fetch` importierte Wrapper `collectedBackend.ts` schreibt
   den Pfad jedoch zu `/api/v1/collected/social/events` um.
   `app/statistik/page.tsx` lädt die Events einmal für die Seite;
   `StatistikClient.tsx` filtert diese Daten lokal und reicht sie an
   `EventCalendarWidget.tsx` weiter.

Der statische Katalog `BASELINE_EVENTS` ist nicht der Rückfallpfad dieser
Ladefunktion: Die Anzeige bezieht ihre Events aus der API. Bestehende Tests
des statischen Katalogs belegen daher keine vollständigen Live-Imports.

## Belegte Lücken im Code

| Befund | Folge | Umsetzungsschritt |
| --- | --- | --- |
| Keine aktive Eventquelle für Biblis; keine eigenen Vereins- oder Ortsteilkalender im Event-Manifest | Kleine Feste und offene Angebote haben keine systematische Quelle | 3 und 4 |
| Cross7 liest bis zu 100 Seiten mit je 50 Einträgen; Lampertheim liest lediglich eine HTML-Seite | Lampertheimer Folgeseiten und weitere Zeiträume können fehlen | 2 |
| Beide Importer setzen die Gemeinde anhand der Quelle; keine Prüfung des tatsächlichen Veranstaltungsorts | Auswärtige Veranstaltungen können als lokale Termine erscheinen | 2 bis 5 |
| Lampertheim übernimmt Enduhrzeiten am Startdatum und setzt bei fehlender Uhrzeit 10 Uhr | Mehrtägige bzw. über Mitternacht laufende Termine und unbekannte Zeiten werden unzuverlässig abgebildet | 2 |
| Tabellen-Endpunkt begrenzt standardmäßig auf 100, maximal auf 500 Events; die Statistik nutzt jedoch den separaten Collected-Endpunkt | Diese Begrenzung erklärt keine fehlenden Events auf der Statistikseite; beide API-Verträge getrennt prüfen | 2 und 7 |
| Collected-Standardabruf schließt Termine mit Ende vor der aktuellen Zeit aus; Frontend bietet trotzdem einen Archivfilter | Archivfilter kann nicht alle vergangenen Events anzeigen | 7 |
| Frontend-Zeitfilter verwendet fest `2026-09-17T00:00:00Z` | Kategorien wie kommende Termine und Archiv werden mit veraltetem Stichtag berechnet | 7 |
| Gemeindeauswahl des Statistikbereichs beeinflusst auch den Eventfilter bei Auswahl „alle“ | „Alle“ kann weiterhin nur die ausgewählte Gemeinde zeigen | 7 |
| Kalender erhält `events` statt der nach Orts-, Kategorie- und Suchfiltern eingeschränkten Daten | Kalendermarkierungen und Trefferliste können widersprüchlich sein | 7 |
| Kalender verteilt mehrtägige Events auf höchstens 14 Tage | Längere Angebote werden im Kalender abgeschnitten | 6 und 7 |
| Importer setzen `is_free` pauschal auf wahr | Kostenpflichtige Vereinsangebote können als kostenlos erscheinen | 2 bis 4 |
| IDs basieren auf Quellenkennung bzw. Titel, Datum und Ort; kein quellenübergreifender Abgleich | Dasselbe Fest aus mehreren Quellen kann mehrfach erscheinen | 6 |

Die Seite fängt außerdem einen Fehler ihrer gemeinsamen Datenabfragen ab und
zeigt dann `OfficialStatisticsPage`. Ein fehlender Eventbereich kann deshalb
auch durch eine andere fehlgeschlagene Abfrage verursacht sein. In Schritt 7
sind Datenverfügbarkeit und Darstellung getrennt zu prüfen.

## Geplante Quellen

| Schritt | Quelle | Nutzen |
| --- | --- | --- |
| 2 | Kommunale Kalender Bürstadt, Groß-Rohrheim und Lampertheim | Vollständige Seiten, Zeiträume und Detailangaben |
| 3 | https://www.buergerstiftung-biblis.de/events/monat/ | Vereinsveranstaltungen und offene Angebote in Biblis und Ortsteilen |
| 4 | https://www.xn--tvbrstadt-s9a.de/798-2/ | Brutzelfest, Stadtlauf, Silvesterlauf |
| 4 | https://tv1896hofheim.de/hofheimer-volkslauf/ | Hofheimer Volkslauf |
| 4 | https://www.sg-huettenfeld.de/kerwe/ und https://www.sg-huettenfeld.de/kerwelauf/ | Ortsteilkerwe und Kerwelauf |
| 4 | https://www.kkm-buerstadt.de/kalender-2/ | Vereinsfest, Kerwe-Frühschoppen, Konzerte |
| 4 | https://lampertheim.dlrg.de/aktuelle-termine/ | Kurse und Vereinsangebote; Teilnahmebedingungen prüfen |
| 4 | https://neuschloss.net/termine/ | Lokale Veranstaltungen in Neuschloß |
| 5 | Groß-Rohrheimer PDF-Jahreskalender über Gemeinde bzw. Orts-App | Feste und kleinere Vereinstermine ohne strukturierten Feed |

Quellen und Detailseiten vor ihrer Anbindung erneut prüfen. Ein
Sperrungszeitraum, Veröffentlichungsdatum oder regelmäßig wiederkehrendes
Wochenende allein ist kein bestätigter Veranstaltungstermin. Termine für ein
neues Jahr werden erst nach Veröffentlichung übernommen.

## Ablauf und Abnahme

- [x] 1. Quellen, Filter und Anzeige untersuchen; Gebiet und Lücken festhalten.
- [x] 2. Kommunale Kalender vollständig und mit belastbaren Orts-/Datumsangaben erfassen.
- [x] 3. Bürgerstiftung Biblis anbinden.
- [x] 4. Vereins- und Ortsteilkalender ergänzen.
- [ ] 5. PDF-Jahreskalender ergänzen — Originaldatei derzeit nicht erreichbar (Prüfung 7. Oktober 2026; siehe unten).
- [x] 6. Dubletten, Absagen und begrenzte Kalenderwiederholungen behandeln.
- [x] 7. Importabdeckung und Anzeige gegen recherchierte Beispiele prüfen; dokumentierte Anzeigefehler beheben (produktive Vereinsabdeckung noch nicht bestätigt).

Nach jedem Schritt passende Prüfungen ausführen, die eigenen Änderungen
committen und pushen sowie nur die für diese Pfade vorgesehenen CI-Läufe des
gepushten Commits verfolgen. Danach den Nutzer fragen, ob der nächste Schritt
beginnen soll. Schritt 1 ändert nur diese Dokumentation und aktiviert noch
keine neue Quelle oder Filterlogik.

## Ergebnis Schritt 2 (6. Oktober 2026)

- Lampertheim: HTML-Baum statt verschachtelter Regex; vollständige Weiterblätterung
  mit erhaltenem Datumsfilter vom 1. Januar des aktuellen Jahres bis zum
  31. Dezember des Folgejahres. Ältere Archive bleiben erhalten. Grenzen:
  höchstens 100 Seiten pro Durchlauf; zyklische Navigation und unbekanntes
  Markup verhindern die Veröffentlichung eines unvollständigen Imports.
- Live-Simulation ohne Datenbankänderung: 26 Seiten und 489 eindeutig lokal
  zugeordnete Lampertheimer Vorkommen. Sieben widersprüchliche Datumsbereiche
  wurden protokolliert und zurückgestellt, beispielsweise 7. März bis 8. Februar.
- Detailseiten des kommunalen Anbieters ergänzen Beschreibung, Ort und Preis.
  Externe Ticketportale werden verlinkt, aber nicht zusätzlich gecrawlt.
- Cross7: Bürstadt 16 Seiten/766 Einträge, Groß-Rohrheim 4 Seiten/163 Einträge.
  Vollständige Weiterblätterung bleibt erhalten; wiederholte Seiten werden
  erkannt. Strukturierte Veranstaltungsadressen haben Vorrang vor Ortsnamen
  in Bezeichnungen; Veranstalteradressen sind kein Ortsnachweis.
- Die Groß-Rohrheimer Quellenkonfiguration enthält einzeln belegte lokale
  Ortsnamen. Mit diesen Aliasen lassen sich 110 von 163 Quelleneinträgen
  örtlich zuordnen. Fehlende Orte und mehrdeutiges „Vereinsheim“ bleiben
  ausgeschlossen. Bürstadt: 479 örtlich bestätigte Einträge; die Schreibweise
  „Bürstadt Riedrode“ wird unterstützt.
- Grundlage der Ortsaliase: Gemeinde-Jahreskalender
  https://gross-rohrheim.orts.app/file/aa29fbe9-f0dc-443c-b739-454603b44121,
  Gemeinde-Familienmappe
  https://www.gross-rohrheim.de/fileadmin/Dateien/Dateien/Leben___Wohnen/Familienmappe_Stand_01.07.2023.pdf,
  https://dekanat-bergstrasse.ekhn.de/kirchengemeinden/gross-rohrheim und
  https://vogelpark-grossrohrheim.de/ . Aliase gelten ausschließlich für diesen
  Kalender und überschreiben keine ausdrücklich auswärtige Adresse.
- Enddaten, Mitternacht und Zeitzonen werden berücksichtigt. Fehlende Zeiten
  werden als Tagesgrenzen dargestellt; es wird keine Öffnungszeit erfunden.
- `is_free` wird nur bei ausdrücklichem Nachweis gesetzt. Das bestehende
  Bool-Schema kann „Preis unbekannt“ nicht eigenständig darstellen; unbekannte
  Preise sind daher nicht als kostenlos markiert, in Lampertheim zusätzlich
  in der Beschreibung gekennzeichnet. Eine gesonderte Darstellung bleibt für
  Schritt 7 zu prüfen.
- Nach vollständig erfolgreichem Abruf werden nur die eigenen Quelleneinträge
  abgeglichen: Cross7 vollständig, Lampertheim innerhalb des angefragten
  Zeitraums. Nicht mehr bestätigte Einträge werden entfernt. Abgleich, Upserts
  und Veröffentlichung laufen in einer Transaktion; Datenbankfehler werden
  nicht mehr als erfolgreicher Teilimport verschluckt.
- 24 neue Regressionstests mit gekürzten echten Quellenausschnitten prüfen
  Datumsfelder, Preise, Ortsgrenzen, Aliase, Weiterblätterung und Fehlerfälle.
  Die produktive Datenbank und VPS-Ausführung wurden nicht geprüft; ein
  veröffentlichter Container allein bestätigt noch keinen erfolgten Live-Import.


## Ergebnis Schritt 3 (6. Oktober 2026)

- Bürgerstiftung Biblis über ihre öffentliche Events-API angebunden:
  https://www.buergerstiftung-biblis.de/wp-json/tribe/events/v1/events .
  Der Import fragt das aktuelle und folgende Kalenderjahr ab, alle sechs Stunden.
- Live-Simulation ohne produktive Datenbankänderung: 338 Einträge auf sieben
  Seiten, davon 302 örtlich bestätigte Termine (74 noch bevorstehend).
  32 Einträge ohne belegten Veranstaltungsort im Ried und vier mit
  widersprüchlichen Datumsangaben bleiben zurückgestellt. Ausflüge außerhalb
  des Rieds werden nicht aufgrund des Bibliser Veranstalters übernommen.
- Wiederkehrende Angebote werden mit den einzelnen vom Anbieter gelieferten
  Termin-IDs übernommen. Ganztägige Termine, HTML-Text, Winter-/Sommerzeit und
  Preisbedingungen werden berücksichtigt. Unbekannte Preise gelten nicht als
  ausdrücklich kostenlos. Dubletten zwischen Quellen bleiben Schritt 6.
- Zwei konkret belegte Veranstaltungsorte ohne strukturierte Adresse werden
  ausschließlich über passende Quell-Orts-ID und Bezeichnung aufgelöst:
  Rathausplatz Nordheim und Vereinsgelände des Vogel- und Naturschutzvereins
  Wattenheim. Beleglinks stehen in der Quellenkonfiguration.
- Alle Seiten und Anzahlen müssen konsistent sein; fehlende, wiederholte oder
  geänderte Seiten verhindern Abgleich und Veröffentlichung. Der Abgleich
  betrifft ausschließlich diese Quelle und den vollständig angefragten Zeitraum.
- 15 neue Regressionstestfälle; gesamte lokale Worker-Suite: 123 bestanden,
  14 übersprungen (abhängige Infrastruktur nicht verfügbar).
  Der tatsächliche Import auf dem produktiven VPS bleibt unbestätigt.


## Ergebnis Schritt 4 (7. Oktober 2026)

Sieben neue Quellen für sechs Anbieter sind aktiv; Abruf alle sechs Stunden.
Live-Simulation ohne produktive Datenbankänderung: **87 lokal bestätigte
Vorkommen, davon 29 bevorstehend**. Diese Zahl ist vor dem quellenübergreifenden
Dublettenabgleich in Schritt 6 zu verstehen. Einzelne Veranstaltungen stehen
bereits in kommunalen Kalendern. Die vollständige Rechercheliste steht in
[ried-events-vereine.md](ried-events-vereine.md).

| Quelle | Übernommene Vorkommen | Bevorstehend |
| --- | ---: | ---: |
| TV Bürstadt | 25 | 1 |
| KKM Bürstadt | 13 | 1 |
| SG Hüttenfeld | 11 | 4 |
| DLRG Lampertheim | 19 | 17 |
| TV Hofheim – Kalender | 4 | 4 |
| Hofheimer Volkslauf – eigene Veranstaltungsseite | 1 | 0 |
| Neuschloß | 14 | 2 |

- TV/KKM: vollständige HTML-Tabellen mit kontrollierter Spaltenstruktur.
  Explizite Tages- und Mehrtagesdaten; leere Datumszellen erben keinen Termin
  aus der vorherigen Zeile. Mehrdeutige Datumsangaben, Platzhalter und interne
  Hallenreinigung werden nicht veröffentlicht. Lokale Hallenkürzel sind nur
  für den jeweiligen Kalender anhand belegter Veranstaltungsstätten aufgelöst.
  Auswärtige Wettkämpfe und Zeltlager sowie Orte ohne Nachweis bleiben draußen.
- SG Hüttenfeld: acht explizit konfigurierte öffentliche Veranstaltungsseiten.
  Sichtbare datierte Programme haben Vorrang vor Countdown-Widgets.
  Der Kerwelauf beginnt gemäß Ausschreibung um 15 Uhr, nicht um 14 Uhr laut
  Countdown. Das Ostereierschießen liefert fünf veröffentlichte Termine für
  März 2026; die widersprüchliche Überschrift für 2027 wird nicht zur Erfindung
  neuer Termine verwendet. Nikolausschießen: zwei separate Tage. Kinderfasching
  und Maifest haben ausdrücklich bestätigte Daten für 2027. Nur „Oktober 2027“
  beim Oktoberfest und ein unbestätigter Rückkehrhinweis zur Summer Night
  genügen nicht für einen neuen Termin.
- DLRG: vollständige eingebettete Seminarliste statt leerer HTML-Tabellenzeilen.
  Öffentliche Details liefern Gebühren, Teilnehmerkreis, Anmeldestatus und
  Kalenderexport. Jeder vom Anbieter explizit exportierte Kurstag hat eine
  eigene ID, Zeit und tatsächliche Adresse. Damit werden Hallenbad und
  Unterrichtsstation nicht verwechselt. Ein Export muss die angekündigte Anzahl
  von Terminen enthalten; unvollständige Exporte und noch nicht expandierte
  Wiederholungsregeln verhindern die gesamte Veröffentlichung. Teamkleidung-
  Bestellungen und die Freizeit in Oberhausen-Rheinhausen werden ausgeschlossen.
  Mitgliedsangebote bleiben mit ihren Teilnahmebedingungen gekennzeichnet.
- Hofheim: öffentliche Jahresansicht über die vom Anbieter vorgesehene
  Kalenderanzeige-Anfrage; alle darin enthaltenen HTML-Seiten werden gelesen.
  Schulferien sind keine lokalen Vereinsveranstaltungen. Die separat
  veröffentlichte Volkslauf-Seite wird zusätzlich gelesen. Ihr Veranstaltungsort
  ist für die bestätigte Ausgabe 2026 belegt; eine neue Ausgabe benötigt erneut
  einen konkreten Ortsnachweis. Der dynamische Kalender liefert den vom Anbieter
  dargestellten Zeitraum, keine zugesicherte Vollständigkeit für beide Jahre.
- Neuschloß: Wiederverwendung der paginierten öffentlichen Events-API mit
  eigener ID-Kennung. 14 von 16 Vorkommen haben bestätigte Veranstaltungsorte;
  zwei ohne Ortsnachweis bleiben zurückgestellt. Bibliser IDs bleiben erhalten.
- Alle Abrufe und Details einer Quelle müssen erfolgreich sein, bevor ein
  Abgleich veröffentlicht wird. Der Abgleich löscht ausschließlich noch aktuelle
  eigene Quelleneinträge im angefragten Zeitraum; vergangene Vereinsvorkommen
  bleiben als Archiv erhalten. Neuschloß nutzt den bereits bestehenden Abgleich
  des vollständigen angefragten Kalenderzeitraums.
- 37 neue Regressionstestfälle; lokale Worker-Suite: 160 bestanden, 14
  übersprungen. Ruff besteht für alle geänderten Python-Dateien. Ein zusätzlicher
  Lauf über das gesamte Worker-Verzeichnis meldet drei bereits bestehende
  Befunde in `osm_addresses.py`, `prediction.py` und `test_rail_geometry.py`;
  diese fremden Pfade wurden nicht verändert.
- Die Simulation prüft Live-Abrufe, Parser, Schema-Feldlängen und den vollständigen
  Importablauf mit simulierten Datenbankoperationen. Produktiver VPS-Import und
  Anzeige bleiben unbestätigt und werden nicht aus einer Container-Veröffentlichung
  abgeleitet. Deduplizierung und Darstellung folgen in den nächsten Schritten.

## Schritt 5: PDF-Recherche — externe Blockade

Geprüft am 7. Oktober 2026. Der PDF-Import ist **nicht implementiert und
nicht aktiviert**. Für eine belastbare Tabellen-, Seitenwechsel- und
Vollständigkeitsprüfung fehlt derzeit eine erreichbare Originaldatei.
Die vorhandenen kommunalen und Vereinsimporte bleiben aktiv.

| Geprüfte Quelle | Ergebnis |
| --- | --- |
| [Aktueller Orts-App-Beitrag](https://gross-rohrheim.orts.app/-veranstaltungskalender_UoGU) | Erreichbar; verlinkt die unten genannte Datei |
| [Datei aus diesem Beitrag](https://gross-rohrheim.orts.app/file/1d12216b-e2a3-4520-940c-adb9f90217c6) | Direkter HTTP-Abruf liefert 410 Gone |
| [Zuvor recherchierter Jahreskalender](https://gross-rohrheim.orts.app/file/aa29fbe9-f0dc-443c-b739-454603b44121) | Direkter HTTP-Abruf liefert ebenfalls 410 Gone |
| [Gemeindlicher Veranstaltungskalender](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender) | Erreichbar; keine Ersatz-PDF gefunden |
| [Langfristige Termine der Gemeinde](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender/langfristige-termine) | Erreichbare HTML-Seite, kein Ersatz für den Jahreskalender |

Der Suchindex enthält noch Teile des früheren Jahreskalenders für
01.01.2026–31.03.2027. Diese Auszüge ersetzen weder die Originaldatei noch
einen Nachweis vollständiger und aktueller Termine. Sie werden nicht als
Importdaten oder als geprüfte PDF-Testfixture übernommen.

### Zusätzlich gefundene Hinweise aus der Gemeindeseite

Die Seite „Langfristige Termine“ nennt folgende konkrete Daten; dies ist eine
Rechercheliste, **kein Nachweis eines zusätzlichen Imports**:

| Veranstaltung in Groß-Rohrheim | Veröffentlichtes Datum |
| --- | --- |
| Maimarkt 2026 | 16.–17. Mai 2026 |
| Maimarkt 2027 | 22.–23. Mai 2027 |
| Kirchweih 2026 | 22. August 2026 |
| Kirchweih 2027 | 21. August 2027 |

Außerdem nennt sie den Bauernmarkt freitags 14–17 Uhr in der Allee
(März–November), Winzer Vollmer dienstags ab 17 Uhr in der Allee
(Mitte Mai–Anfang September) und die Offene Bühne der Musikkiste am ersten
Dienstag im Monat ab 20 Uhr im FC-Heim. Diese Wiederholungshinweise benötigen
vor einer Übernahme eine Prüfung von Gültigkeitszeitraum, Ausnahmen und
tatsächlichem Veranstaltungsort in Schritt 6. Pfingsten allein wird nicht als
Veranstaltung aufgenommen. Die genannten Festdaten belegen keinen vollständigen
Programmzeitraum oder eine Uhrzeit.

### Voraussetzung für die Fortsetzung

Eine erreichbare, vom Anbieter veröffentlichte Original-PDF ist erforderlich.
Danach: Tabellenlayout und Seitenwechsel visuell prüfen, explizite Jahre und
Datumsbereiche einschließlich Jahreswechsel auslesen, Ferien und Feiertage
ausschließen, Veranstaltungsorte belegen und vollständige Abrufe vor jeder
Datenbankänderung sicherstellen. Erst mit Originaldatei, Regressionstests und
Live-Simulation wird diese Quelle aktiviert. Schritt 5 bleibt bis dahin offen;
Schritt 6 kann nach Zustimmung unabhängig davon umgesetzt werden.

## Schritt 6: Dubletten, Absagen und Kalenderwiederholungen

Implementiert am 7. Oktober 2026. Die Veröffentlichung `social/events`
fasst sichere Dubletten zusammen; die einzelnen Quellen bleiben in
`cultural_events` unabhängig gespeichert und können beim nächsten vollständigen
Quellenabruf einzeln aktualisiert bzw. abgeglichen werden.

- Eine Dublette benötigt denselben normalisierten Titel, Veranstaltungsort und
  dieselbe Gemeinde sowie identischen Beginn und identisches Ende. Groß-/
  Kleinschreibung, Leerzeichen und Satzzeichen dürfen abweichen. Vergleich
  der Zeiten in Europe/Berlin; unterschiedliche UTC-Schreibweisen sind möglich.
  Fehlender Veranstaltungsort, andere Zeit, abweichender Ort oder abweichender
  Titel führen nicht zu einer Zusammenfassung. Keine unscharfe Suche und
  keine automatische Gleichsetzung von ganztägigen mit zeitlich bestimmten
  Veranstaltungen. Unterschiedliche Schreibweisen wie „Kerwe“/„Kerb“ bleiben
  vorsichtshalber getrennt. Auch mehrtägige Feste werden nicht mit einzelnen
  Programmpunkten verschmolzen.
- Die Veröffentlichungs-ID wird deterministisch aus den vorhandenen IDs gewählt.
  `source_events` enthält für jeden Bestandteil ID, Quelle, URL und Status.
  Fehlende Detailfelder werden aus anderen Bestandteilen ergänzt. Bei
  widersprüchlichen bzw. unbekannten Preisangaben wird kein bedingungsloser
  kostenloser Eintritt beworben. Die rohe Tabellen-API bleibt eine Ansicht
  der einzelnen Quellen; ihr Vertrag und die Darstellung werden in Schritt 7
  separat geprüft.
- Eindeutige Absagepräfixe im Titel, etwa „ABGESAGT: …“ oder „Entfällt: …“,
  sowie expliziter Status `cancelled` werden als Absage gespeichert. Reine
  Erwähnungen früherer Absagen im Beschreibungstext lösen keine Absage aus.
  Bei einer sicheren Dublette hat eine bestätigte Absage Vorrang vor einem
  weiterhin regulären Eintrag. Abgesagte Termine bleiben mit Status
  `cancelled` erhalten; die sichtbare Kennzeichnung wird in Schritt 7 geprüft.
- DLRG-Kalenderexporte können nun explizite tägliche, wöchentliche, monatliche
  oder jährliche Regeln (`RRULE`), zusätzliche Tage (`RDATE`), Ausnahmen
  (`EXDATE`) und einzelne Verschiebungen/Absagen (`RECURRENCE-ID`) enthalten.
  Der ursprüngliche Serienplatz bestimmt die ID auch bei einer Verschiebung.
  Jede einzelne tatsächliche Adresse wird anschließend nach den vorhandenen
  Ried-Gebietsregeln geprüft. Bereits separat exportierte Einzeldaten behalten
  ihre bisherigen IDs. Ganztägige Enddaten bleiben gemäß RFC 5545 exklusiv.
- Regeln müssen genau eine explizite Grenze (`COUNT` oder `UNTIL`) haben.
  Höchstens 1.000 Vorkommen pro Export; `UNTIL` höchstens drei Jahre nach
  Serienbeginn. Keine unbegrenzten Serien, sub-täglichen Regeln, mehreren
  täglichen Uhrzeiten, `PERIOD`-Zusatzdaten, `EXRULE` oder
  `RANGE=THISANDFUTURE`. Verwaiste oder doppelte Ausnahmen, unpassende
  Datentypen, ungültige Intervalle und nicht existierende Sommerzeit-Uhrzeiten
  verhindern die Veröffentlichung des gesamten Exports. Die nach Expansion
  erhaltene Anzahl muss weiterhin zur vom Anbieter angekündigten Zahl passen.
- Aus einer vergangenen Kerwe oder einem Volkslauf wird kein Folgetermin
  erfunden. Unbefristete Wiederholungshinweise auf HTML-Seiten bleiben ohne
  belegten Gültigkeitszeitraum und Ausnahmen zurückgestellt. Der PDF-Import
  aus Schritt 5 bleibt durch die nicht erreichbare Originaldatei blockiert.

Grundlagen: [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) und die
[offizielle dateutil-Dokumentation](https://dateutil.readthedocs.io/en/stable/rrule.html).
`python-dateutil>=2.9,<3` ist als direkte Worker-Abhängigkeit angegeben.

Prüfung: 23 zusätzliche Regressionstestfälle; vollständige lokale Worker-Suite
183 bestanden, 14 übersprungen. Ruff wird für die geänderten Python-Dateien
geprüft. Tests decken Quellenreihenfolge, Quellenbelege, konkurrierende
Absagemeldungen, unterschiedliche Kurszeiten, Ausnahmen, Winterzeitwechsel,
Jahreswechsel und vollständigen Abbruch bei unzuverlässigen Exporten ab.
Produktiver VPS-Import und sichtbare Anzeige sind damit nicht nachgewiesen.

Live-Simulation am 7. Oktober: TV Bürstadt 25, KKM 13, SG Hüttenfeld 11,
DLRG 19, Hofheimer Volkslauf 1 und Neuschloß 14 bestätigte Vorkommen.
Der dynamische TV-Hofheim-Jahreskalender liefert aktuell keine auswertbare
Kalenderansicht; zwei Abrufversuche scheitern kontrolliert vor dem Abgleich.
Dieser Anbieterfehler ist unabhängig von der Erweiterung für Kalenderexporte
und wird als offener Prüfpunkt für Schritt 7 festgehalten. Die sechs erfolgreichen
Quellen wurden mit echten HTTP-Abrufen und simulierten Datenbankoperationen
geprüft; keine produktive Datenbank wurde verändert. Die sichere
Dublettenregel ist zusätzlich mit kontrollierten Quellenpaaren getestet.

## Schritt 7: Anzeige und tatsächliche Importabdeckung

Geprüft und implementiert am 7. Oktober 2026. Beide Oberflächen verwenden
nun denselben Kalendervertrag: `/termine` und der Eventbereich von `/statistik`.

### Korrekturen

- Kein fester September-Stichtag mehr. Der Server übergibt einen Zeitstand
  für eine konsistente erste Darstellung; der Browser aktualisiert ihn jede
  Minute und bei erneutem Fokus. Archiv/Anstehend richten sich nach dem
  tatsächlichen Ende, sodass laufende Mehrtagesveranstaltungen sichtbar bleiben.
- „Alle Kommunen“ umfasst die vier vereinbarten Ried-Gemeinden unabhängig von
  der Auswahl für Sozialstatistiken. Orte außerhalb dieses Gebiets werden
  auch in der Anzeige ausgeschlossen. Suche, Gemeinde, Rubrik und Zeitraum
  wirken identisch auf Kalender und Liste. Die Tagesauswahl schränkt erst
  die Liste ein; die anderen passenden Kalendertage bleiben auswählbar.
- Der Wochenendfilter berücksichtigt überschneidende Veranstaltungen und
  das aktuelle Wochenende auch am Samstag/Sonntag. „Diesen Monat“ bezeichnet
  den laufenden Kalendermonat, nicht einen 35-Tage-Abstand. Alle Datums- und
  Uhrzeitzuordnungen erfolgen in Europe/Berlin, unabhängig von Browser-Zeitzone
  oder UTC-Schreibweise der API.
- Lange Veranstaltungen werden für alle betroffenen Tage des sichtbaren
  Monats markiert. Der bisherige 14-Tage-Abbruch entfällt; nur höchstens
  31 sichtbare Tage werden untersucht, ohne den gesamten Zeitraum aufzufalten.
- Beide Seiten fordern das Archiv ausdrücklich mit `include_past=true` an.
  Der vollständige Eventdatensatz überschreitet bereits 2 MB; dieser Abruf
  wird deshalb ohne Next.js-Einzelobjektcache durchgeführt. Ablaufhinweise
  des Backends werden weiterhin geprüft.
- Fehler der unabhängigen Statistik-/Einrichtungsabfragen entfernen den
  Eventbereich nicht mehr. Fehlende Kennzahlen und Event-API-Fehler erhalten
  jeweils einen eigenen Hinweis. `/termine` ersetzt Fehler nicht mehr durch
  den statischen Beispielkatalog.
- Absagen/Verschiebungen werden in Karten und Listen gekennzeichnet; beim
  ICS-Export bleibt eine Absage `STATUS:CANCELLED`. Nur ausdrücklich bestätigter
  kostenloser Eintritt wird so beworben. Tagesgrenzen 00:00–23:59 werden als
  „Ganztägig / Uhrzeit siehe Quelle“ angezeigt. Ein künstlicher Tagesabschluss
  23:59 wird nicht als bekannte Enduhrzeit ausgegeben. Bei tatsächlichem Ende
  an einem anderen Tag enthält die Zeitangabe auch dessen Datum.
- Die Rubrikzuordnung prüft den Titel vor ergänzender Prosa und verwendet
  genauere Sportbegriffe. „rad“ in „traditionell“ oder „lauf“ und „turn“ als
  beliebige Wortbestandteile sollen keine Feste/Konzerte
  aus ihren Rubriken verdrängen. Kerwelauf und Volkslauf bleiben Sport.
- TV Hofheim: Der öffentliche WordPress-Seitencache liefert einen veralteten
  Kalender-Nonce und eine leere Anzeigeantwort. Ein frischer Seitenabruf
  mit zeitgestempeltem Abfrageparameter liefert die vier bekannten Termine.
  Der Import lädt diese Metadaten nun frisch vor der vorgesehenen
  read-only `display_calendar`-Anfrage. Ein Regressionstest prüft diesen Ablauf.

### Nachweise und Grenzen

- Live-Simulation aller sieben Vereins-/Ortsteilquellen: erneut **87 lokal
  bestätigte Vorkommen**, davon 29 bevorstehend. Für die Simulation werden
  echte öffentliche Abrufe, aber simulierte Datenbankoperationen verwendet.
- Der produktive öffentliche Endpunkt
  [social/events mit Archiv](https://open-ried-sens.duckdns.org/api/v1/collected/social/events?include_past=true)
  lieferte beim ersten Abruf 1.394 Einträge: Bürstadt 479, Lampertheim 489,
  Groß-Rohrheim 110, Bürgerstiftung Biblis 302 und Neuschloß 14. Die sechs
  weiteren Vereinsquellen fehlten dabei; `source_events` war ebenfalls noch
  nicht enthalten. Bei der folgenden lokalen Browserprüfung mit echten
  Backenddaten waren 1.399 Einträge vorhanden. Das ist kein Beleg für einen
  vollständigen produktiven Import aller neuen Vereinsquellen.
- Browserprüfung des lokalen Produktionsbuilds: Biblis-Filter liefert
  passende Tagesmarkierungen; Auswahl 09.10.2026 liefert einen Treffer,
  während die Markierungen anderer passender Tage erhalten bleiben.
  Archivwechsel zeigt 228 vergangene Bibliser Termine. `/statistik` zeigt
  trotz aktuell fehlender Sozialkennzahlen weiterhin den Eventbereich.
  Beim geprüften Tagesfilter wurden keine Browser-Konsolenfehler erfasst.
- Lokale Prüfungen: vollständige Frontend-Suite **206 bestanden**, TypeScript
  ohne Fehler, ESLint für die Kalenderkomponenten und neuen Helfer ohne Fehler.
  Der breitere Prüflauf enthält bestehende Warnungen zu ungenutzten Variablen
  und zwei bereits vorhandene `no-explicit-any`-Fehler in `regionalStats.ts`
  außerhalb der geänderten Exportzeile. Worker-Suite **195 bestanden,
  14 übersprungen**; Ruff für geänderte Python-Dateien erfolgreich.
  Produktionsbuild geprüft. `Frontend CI` führt nun die Event-Regressionstests
  ausdrücklich aus.
- Schritt 5 bleibt offen: beide Groß-Rohrheimer PDF-Dateien liefern HTTP 410.
  Die produktive Aufnahme der zusätzlichen Vereinsquellen und die Anwendung
  der neuen Dublettenveröffentlichung müssen am laufenden VPS separat
  bestätigt werden. Erfolgreiche CI-/GHCR-Veröffentlichungen allein ersetzen
  diesen Nachweis nicht. Zum damaligen Prüfzeitpunkt war vorgesehen, dass
  Watchtower automatische Image-Aktualisierungen übernimmt; sein tatsächlicher
  Laufzustand wurde in dieser Prüfung nicht ermittelt.

### Betriebsstand korrigiert — 21.10.2026

Eine spätere read-only Prüfung des VPS ergab, dass Watchtower mit
`WATCHTOWER_MONITOR_ONLY=true` läuft und Container nicht automatisch ersetzt.
Der aktive Compose-Stack liegt unter `/root` mit
`docker-compose.yml` und `docker-compose.override.yml`; der separate
Repository-Checkout lag auf `d5d0c84`. Eine GHCR-Veröffentlichung allein belegt
keinen produktiven Vereinsimport. Die offenen Quellen müssen nach einer
kontrollierten Bereitstellung weiterhin über Quellenstatus, API und Website
geprüft werden.

## Ergänzung: produktiven Vereinsimport reparieren

Der inzwischen erreichbare öffentliche
[Importstatus](https://open-ried-sens.duckdns.org/api/v1/collection/status)
zeigt am 07.10.2026 bei TV Bürstadt, KKM Bürstadt, SG Hüttenfeld, DLRG
Lampertheim und Hofheimer Volkslauf `ForeignKeyViolation` in der Speicherphase.
TV Hofheim meldete beim älteren Versuch einen Verarbeitungsfehler.

Die Vereinsimporte berechneten einen gemeinsamen Hash aus den Hashes aller
abgerufenen Seiten, ohne Daten unter diesem gemeinsamen Hash zu archivieren.
Die Veröffentlichung referenzierte dadurch einen nicht vorhandenen Eintrag in
`collected_payloads`. Die Fremdschlüsselprüfung rollte auch die zuvor eingefügten
Termine zurück. Das erklärt, warum erfolgreiche öffentliche Abrufe trotzdem
keine neuen Vereinsveranstaltungen sichtbar machten.

Der Import archiviert jetzt innerhalb derselben Veröffentlichungstransaktion
ein JSON-Manifest mit Quellkennung und den Hashes aller tatsächlich archivierten
Antworten. Sein Inhalt bestimmt den Veröffentlichungshash. Die ursprünglichen
HTML-/ICS-Antworten und ihre Abrufbelege bleiben erhalten.

Nachweise:

- Drei neue Integrationstests mit echten PostgreSQL-Fremdschlüsseln prüfen
  einen einfachen Kalender, den mehrseitigen SGH-Kalender und den dynamischen
  Hofheimer Kalender, jeweils mit erneutem Import ohne Duplikate.
  Die unveränderte frühere Importversion scheitert in allen drei Fällen mit
  `collected_dataset_versions_payload_sha256_fkey`; die Korrektur besteht sie.
- Erneute öffentliche Live-Abrufe liefern alle sieben Quellen erfolgreich.
  Zusätzlich wurde die komplette Live-Kette in einer isolierten lokalen
  TimescaleDB bis zur Veröffentlichung geprüft: TV Bürstadt 25, KKM Bürstadt 13,
  SG Hüttenfeld 11, DLRG Lampertheim 19, TV Hofheim 4, Hofheimer Volkslauf 1,
  Neuschloß 14; insgesamt 87 veröffentlichte Termine.
- Diese Testdatenbank ist vom produktiven VPS getrennt. Die tatsächliche
  produktive Übernahme muss nach Veröffentlichung des korrigierten Images
  erneut über den öffentlichen Importstatus und Eventbestand geprüft werden.
- Die vollständige Worker-Suite besteht mit allen Datenbanktests in einer
  isolierten TimescaleDB: **212 bestanden, keine übersprungen**. Ruff für die
  geänderten Python-Dateien ist erfolgreich.
- Die fehlenden Groß-Rohrheimer PDFs aus Schritt 5 bleiben ein anderer offener
  Punkt; ihre Termine werden nicht aus unvollständigen Auszügen erfunden.

### Produktiver Abschlussnachweis

Die Korrektur wurde als `13d129fd12ffd02f1f1ae8aba27955cc4b38c71b` auf
`main` veröffentlicht. Der zugehörige
[FastAPI-&-Docker-CI/CD-Lauf](https://github.com/erik-metz/kamue-digital-lora-sensor/actions/runs/37590226471)
ist erfolgreich abgeschlossen, einschließlich aller 16 Container-Builds und
GHCR-Veröffentlichungen.

Die anschließende öffentliche Prüfung am 07.10.2026 bestätigt:

- Alle sieben Vereins-/Ortsteilquellen melden `success`, ohne Fehler.
- Der öffentliche Eventbestand enthält nun auch TV Bürstadt 25, KKM Bürstadt 13,
  SG Hüttenfeld 11, DLRG Lampertheim 19, TV Hofheim 4 und Hofheimer Volkslauf 1
  als primäre Quellen; Neuschloß bleibt mit 14 vertreten. Insgesamt sind
  87 Einträge diesen sieben Quellen primär zugeordnet.
- Der gemeinsame Bestand umfasst 1.481 sichtbare Einträge einschließlich Archiv
  und Quellenzuordnungen. Bei Dubletten können zusätzliche Vereinsvorkommen in
  `source_events` einer anderen primären Quelle zugeordnet sein; archivierte
  Einzelvorkommen bleiben erhalten.

Damit ist die zuvor offene produktive Aufnahme der Vereinsquellen bestätigt.
Die HTTP-410-PDF-Quellen aus Schritt 5 bleiben offen.

## Alternative Quellen für Groß-Rohrheim

Die erneute Recherche vom 07.10.2026 ist in
[Groß-Rohrheim: Alternativen zum Jahreskalender](ried-events-gross-rohrheim-alternativen.md)
festgehalten. Sie enthält sechs konkret datierte Lücken gegenüber dem geprüften
Backendbestand sowie weitere Angebote und die Reihenfolge zur Umsetzung.
Besonders geeignet ist der erreichbare strukturierte Kalender der Musikkiste.
In diesem Rechercheschritt wurden noch keine zusätzlichen Importquellen aktiviert.
