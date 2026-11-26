# Plan: Glasfaser, Bau-Pläne, Wahlbezirke und Straßen-KI wieder auf die Karte

Stand: 26.11.2026. Betrifft die Kartenebenen `broadband`, `devplans`,
`elections` und `road`, die `/api/v1/map/collected-layers` derzeit unter
`unavailable` meldet.

## 1. Ausgangslage

### 1.1 Was früher angezeigt wurde

Alle vier Ebenen kamen am 17.09.2026 ins Frontend, als fest eingetragene Listen:

| Ebene | Commit | Datei | Inhalt |
| --- | --- | --- | --- |
| `elections` | `48d18eb` | `lib/electionsData.ts` (`BASELINE_DISTRICTS_GEOJSON`) | Rechteckige Bezirke mit ausgedachten Stimmenzahlen. Die Ergebnis-Links auf `votemanager.ekom21.de` sind tot, der Host existiert nicht mehr. |
| `broadband` | `c646a6f` | `lib/infrastructureData.ts` (`VERIFIED_BROADBAND_AREAS`) | Dreiecke mit Anbietern und Ausbauquoten, ohne Quelle. |
| `road` | `c646a6f` | dieselbe Datei (`VERIFIED_ROAD_SEGMENTS`) | Schulnoten je Straßenabschnitt, `inspectedBy: "ZAKB Müllfahrzeug-KI"` bzw. `hessen_mobil_zeb`, ohne Abruf. |
| `devplans` | `1d1f9a8` | `lib/realestateData.ts` (`BASELINE_DEVELOPMENT_PLANS`) | Zum Beispiel „Bebauungsplan Sonneneck II“. Die hinterlegten Links leiten am 26.11.2026 auf die Startseite von buerstadt.de um. |

Ab `b548ba7` (24.09.2026) wurden diese Listen entfernt, siehe
`www/vps/map-restoration-audit.md`. Seitdem sind die Ebenen leer.

### 1.2 Was es heute schon an echten Daten gibt

- `bnetza-broadband-households`: Breitbandatlas-XLSX, Prozent der Haushalte je
  Gemeinde, Stand 12/2025. Wird im Breitband-Widget angezeigt, hat aber keine
  Flächen.
- `bundeswahlleiterin-2025`: Ergebnisse der Bundestagswahl 2025 je Wahlbezirk
  (`btw25_wbz.zip`). Enthält keine Bezirksgrenzen.
- `hvbg-boris-2024`: Bodenrichtwerte per WFS. Das ist die Vorlage für den neuen
  Bau-Plan-Adapter.
- `bkg-topplus` / Regen: geplante WMS-Kachelabrufe über `map_tiles.py`. Das ist
  die Vorlage für die Breitband-Kacheln.

## 2. Gefundene Quellen (geprüft am 26.11.2026 vom VPS aus)

### 2.1 Glasfaser: Breitbandatlas der Bundesnetzagentur – **verfügbar**

- **WMS:** `https://breitbandatlas-wms.gigabit-grundbuch.online/WMS/Breitbandatlas`.
  `GetCapabilities` liefert HTTP 200 mit 856 Ebenen, darunter Festnetz im 100-m-Gitter:
  - `Festnetz__100m_Gitter__Glasfaser_(FTTB/H)_≥_1000_Mbit/s…`
  - `Festnetz__100m_Gitter__Privathaushalte_≥_1000_Mbit/s…` (dazu Stufen 400, 200, 100, 50, 30, 16 und 10 Mbit/s)
  - `Festnetz__100m_Gitter__Alle_Unternehmen_≥_…`

  Der Dienst bietet kein `GetFeatureInfo`, nur Bilder (PNG/SVG).
- **Vektordaten:** `Versorgungsdaten_Gitterzellen_Stand_20260630_gpkg.zip`,
  311 MB, zuletzt geändert am 10.11.2026, HTTP 200. Download unter
  `https://data.bundesnetzagentur.de/Bundesnetzagentur/GIGA/DE/Breitbandatlas/Downloads/`.
