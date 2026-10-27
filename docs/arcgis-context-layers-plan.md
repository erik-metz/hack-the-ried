# ArcGIS-Kontextebenen für HackTheRied

## Ziel und Umsetzungsschritte

1. **Quellen verifizieren:** öffentliche Feature-Services, Felder, Lizenz und regionale Abdeckung für Landbedeckung, Hochwasserszenarien und Zensus prüfen.
2. **Regionalen Datenzugang implementieren:** feste erlaubte Dienste, ausschließlich lesende Abfragen, begrenzte Pagination, Timeout, Cache, keine unvollständigen Ergebnisse als vollständige Karten veröffentlichen.
3. **Karte erweitern:** drei einzeln aktivierbare Ebenen in den vorhandenen Kategorien und teilbaren URLs; nur bei Aktivierung und passendem Zoom laden. Legenden, Popup-Details, Herkunft, Lizenz, Datenstand und Fehler-/Leerzustände anzeigen.
4. **Prüfen:** Tests für Quellenvertrag, Pagination, Ausfälle, unbekannte Werte und URL-/Preset-Kompatibilität; TypeScript, Lint, Build und Live-Abfragen; Kartenanzeige im Browser kontrollieren.
5. **Veröffentlichen:** eigene Änderungen gezielt committen/pushen und Frontend CI für genau diesen Commit verfolgen.

## Verifizierte Quellen (9. Oktober 2026)

Alle Dienste liegen auf `services2.arcgis.com/jUpNdisbWqRpMo35`. Öffentlicher Zugriff wurde ohne Token geprüft. Der feste Auswahlbereich ist WGS84 `8.35,49.55,8.58,49.76` (Ried um Bürstadt, Lampertheim, Biblis und Groß-Rohrheim). Dies ist kein Zuschnitt auf Gemeindegrenzen: ausgewählt werden schneidende Geometrien, die über den Rand hinausreichen können.

| Ebene | ArcGIS-Item | Sublayer | Regionale Treffer | Datenstand / Lizenz |
| --- | --- | --- | --- | --- |
| Landbedeckung | `6bb9b8ef9de446078796b71ce49b8a36` | 0 | 8306 | LBM-DE2021, Mindestkartierfläche 1 ha; © BKG 2025, CC BY 4.0 |
| Hochwasserrisiko | `91058f6620764a05a43d1d15cdf60d68` | 0 / 1 / 2 | 29 / 49 / 15 | Zyklus 2016–2021, Bearbeitung 2024; © WasserBLIcK/BfG und zuständige Behörden der Länder, 2020, CC BY 4.0 |
| Zensus | `87285c05ac3b498a8cbf257c3c23a37d` | 1 (1 km) | 436 | 15.05.2022; © Statistische Ämter des Bundes und der Länder 2024, Geometrie © GeoBasis-DE / BKG (2024), DL-DE BY 2.0 |

Item-Metadaten: `https://www.arcgis.com/sharing/rest/content/items/{item}?f=json`.

Die erste Recherche nannte beim Hochwasser den Katalogstand 2025. Für die Anzeige gelten stattdessen die detaillierten Metadaten oben. Das Zensus-Gitter wird nach Einwohnerzahl eingefärbt; es ist keine Hitzerisikoberechnung. Fehlende und negative numerische Quellenwerte sind unbekannt. Der Hochwasser-Wiederkehrwert ist ein Quellenstring (z. B. `>200`) und bleibt unverändert.

## Technische Entscheidungen

- Umsetzung vollständig im Next.js-Frontend samt Route Handler; keine Datenbankmigration oder VPS-Änderung erforderlich.
- `GET /api/context-layers?layer=landcover|floodrisk|census` erlaubt keine frei wählbaren URLs, Felder oder räumlich unbegrenzten Abfragen.
- Seiten mit 1000 Features, sortiert nach Objekt-ID, maximal 10 Seiten je Sublayer und 40 Sekunden Gesamtzeit. Bei Ausfall oder Überlauf HTTP 503, keine Teilveröffentlichung. Leere vollständige Antworten bleiben sichtbar als null geladene Flächen.
- Upstream-Cache 24 Stunden, erfolgreiche Antworten Browser-Cache 1 Stunde / CDN 24 Stunden, Fehler nicht cachen. Next.js kann besonders große Upstream-Antworten vom Data Cache ausschließen; sie werden dennoch ausgeliefert.
- Geometrie generalisiert mit `maxAllowableOffset=0.00005` Grad (Hochwasser: `0.0002`) und fünf Nachkommastellen; keine Vermessungsgrundlage. Aufbereitungs-/Vereinfachungshinweis steht in der Oberfläche.
- Ebenen standardmäßig aus; bestehende Presets bleiben unverändert. Landbedeckung/Zensus ab Zoom 12, Hochwasser ab Zoom 10. Separate Leaflet-Panes unter Sensoren und Fahrzeugen. Abbruch beim Deaktivieren/Unmount, Wiederholungsbutton nach Fehlern.
- Schutzgebiete, Wetterwarnungen, Ladepunkte und weitere Quellen sind nicht Teil dieser ersten Implementierung; vorhandene ähnliche Ebenen bleiben bestehen. Automatische Standortanalysen und weitere Zensusmerkmale sind mögliche spätere Erweiterungen.