- **Nutzung:** Laut WMS-Dokumentation (Stand November 2026) „geldleistungsfrei zum
  Download und zur Online-Nutzung“ und ohne Zugangsbeschränkung. Pflicht ist der
  Quellenvermerk **„© BNetzA. Datenstand: 06.2026.“**, bei Bearbeitung mit
  Veränderungshinweis.
- **Hinweis zu den Ebenen-Namen:** Sie enthalten eine numerische Endung, etwa
  `…s722963448`. Sie können sich also bei jeder Datenveröffentlichung ändern, und
  der Herausgeber behält sich Anpassungen vor (Abschnitt 4.4). Der Name darf daher
  nicht fest im Code stehen.

### 2.2 Bau-Pläne: Bauleitplanungskataster Kreis Bergstraße – **verfügbar für Lampertheim**

- **WFS:** `https://www.gdi-inspireumsetzer.de/ows/services/org.20.aab6a228-f01d-475b-b58d-a091bb6c3265_wfs`.
  Feature-Typ `ft1:Planung` (Namespace `http://www.esdi-humboldt.eu/hale/gpkg`),
  GeoJSON in EPSG:4326, 1.533 Objekte, Seiten zu 1.000.
- **WMS** desselben Dienstes mit den Ebenen `Bebauungsplaene`,
  `Flaechennutzungsplaene` und `Weitere_Satzungen`. Gespiegelt im Geoportal Hessen
  unter `layer_id=56856`.
- **Felder:** `NAME`, `TYP`, `RECHTSKR` (Rechtskraft), `SATZBESCHL`,
  `PLANZEICHN` und `PLANTEXT` (PDF-Links, geprüft: HTTP 200, `application/pdf`),
  `AGS`, `GEMEINDE`, `GEMARKUNG`, `AKT_DATENS`.
- **Lizenz:** Datenlizenz Deutschland – Namensnennung 2.0, „Es gelten keine
  Bedingungen“.
- **Abdeckung im Ried:** Nur **Lampertheim** (AGS 06431013) ist enthalten, mit 129
  Bebauungsplänen, 5 Satzungen und 5 Flächennutzungsplänen. Bürstadt, Biblis und
  Groß-Rohrheim fehlen. Bürstadt verweist auf seiner Website auf das BürgerGIS des
  Kreises; das ist ein proprietärer Kartenclient ohne offene WMS/WFS-Schnittstelle.
  Im Katalog des Geoportals Hessen gibt es für diese drei Gemeinden keinen Dienst.

### 2.3 Wahlbezirke – **Grenzen nicht öffentlich**

- Weder im Geoportal Hessen, bei der Bundeswahlleiterin (nur Wahlkreise) noch bei
  votemanager habe ich offene Bezirksgrenzen gefunden.
- Die Wahlbekanntmachungen der Städte nennen Wahlbezirk, Bezeichnung und
  **Wahlraum mit Adresse**, aber keine Straßenzuordnung. Beispiel Lampertheim 2021:
  20 allgemeine Wahlbezirke und 6 Briefwahlbezirke. Grenzen lassen sich daraus
  nicht ableiten.
- Echt verfügbar sind damit: Ergebnisse je Wahlbezirk (`bundeswahlleiterin-2025`)
  und Wahlräume als Adressen (Wahlbekanntmachung).

### 2.4 Straßen-KI (ZAKB) – **kein offener Zugang**

- Im Repo gibt es keinen Adapter, Abruf oder Export für ZAKB-Straßenzustandsdaten.
  Die alten Werte waren fest eingetragen. Auf zakb.de finde ich nichts zu
  Straßenzustand oder KI.
- Systeme dieser Art laufen bei Kommunen meist über Anbieter wie vialytics
  (Smartphone hinter der Windschutzscheibe, Auswertung in der Cloud). Ein Export
  wäre dann nur über ZAKB bzw. dessen Anbieter möglich.
- Hessen Mobil ZEB (amtliche Zustandserfassung für Bundes- und Landesstraßen):
  Kein offener Dienst im Geoportal Hessen gefunden.

## 3. Zielbild

Jede der vier Ebenen bekommt eine echte, nachvollziehbare Quelle. Fehlt sie für
eine Gemeinde, bleibt die Lücke sichtbar und wird benannt. Beispieldaten gibt es
nicht mehr.

| Ebene | Ziel | Darstellung |
| --- | --- | --- |
| `broadband` | Breitbandatlas, 100-m-Gitter, alle vier Gemeinden | Kacheln über den bestehenden Kachel-Proxy; Werte per Klick aus der GeoPackage-Datei |
| `devplans` | Bauleitplanungskataster, zunächst Lampertheim | Polygone mit Name, Status, Rechtskraft und PDF-Links |
| `elections` | Wahlräume mit echten Ergebnissen je Wahlbezirk; Grenzen erst mit Daten der Wahlämter | Punkte, später Polygone |
| `road` | ZAKB-Export, sobald Zugang besteht | Liniensegmente mit Note und Erfassungsdatum |

## 4. Übergreifender Umbau (vor den einzelnen Ebenen)

Diese Punkte beseitigen die Ursachen, weshalb Ebenen leer bleiben konnten, ohne
dass es auffiel.

### 4.1 Ein gemeinsamer Ebenen-Vertrag

Heute ist eine Ebene an mehreren Stellen getrennt definiert:

- in `sources.json` (Quelle),
- im Adapter (`publish(conn, source, 'map/layers/<id>', …)`),
- in der Menge `expected` in `map_layers()` (`www/vps/api/v1/endpoints/collected.py`),
- in `lib/mapPresets.ts`, `lib/mapPresentation.ts` und `lib/urlState.ts`.

Ziel ist eine einzige Ebenen-Registry im Repo, zum Beispiel
`www/vps/map-layers.json`, mit diesen Angaben je Ebene:

- `id`
- `kind`: `vector`, `tiles` oder `points`
- Quell-IDs
- Pflicht-Quellenvermerk
- Lizenz-URL
- abgedeckte Gemeinden (AGS)
- Datenstand-Feld
- `max_age_seconds`

Daraus folgen:

- die Menge `expected` der API, statt fester Werte in `collected.py`;
- ein CI-Test, der prüft, dass jede Ebene in der Registry eine aktivierte Quelle
  in `sources.json` und einen Eintrag im Frontend hat, und umgekehrt;
- eine Meta-Antwort von `map/collected-layers` je Ebene mit Quellenvermerk,
  Datenstand und abgedeckten Gemeinden. Das Frontend zeigt dann
  „Bau-Pläne: nur Lampertheim“ statt nur „ohne aktuelle Quelldaten“.

### 4.2 Kachel-Proxy für weitere Ebenen öffnen

`/api/v1/map-tiles/{layer}` erlaubt fest nur `base` und `rain`. Die Freigabe soll
künftig aus der Registry kommen (`kind: tiles`). Kacheln werden weiterhin nur
geplant über `map_tiles.py` geholt, nie auf Abruf aus dem Browser.

Für Breitband kommt ein Schritt hinzu, der den aktuellen Ebenen-Namen per
`GetCapabilities` über den Titel auflöst (siehe 2.1).

### 4.3 Quellenvermerk und Datenstand in der Karte

Ein gemeinsamer Baustein in der Karte zeigt den Pflicht-Quellenvermerk aus der
Registry, etwa „© BNetzA. Datenstand: 06.2026.“ oder „Kreis Bergstraße, dl-de/by-2-0“.
Er erscheint, sobald eine Ebene aktiv ist. Auf der Seite `/quellen`
(`app/quellen/sourceInfo.ts`) bekommt jede neue Quelle einen Eintrag.