## Lokaler Abschlussnachweis

- Alle 228 Frontend-Tests erfolgreich, einschließlich acht neuer Datenzugangstests und URL-Roundtrip für die neuen Ebenen.
- TypeScript/Produktionsbuild und gezieltes ESLint erfolgreich.
- Produktionsserver: alle drei API-Antworten HTTP 200; Landbedeckung 8306 Features / 3.38 MB, Hochwasser 93 / 2.01 MB, Zensus 436 / 0.13 MB.
- Browser: drei Canvas-Ebenen, korrekte geladene Flächenzahlen, Quellen-/Lizenzhinweise sowie Zoomschwellen kontrolliert. Screenshot außerhalb des Repositorys: `/tmp/ried-context-map.jpg`.
- Veröffentlichung und CI-Ergebnis werden im abschließenden Chatbericht mit Commit und Workflow-Link dokumentiert.

## Schritt 2: Datenzugang für die vier übrigen Quellen

Dieser Schritt ergänzt ausschließlich den geprüften Datenzugang. Die Kartenanzeige ist Schritt 3 und wartet auf gesonderte Freigabe.

### Bestandsaufnahme

- **Schutzgebiete:** Die UI kennt `nature`; im Registry-Worker ist der allgemeine Import `environment-published-source` jedoch deaktiviert und ohne Quellen-URL. Die Esri-BfN-Quelle ergänzt verifizierte Polygone aller sieben Schutzgebietskategorien.
- **Messstellen:** Das BfG-Verzeichnis fehlte als eigener Datenzugang. Es enthält Standorte/Metadaten, keine Messzeitreihen. Für das Ried werden Grundwasser und Oberflächenwasser abgefragt, keine Meeresstationen.
- **Wetterwarnungen:** DWD-Modell-, Radar- und MOSMIX-Daten sind vorhanden, aber keine entsprechende Warnpolygonintegration. Im Esri-Dienst ist nur Sublayer 1 die Warnung; Sublayer 0 enthält Kreisgrenzen und wird nicht als Warnung übernommen.
- **Ladesäulen:** `chargers.py` importiert bereits direkt das BNetzA-Register. Der Esri-Stand wird separat als Vergleichsquelle bereitgestellt; der direkte Import bleibt die primäre Quelle. Eine spätere Anzeige muss über die Ladeeinrichtungs-ID zusammenführen, statt Marker zu duplizieren.

### Vertrag und regionale Abdeckung

Neuer Endpunkt: `GET /api/supplementary-layers?layer=protected|monitoring|warnings|chargers`.

| Quelle | Item | Sublayer und lokale Treffer | Datenstand / Lizenz |
| --- | --- | --- | --- |
| Schutzgebiete | `2beeb8ed32d94730b5b70750ba434a4d` | LSG 0: 9; NSG 1: 16; Naturparke 2: 1; Nationalparke 3: 0; FFH 4: 13; Biosphärenreservate 5: 0; Vogelschutz 6: 7; insgesamt 46 | LSG/NSG 2023, FFH/Vogelschutz 2019, übrige 2025; © BfN 2025, GeoNutzV |
| Messstellen | `7df2fba125e3409680b653d81fde39b5` | Grundwasser 1: 24; Oberflächenwasser 2: 39; insgesamt 63 | Katalogstand 10/2022; gehostete Daten zuletzt bearbeitet 08/2023; © BfG 2023, GeoNutzV |
| Wetterwarnungen | `e7e4164319284754a9f72f0c956efb40` | Warnungen 1: zum Prüfzeitpunkt 0; dynamischer Bestand | Aktualisierung laut Metadaten alle 30 Minuten; DWD, GeoNutzV/DWD-Nutzungsbedingungen; Geometrien © GeoBasis-DE / BKG 2021, modifiziert |
| Ladesäulen | `bc3c97f73d6b4be4921be8560fbc325a` | 0: 158 | Juli 2026; Bundesnetzagentur / Esri Deutschland, CC BY 4.0 |