### 4.4 Teilabdeckung als eigener Zustand

`unavailable` kennt heute nur ja oder nein. Neu kommt `partial` mit Liste der
fehlenden Gemeinden hinzu. Das betrifft Bau-Pläne sofort und Wahlbezirke später.

### 4.5 Altlasten aufräumen

- Prüfen, dass keine Reste der `BASELINE_*`- oder `VERIFIED_*`-Listen mehr im
  Code stehen.
- Die alten Typen, etwa `RoadSegment` in `infrastructureData.ts`, durch die neuen
  Verträge ersetzen.

## 5. Umsetzung je Ebene

### 5.1 Glasfaser (`broadband`)

1. **Gitterformat klären:** Die GeoPackage-Datei einmal auf dem VPS laden und
   prüfen: Tabellen, Felder, Bezugssystem (vermutlich das INSPIRE-Gitter in
   EPSG:3035), Zellkennung, Bandbreitenklassen und Haushalte je Zelle.
2. **Kacheln:** Neuer `sources.json`-Eintrag `bnetza-broadband-grid-wms`, Adapter
   `wms`, Ried-BBox wie bei `bkg-topplus`, Zoomstufen 11–15, Intervall
   wöchentlich. Ebenen:
   - „Privathaushalte ≥ 1000 Mbit/s“ als Standard,
   - „Glasfaser (FTTB/H) ≥ 1000 Mbit/s“ als Umschalter.

   Grob gerechnet sind das unter 2.000 Kacheln je Ebene.
3. **Werte per Klick:** Neuer Adapter `bba-grid`. Er lädt die GeoPackage-Datei,
   schneidet sie auf die vier Gemeinden zu und schreibt je Zelle die Werte in eine
   Tabelle mit der Zellkennung als Schlüssel. Ein API-Endpunkt
   `/api/v1/infrastructure/broadband/cell?lat=…&lon=…` rechnet die Zellkennung aus
   den Koordinaten und gibt die Werte zurück. Damit gibt es keine
   Riesen-GeoJSON-Datei mehr: Bei 100 m wären das im Ried über 100.000 Zellen.
4. **Frontend:** Die Ebene `broadband` wird zur Kachelebene mit Legende der
   Bandbreitenklassen und zeigt beim Klick die Zellwerte. Das Breitband-Widget
   behält die Gemeindewerte aus der XLSX.
5. **Tests:**
   - Auflösung des Ebenen-Namens per Titel,
   - Umrechnung von Koordinaten in die Zellkennung,
   - Zuschnitt auf die Gemeinden,
   - Quellenvermerk in der API-Antwort.

**Abnahme:** Die Ebene ist für alle vier Gemeinden sichtbar, ein Klick liefert
Werte mit Datenstand, und der Quellenvermerk wird angezeigt.

### 5.2 Bau-Pläne (`devplans`)

1. **Adapter:** Neuer Adapter `bauleitplan-wfs` nach dem Muster von `boris.py`:
   - seitenweiser Abruf (`COUNT=1000`, `STARTINDEX`),
   - Filter auf die vier AGS,
   - Abbildung der Felder `NAME`, `TYP`, `RECHTSKR`, `SATZBESCHL`,
     `PLANZEICHN`/`PLANTEXT`, `GEMARKUNG` und `AKT_DATENS`,
   - Veröffentlichung unter `map/layers/devplans`.

   Neue Quelle `kreis-bergstrasse-bauleitplanung`, täglich, mit `max_age_seconds`
   von etwa 30 Tagen.
2. **Status je Plan:**
   - „rechtskräftig seit …“, wenn `RECHTSKR` gesetzt ist,
   - sonst „im Verfahren“, wenn ein Aufstellungs- oder Offenlagedatum gesetzt ist,
   - sonst „ohne Datumsangabe“.

   Es wird nichts ergänzt, was nicht in den Daten steht.