Alle Zahlen beziehen sich auf denselben WGS84-Auswahlbereich wie oben. Flächen werden durch Überschneidung ausgewählt; Kategorien können sich überlagern. Die Zahlen sind keine Gemeindezählungen.

### Datenzugang und Qualitätsregeln

- Feste Dienste, Sublayer, Feldlisten und Region; höchstens zehn Seiten mit je 1000 Features pro Sublayer, 40 Sekunden Gesamtzeit und 4 MB Antwortlimit. Objekt-IDs werden je Sublayer auf Vollständigkeit und Duplikate geprüft. Fehlende Quellen oder Teilergebnisse ergeben HTTP 503.
- Nur gültige Punkt- bzw. Polygongeometrien; Datenantwort enthält Quellenherkunft, Datenstand, Lizenz und Kategorie je Feature. Keine künstlichen Messwerte, Betriebszustände oder Ladeplatzbelegung.
- Historische Bestände: Upstream-Cache 24 Stunden, HTTP-Cache 1 Stunde / CDN 24 Stunden.
- Warnungen: keinerlei Cache; Quellmetadaten `editingInfo.dataLastEditDate` müssen vorhanden und höchstens 90 Minuten alt sein (fünf Minuten Uhrtoleranz). Aktualität wird nach der Abfrage erneut gegen die Zeit geprüft. Ein Abrufdatum ersetzt niemals den Quelldatenzeitpunkt.
- Warnungen enthalten nur öffentliche `Actual`-Meldungen; `Cancel`, Testmeldungen und abgelaufene Intervalle werden ausgeschlossen. Zukünftiger Beginn bleibt als kommende Warnung erhalten. Ungültige/zeitzonenlose Zeitangaben führen zu HTTP 503.
- Leerer Warnbestand ist nur bei bestätigter Quellenaktualität erfolgreich. Dies bestätigt den verfügbaren Esri-Bestand, nicht dessen Übereinstimmung mit jedem amtlichen DWD-Publikationskanal. Der Dienst kann laut Anbieter 30 Minuten verzögert sein; amtlicher Verweis bleibt `https://www.dwd.de/warnungen`.

### Nächster freizugebender Schritt 3

Schutzgebiete in die bestehende `nature`-Ebene einbinden; Messstellen und DWD-Warnungen mit Quellen-/Zeitstatus ergänzen; Ladesäulen anhand BNetzA-ID mit der vorhandenen Ebene abgleichen. Keine zweite, doppelte Ladesäulenebene. UI-Tests und Browserprüfung gehören zu diesem nächsten Schritt.

### Abschlussnachweis für Schritt 2

- 238 Frontend-Tests erfolgreich, davon zehn neue Tests für diese Quellen; gezieltes ESLint und Produktionsbuild erfolgreich.
- Live-Abfragen über den lokalen Produktions-Endpunkt: Schutzgebiete 46 Features (159943 Bytes), Messstellen 63 (19761 Bytes), Ladesäulen 158 (68614 Bytes), Warnungen 0 (744 Bytes); alle HTTP 200.
- Der Warnungs-Endpunkt lieferte dabei den echten Quellenzeitpunkt `2026-10-09T17:03:29.772Z` und `Cache-Control: no-store`. Historische Quellen lieferten den vorgesehenen Cache-Header.
- Keine Kartenkomponenten oder VPS-Dateien wurden für Schritt 2 geändert. Die Freigabe für Schritt 3 wird nach Commit, Push und Frontend-CI separat eingeholt.


## Schritt 3: Kartenintegration (freigegeben und implementiert)

- Die bestehende Naturschutzebene verwendet die geprüften BfN-Flächen. Grundwasser- und Oberflächenwassermessstellen sowie DWD-Warnungen sind eigene, standardmäßig ausgeschaltete Ebenen; Auswahl wird in geteilten Karten-URLs erhalten.
- Kategorien, Datenstände, Lizenzen, regionale Abdeckung und vereinfachte Geometrien sind in Legende und Popups erläutert. Messstellen bleiben ausdrücklich ein historisches Verzeichnis ohne Live-Messwerte.
- Ladesäulen werden über normalisierte BNetzA-IDs zusammengeführt. Der direkte Import hat Vorrang; nicht identifizierbare Esri-Datensätze werden ausgeschlossen. Die alte generische Darstellung wird für Schutzgebiete und Ladesäulen deaktiviert.
- Warnungen werden jede Minute ohne Cache abgerufen. Die Anzeige prüft alle 30 Sekunden Quellenalter, Abrufalter und Gültigkeit, entfernt abgelaufene Polygone und kennzeichnet fehlende/veraltete Warnungsdaten. Die amtliche DWD-Warnlage ist direkt verlinkt.
- Browserprüfung: 46 Schutzgebietsflächen, 63 Messstellen, 158 Ladestandorte; derzeit keine gültigen Warnpolygone im bestätigten frischen Esri-Bestand. Quellenaktualisierung am 10.10.2026 um 08:03:09 Europe/Berlin. Ebenenschalter und Quellenlegenden geprüft.
- Prüfung: Frontend-Tests, gezieltes ESLint und Produktionsbuild. Commit, Push und exakter Frontend-CI-Lauf werden im Chatabschluss nachgewiesen. Keine VPS-Änderungen für diesen Schritt.

## Schritt 4: Abschließende Gesamtprüfung (10. Oktober 2026)

Die Gesamtprüfung wurde freigegeben und abgeschlossen. Alle sieben Quellen wurden gemeinsam im lokalen Produktionsbuild geprüft.

| API-Quelle | HTTP | Vollständiger regionaler Bestand |
| --- | --- | --- |
| Landbedeckung | 200 | 8306 Flächen |
| Hochwasserrisiko | 200 | 93 Flächen über drei Szenarien |
| Zensus | 200 | 436 Gitterzellen |
| Schutzgebiete | 200 | 46 Flächen |
| Messstellen | 200 | 63 Standorte |
| Wetterwarnungen | 200 | 0 gültige Polygone im frisch geprüften Esri-Bestand |
| Esri-Ladesäulen | 200 | 158 Standorte |

- Warnungsquelle: `2026-10-10T06:03:09.129Z`, API-Prüfung `2026-10-10T06:29:00.653Z`; Antwort explizit `no-store`. Historische Quellen liefern `public, max-age=3600, s-maxage=86400`.
- Direkter BNetzA-Import zum Prüfzeitpunkt: 411 Standorte im bestehenden, größeren Registerausschnitt. Alle 158 regionalen Esri-IDs sind darin enthalten. Die Karte zeigt deshalb genau 411 eindeutige Marker mit Vorrang des direkten Imports, statt 569 Marker zu erzeugen. Dieser Bestand kann sich mit dem Import ändern.
- Browser: alle sieben Ebenen gemeinsam geladen; vier Polygon-Canvas-Ebenen und 63 Messstellenmarker. Legenden, historische Datenstände, Lizenzen und Warnungszeitpunkt sichtbar. Beim Herauszoomen werden Ladesäulen, Messstellen, Landbedeckung, Zensus und Hochwasser jeweils unterhalb ihrer Zoomgrenzen entfernt; Quellenhinweise bleiben sichtbar. Keine Browser-Konsolenfehler beobachtet.
- Bei der Prüfung behoben: doppelte oder fehlende Objekt-IDs innerhalb eines Sublayers der ersten drei Quellen führen jetzt zu HTTP 503 ohne Teilveröffentlichung und ohne Cache. Gleiche IDs in verschiedenen Hochwasserszenarien bleiben zulässig. Zwei neue Regressionstests sichern dies ab.
- 248 Frontend-Tests erfolgreich; gezieltes ESLint für beide API-Routen, Kartenkomponenten und Quellen-/Darstellungshelfer sowie Produktionsbuild erfolgreich. Bestehende Tests decken außerdem Pagination, Teilausfälle, veraltete Warnungsquellen, abgelaufene Meldungen, unbekannte Werte, Ladesäulenabgleich und geteilte Karten-URLs ab. Fehlerszenarien wurden mit kontrollierten Testantworten geprüft, nicht durch Veränderungen an öffentlichen Diensten.
- Keine VPS-Änderungen. Veröffentlichung und der Frontend-CI-Lauf für diesen Abschlusscommit werden im Chat nachgewiesen.

Damit sind die sieben Datenquellen implementiert und gemeinsam geprüft. Weitere Datenquellen oder Analysen sind zusätzliche Aufgaben.