3. **Frontend:** Polygone, farbig nach Typ (Bebauungsplan, Satzung,
   Flächennutzungsplan). Das Popup zeigt Name, Gemarkung, Rechtskraft und Links zu
   Planzeichnung und Text. Dazu ein Hinweis „Bürstadt, Biblis und Groß-Rohrheim
   sind im Kataster des Kreises nicht enthalten“.
4. **Bauen-&-Wohnen-Seite:** Bei Lampertheim eine Liste der Pläne aus derselben
   Veröffentlichung.
5. **Tests:**
   - Paging mit Abbruch bei 1.533 Objekten,
   - AGS-Filter,
   - Felder mit leeren Strings werden zu `null`,
   - Lizenz und Quellenvermerk in der Veröffentlichung.

**Abnahme:** 139 Lampertheimer Pläne auf der Karte, PDF-Links funktionieren, und
die Teilabdeckung ist sichtbar.

### 5.3 Wahlbezirke (`elections`)

1. **Wahlräume:** Neue Quelle mit der Wahlraum-Liste je Gemeinde und Wahl (Nummer,
   Bezeichnung, Adresse) aus den amtlichen Wahlbekanntmachungen. Sie wird als
   geprüfte Referenzdatei mit Link zur Bekanntmachung geführt, nach dem Muster der
   `verified_*.py`-Quellen. Die Adressen werden über die schon importierten
   OSM-Adressen (`osm_addresses.py`) in Koordinaten umgesetzt.
2. **Ergebnisse verknüpfen:** Bezirksnummern aus `btw25_wbz.zip` mit den Wahlräumen
   verbinden. Zu prüfen ist, ob die Nummern der Bundestagswahl 2025 mit der
   Bekanntmachung zur Bundestagswahl 2025 übereinstimmen; dafür die
   Bekanntmachungen 2025 der vier Gemeinden besorgen.

   Briefwahlbezirke haben keinen Ort für Wähler. Sie werden nicht auf Wahlräume
   verteilt, sondern gesondert ausgewiesen.
3. **Kommunalwahl 2026:** Ergebnisse je Wahlbezirk prüfen (Hessisches Statistisches
   Landesamt oder votemanager.de, der neue Host ist noch zu klären) und als weitere
   Wahl anbinden.
4. **Grenzen:** Bei den Wahlämtern der vier Gemeinden anfragen, ob es die
   Wahlbezirksgrenzen als Geodaten oder ein Straßenverzeichnis je Wahlbezirk gibt.
   Mit einem Straßenverzeichnis ließen sich Flächen aus OSM-Adressen bilden. Sie
   müssten dann als „abgeleitet aus dem Straßenverzeichnis“ gekennzeichnet werden.
5. **Frontend:** Zunächst Punkte am Wahlraum mit Wahlbeteiligung und Ergebnis. Die
   Ebene heißt dann „Wahllokale & Ergebnisse“, bis echte Grenzen vorliegen.
6. **Tests:**
   - Zuordnung von Nummern zu Wahlräumen,
   - Briefwahlbezirke ohne Ort,
   - Wahlräume ohne Koordinaten bleiben ohne Punkt und werden benannt.

**Abnahme:** Die echten Ergebnisse der Bundestagswahl 2025 je Wahlbezirk sind an
den Wahlräumen aller vier Gemeinden sichtbar.

### 5.4 Straßen-KI (`road`)

1. **Zugang klären (extern, Erik):** Anfrage an ZAKB:
   - Welches System nutzt ZAKB, etwa vialytics?
   - Gibt es einen Export (GeoJSON, Shapefile, CSV) oder eine API?
   - Unter welcher Lizenz dürfen die Daten öffentlich gezeigt werden?
   - Wie oft wird neu erfasst?
   - Sind auch Bürstadt, Biblis und Groß-Rohrheim abgedeckt?
2. **Vertrag vorbereiten:** Den Adapter `road-condition` mit festem Datenvertrag
   vorbereiten, ohne Quelle `enabled`:
   - Abschnitts-ID,
   - Liniengeometrie,
   - Note mit Skala des Anbieters (nicht umrechnen),
   - Schadensklassen, falls vorhanden,
   - Erfassungsdatum,
   - erfassende Stelle.
3. **Frontend:** Die bestehende Ebene `road` mit Linien nach Note und Datum der
   letzten Erfassung. Die Kennzeichnung „KI-Bewertung durch ZAKB“ steht nur, wenn
   die Daten das belegen.
4. **Alternativ oder ergänzend:** Bei Hessen Mobil nach ZEB-Daten für B 44, B 47
   und die Landesstraßen fragen.

**Abnahme:** Die Quelle ist aktiv und liefert echte Abschnitte mit
Erfassungsdatum. Bis dahin bleibt die Ebene ausgeblendet, statt leer angezeigt zu
werden.

## 6. Reihenfolge und Aufwand

| Phase | Inhalt | Abhängigkeit | Aufwand (grob) |
| --- | --- | --- | --- |
| 0 | Externe Anfragen: Kreis-GIS (Bürstadt, Biblis, Groß-Rohrheim ins Kataster?), Wahlämter (Grenzen, Straßenverzeichnis), ZAKB (Straßendaten), Hessen Mobil (ZEB) | keine, sofort starten | Erik, 1 Tag Schreiben |
| 1 | Übergreifender Umbau (Abschnitt 4): Registry, CI-Test, Meta-Felder, Kachelfreigabe, Quellenvermerk, Zustand `partial` | – | 2–3 Tage |
| 2 | Bau-Pläne Lampertheim (5.2) | Phase 1 | 1–2 Tage |
| 3 | Glasfaser-Kacheln (5.1, Schritte 1, 2 und 4) | Phase 1 | 1–2 Tage |
| 4 | Glasfaser-Werte per Klick (5.1, Schritt 3) | Phase 3, Gitterformat geklärt | 2 Tage |
| 5 | Wahllokale und Ergebnisse 2025 (5.3, Schritte 1, 2 und 5) | Phase 1, Bekanntmachungen 2025 | 2 Tage |
| 6 | Kommunalwahl 2026 und Wahlbezirksgrenzen (5.3, Schritte 3 und 4) | Antwort der Wahlämter | offen |
| 7 | Straßen-KI (5.4) | Antwort von ZAKB | offen |
| 8 | Weitere Gemeinden für Bau-Pläne | Antwort des Kreis-GIS | 0,5 Tage nach Datenlage |

Jede Phase wird nach `AGENTS.md` abgeschlossen: Tests, Commit, Push, CI und
GHCR, danach kontrolliertes Ausrollen auf dem VPS.

## 7. Risiken

- **Breitbandatlas:** Ebenen-Namen und Struktur können sich bei jeder
  Veröffentlichung ändern. Deshalb die Auflösung per Titel und einen Test gegen die
  echte `GetCapabilities`-Antwort.
- **Größe der GeoPackage-Datei:** 311 MB für ganz Deutschland. Sie wird nur
  streamend verarbeitet und zugeschnitten; die Originaldatei bleibt nicht dauerhaft
  gespeichert (wie bei der Aufbewahrung der übrigen Rohdaten).
- **Kreis-Kataster:** Der Datenstand (`AKT_DATENS`) ist überwiegend 2021. Er wird
  angezeigt, damit niemand den Stand für aktuell hält.
- **Wahlräume** sind nicht dasselbe wie Wahlbezirke. Die Beschriftung muss das
  deutlich machen.
- **Datenbanklast:** Neue Abfragen auf Messwerte nur über `latest_value_join`
  (siehe Commit `7673860`), damit der Shared-Memory-Fehler nicht zurückkommt.
