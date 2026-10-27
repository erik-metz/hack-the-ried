# Implementierungsplan: Externe Datenquellen & VPS-Kollektoren (Phase 1)
## Streng nach dem Three-Table Core Schema (`entities`, `measurement_definitions`, `readings`)

Dieser Plan beschreibt die Anbindung, Normalisierung und Speicherung externer Datenquellen auf dem **Contabo VPS** (`/www/vps`) von **HackTheRied**.

> **Architektur-Vorgabe:**  
> Alle Messdaten und skalaren Beobachtungen werden **ausschließlich** in die drei bestehenden Kern-Tabellen von TimescaleDB geschrieben:
> 1. `entities` (Stationen, Messpunkte, Straßenabschnitte, Feldblöcke, Raster-Zellen)
> 2. `measurement_definitions` (Metrik, Einheit, Quelle, Basis, Dimensionen, Semantik)
> 3. `readings` (Hypertable: Zeitstempel, numerischer Wert, Qualität, Provenienz)
> 
> **Es werden keine separaten Tabellen für einzelne Datenquellen angelegt.** Geometrien, Adressen und statische Eigenschaften verbleiben in `entities.metadata` (JSONB) bzw. bestehenden Helfern.
> *(Satellitendaten folgen in Phase 2. Tierstimmen/Bioakustik ist zurückgestellt. Pitch-Deck-Anpassungen entfallen).*

---

## 1. Übersicht des Core-Mappings

| Datenquelle | `entities.entity_type` | `measurement_definitions.metric` (Beispiele) | Basis & Semantik | `readings.value` & Einheit |
| :--- | :--- | :--- | :--- | :--- |
| **DWD RADOLAN** | `radar_grid_cell` oder `weather_station` | `precipitation` | `basis='observed'`, `semantics='period_total'` | mm / $l/m^2$ |
| **DWD MOSMIX** | `weather_station` (z.B. Mannheim, Worms) | `temperature`, `dew_point`, `wind_speed`, `precipitation_probability` | `basis='model'`, `semantics='instantaneous'` (oder `period_total`) | °C, m/s, %, mm |
| **HLNUG Grundwasser** | `groundwater_station` | `water_level`, `water_depth` | `basis='observed'`, `semantics='instantaneous'` | m (über NN), m (unter Flur) |
| **Verkehrsfluss (TomTom / Zählstellen)** | `road_segment` (z.B. B44, A67) | `speed`, `free_flow_speed`, `delay`, `congestion_ratio` | `basis='observed'`, `semantics='instantaneous'` | km/h, Sekunden, Verhältnis [0..1] |
| **Blitzortung.org** | `monitoring_area` (z.B. Ried 25km) | `lightning_strikes_count`, `peak_current_max` | `basis='observed'`, `semantics='period_total'` | Anzahl, kA |
| **INVEKOS Feldblöcke** | `agricultural_field` | `area`, `latitude`, `longitude` | `basis='reported'`, `semantics='reference'` | ha, deg |
| **OSM Features** | `infrastructure_facility` | `capacity`, `latitude`, `longitude` | `basis='reported'`, `semantics='reference'` | Anzahl, deg |
| **Rast-Monitor (LKW-Rastplätze)** | `truck_parking` | `parking_capacity`, `parking_free`, `parking_occupied`, `parking_occupancy_pct`, `latitude`, `longitude` | `basis='observed'/'reported'`, `semantics='instantaneous'/'reference'` | Anzahl, %, deg |
| **UBA Luftdaten (Umweltbundesamt)** | `air_quality_station` | `PM10`, `PM25`, `NO2`, `O3`, `SO2`, `CO`, `air_quality_index` | `basis='observed'`, `semantics='instantaneous'` | µg/m³, mg/m³, Index |
| **Verkehrsservice Hessen (Hessen Mobil)** | `traffic_incident` | `delay_minutes`, `latitude`, `longitude` | `basis='observed'/'reported'`, `semantics='instantaneous'` | min, deg |

---

## 2. Detaillierte Mapping-Spezifikation für die 3 Tabellen

### A. DWD Open Data (RADOLAN & MOSMIX)

* **Komponente:** Erweiterung des bestehenden `environment-collector`.
* **Bibliothek:** `wetterdienst` (`pip install wetterdienst[radar]`).

#### 1. Entities
* `id`: `dwd-radolan-buerstadt`, `dwd-radolan-lampertheim` (bzw. Gitterzellen-IDs) sowie `dwd-station-10729` (Mannheim), `dwd-station-10738` (Worms).
* `name`: z.B. *"DWD Radar Gitterzelle Bürstadt"*, *"DWD Station Mannheim"*.
* `entity_type`: `weather_station` bzw. `radar_grid_cell`.
* `metadata`: `{"source": "dwd", "resolution": "1km", "coordinates": {"lat": 49.6425, "lon": 8.4552}}`.

#### 2. Measurement Definitions
* `metric`: `precipitation`
  * `unit`: `mm`
  * `source_id`: `dwd_radolan`
  * `basis`: `observed`
  * `dimensions`: `{"product": "RW", "interval": "60m"}`
  * `semantics`: `period_total`
* `metric`: `temperature`
  * `unit`: `celsius`
  * `source_id`: `dwd_mosmix`
  * `basis`: `model`
  * `dimensions`: `{"forecast_horizon_hours": 1}`
  * `semantics`: `instantaneous`

#### 3. Readings
* `measurement_id`: Entsprechende ID der Definition.
* `observed_at`: Zeitpunkt der Beobachtung bzw. Zielzeitpunkt der Modellvorhersage.
* `period_start` / `period_end`: Für RADOLAN-Stundensummen gesetzt (z.B. 10:00 bis 11:00 UTC).
* `value`: Numerischer Messwert.
* `quality`: `valid`.

---

### B. Hessen Open Data & HLNUG (Grundwasserstände)

* **Komponente:** `environment-collector` (oder `registry-sync-worker`).
* **Quelle:** HLNUG Grundwasserportal / WFS Geoportal Hessen.

#### 1. Entities
* `id`: `hlnug-gw-buerstadt-<station_nr>`
* `name`: *"HLNUG Grundwassermessstelle Bürstadt (Station ...)"*
* `entity_type`: `groundwater_station`
* `metadata`: `{"station_no": "...", "operator": "HLNUG", "municipality": "Bürstadt", "aquifer": "Hessisches Ried"}`

#### 2. Measurement Definitions
* **Pegelstand über NN:**
  * `metric`: `water_level`
  * `unit`: `m`
  * `source_id`: `hlnug`
  * `basis`: `observed`
  * `dimensions`: `{"reference": "masl", "datum": "DHHN2016"}`
  * `semantics`: `instantaneous`
* **Abstand unter Geländeoberkante (Flurabstand):**
  * `metric`: `water_depth`
  * `unit`: `m`
  * `source_id`: `hlnug`
  * `basis`: `observed`
  * `dimensions`: `{"reference": "below_surface"}`
  * `semantics`: `instantaneous`
* **Koordinaten (Latitude / Longitude):**
  * Feste Stationskoordinaten als separate Numeric-Readings mit `semantics='reference'`, wie im Core Contract gefordert.

#### 3. Readings
* Täglicher oder stündlicher Eintrag mit `observed_at` = Messzeitpunkt des HLNUG und `value` = Pegelwert.

---

### C. Verkehrsfluss & Stauvolumen (Optimierung `traffic-collector`)

* **Komponente:** `traffic-collector` (Erweiterung um `traffic_flow.py`).
* **Quelle:** TomTom Traffic Flow API oder Hessen Mobil Dauerzählstellen (B44 / B47 / A67).

#### 1. Entities
* `id`: `road-b44-buerstadt-lampertheim-south`, `road-a67-lorch-buerstadt`
* `name`: *"B44 Bürstadt Süd nach Lampertheim"*
* `entity_type`: `road_segment`
* `metadata`: `{"road": "B44", "direction": "south", "start_junction": "Bürstadt Süd", "end_junction": "Lampertheim Nord"}`

#### 2. Measurement Definitions
* `metric`: `speed` (aktuelle Ist-Geschwindigkeit)
  * `unit`: `km/h`, `source_id`: `tomtom_flow`, `basis`: `observed`, `semantics`: `instantaneous`
* `metric`: `free_flow_speed` (Referenz-Geschwindigkeit bei freier Fahrt)
  * `unit`: `km/h`, `source_id`: `tomtom_flow`, `basis`: `reference`, `semantics`: `reference`
* `metric`: `delay` (Verzögerung / Verlustzeit)
  * `unit`: `s`, `source_id`: `tomtom_flow`, `basis`: `observed`, `semantics`: `instantaneous`
* `metric`: `congestion_ratio` (Stau-Faktor: `current_speed / free_flow_speed`)
  * `unit`: `ratio`, `source_id`: `tomtom_flow`, `basis`: `observed`, `dimensions`: `{"range": "0-1"}`

#### 3. Readings
* Alle 3 bis 5 Minuten ein `reading`-Eintrag je Segment für Geschwindigkeit und Verlustzeit.

---

### D. Blitzortung.org (Live-Gewitterdaten)

* **Komponente:** `environment-collector`.

#### 1. Entities
* `id`: `lightning-zone-ried-25km`
* `name`: *"Blitzüberwachungszone Ried (25 km Radius Bürstadt)"*
* `entity_type`: `monitoring_area`
* `metadata`: `{"center_lat": 49.6425, "center_lon": 8.4552, "radius_km": 25}`

#### 2. Measurement Definitions
* `metric`: `lightning_strikes_count`
  * `unit`: `count`
  * `source_id`: `blitzortung`
  * `basis`: `observed`
  * `dimensions`: `{"interval": "5m"}`
  * `semantics`: `period_total`
* `metric`: `peak_current_max`
  * `unit`: `kA`
  * `source_id`: `blitzortung`
  * `basis`: `observed`
  * `semantics`: `instantaneous`

#### 3. Readings
* Intervallweise aggregierte Anzahl der Entladungen und maximale Stromstärke im Beobachtungsfenster (`period_start`, `period_end`).

---

### E. INVEKOS Feldblöcke & OpenStreetMap

* **Komponente:** `registry-sync-worker`.
* **Besonderheit:** Geometrien (Polygone, Linienzüge) gehören laut Core-Vertrag nicht in `readings`, sondern in `entities.metadata`.

#### 1. Entities
* `id`: `invekos-field-<block_id>`
* `name`: *"Feldblock <block_id>"*
* `entity_type`: `agricultural_field`
* `metadata`: 
  ```json
  {
    "block_id": "DEHE...",
    "main_crop_code": "010",
    "main_crop_name": "Winterweizen",
    "area_ha": 4.85,
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[8.45, 49.64], ...]]
    }
  }
  ```

#### 2. Measurement Definitions & Readings
* Skalare Referenzwerte wie `area` (`unit: ha`, `semantics: reference`) werden als reguläre Messdefinition hinterlegt, sodass sie über die Standard-Measurement-APIs abgefragt werden können.

---

## 3. Implementierungsschritte im Backend

1. **Keine Tabellen-Migration nötig:** Da das Three-Table Schema (`entities`, `measurement_definitions`, `readings`) bereits existiert, werden keine neuen Tabellen via SQL angelegt.
2. **Kollektor-Anpassung:**
   * Jeder Collector (`environment-collector`, `traffic-collector`, `registry-sync-worker`) nutzt die bestehenden Helfer für Ingestion in `entities`, `measurement_definitions` und `readings`.
   * Registrierung der `source_id` in den Sammlungsversuchen (`collection_attempts`), damit das Backend den Live-Status kennt.
3. **Erster Schritt zur Umsetzung:**
   * DWD RADOLAN- und MOSMIX-Normalisierung im `environment-collector` implementieren und direkt in die drei Kern-Tabellen schreiben.

---

## 4. Frontend: Integration in die Datenquellen-Seite (`/quellen`)

Sobald neue Quellen im VPS angebunden sind, müssen diese transparent und nachvollziehbar für die Bürgerinnen und Bürger auf der Datenquellen-Seite (`www/hack-the-ried/app/quellen/`) aufgeführt werden:

1. **Backend-Status-Endpunkt (`/api/v1/collection/status`):**
   * Die neuen Quellen (`dwd-radolan`, `dwd-mosmix`, `hlnug-groundwater`, `traffic-flow`, `blitzortung`, `invekos-agriculture`) melden ihre Status-Snapshots (letzter Abruf, Erfolg, Intervall, Fehler) an den Status-Endpunkt.
2. **Quellen-Metadaten in `QuellenClient.tsx` (`SOURCE_INFO`):**
   * Für jede neue Quelle wird ein Eintrag im Metadaten-Objekt hinterlegt:
     * `title`: z.B. *"DWD RADOLAN Niederschlagsradar"*, *"HLNUG Grundwasserpegel"*
     * `domain`: *"Umwelt & Wetter"*, *"Verkehr"* oder *"Landwirtschaft"*
     * `provider`: *"Deutscher Wetterdienst (DWD)"*, *"HLNUG Hessen"*, etc.
     * `description`: Klare Erklärung, was erfasst wird und warum es für das Ried wichtig ist.
     * `frequencyHint`: z.B. *"stündlich"*, *"alle 5 Minuten"* oder *"täglich"*
3. **Logos & Badges in `SourceLogos.tsx`:**
   * Ergänzung der offiziellen Logos/Icons (DWD-Logo, Hessen-Löwe/HLNUG, TomTom/Open Data) für die Kacheln auf der `/quellen`-Seite.

---

## 5. Umsetzungs-Status

- [x] **Schritt 1: DWD Open Data (RADOLAN RW 1km & MOSMIX 10729)**: Vollständig implementiert in `environment-collector`, Three-Table Ingestion via `write_measurement`, Frontend `/quellen` aktualisiert, CI/CD & GHCR erfolgreich (`924737b`).
- [x] **Schritt 2: Hessen Open Data & HLNUG Grundwasser**: 120 Brunnen/Pegelmessstellen im Ried über ArcGIS REST angebunden (`registry-sync-worker`), Drei-Tabellen-Architektur, Frontend `/quellen` aktualisiert, CI/CD & GHCR erfolgreich (`c041a79`).
- [x] **Schritt 3: Verkehrsfluss & Stauvolumen**: Ried-Korridore (B44, B47, A67) mit Geschwindigkeits-, Verlustzeit- und Staufaktormodellierung (`traffic-collector/traffic_flow.py`), Three-Table Ingestion via `write_measurement`, Frontend `/quellen` aktualisiert, CI/CD & GHCR erfolgreich (`9bb6009`).
- [x] **Schritt 4: Blitzortung.org (Live-Gewitterdaten)**: Live-Blitzentladungen im 25 km Radius um Bürstadt (`environment-collector`), Three-Table Ingestion via `write_measurement` (`lightning_strikes_count`, `lightning_distance_min`, `lightning_peak_current`), Frontend `/quellen` aktualisiert, CI/CD & GHCR erfolgreich (`f1fc7c9`).
- [x] **Schritt 5: INVEKOS Feldblöcke & OpenStreetMap Optimierungen**: Hessen INVEKOS INSPIRE-Parzellenkataster WFS (`lawi:Landwirtschaftliche Parzellen 2025`) für Bürstadt, Lampertheim, Biblis und Groß-Rohrheim (`registry-sync-worker/invekos.py`), Three-Table Ingestion via `write_measurement` (`area`, `latitude`, `longitude`), OpenStreetMap Layer-Optimierungen (`osm_addresses.py`), Frontend `/quellen` aktualisiert.
- [x] **Schritt 6: Rast-Monitor (LKW-Rastplätze an Ried-Autobahnen)**: Neuer Kollektor `rast-collector` für https://rast-monitor.de (DATEX-II via Mobilithek). BBOX-Filterung auf Ried-Autobahnen (A67, A5, A6, A659, A61). Drei-Tabellen-Architektur (`entities`, `measurement_definitions`, `readings`) via `write_measurement` (`parking_capacity`, `parking_free`, `parking_occupied`, `parking_occupancy_pct`, `latitude`, `longitude`). Kompatibilität mit `sensor_metadata`/`sensor_latest` für Frontend-Kartenanzeige und `/quellen` Integration.
- [x] **Schritt 7: openSenseMap & senseBox (Bürger-Sensornetzwerk)**: Neuer Kollektor `opensensemap-collector` für https://opensensemap.org und https://sensebox.de. BBOX-Filterung auf das Hessische Ried (`[8.25, 49.40, 8.80, 50.00]`). Drei-Tabellen-Architektur (`entities`, `measurement_definitions`, `readings`) via `write_measurement` für Temperatur, relative Feuchte, Luftdruck (Pa zu hPa Konvertierung), Feinstaub (PM10, PM2.5, PM1, PM4), Beleuchtungsstärke, UV und Lautstärke. Volle Map- und Dashboard-Kompatibilität (`sensor_metadata`, `sensor_latest`) sowie `/quellen`-Integration mit `OpenSenseMapLogo`.

---

## 6. Phase 2: Satellitendaten & Historische Erdbeobachtungs-Datenbank (Sentinel-2 / Copernicus)

### 6.1 Storage-Architektur & Kostenanalyse: Contabo VPS vs. UploadThing

| Kriterium | UploadThing | Contabo VPS (MinIO / Lokaler NVMe/Block Storage) | Empfehlung |
| :--- | :--- | :--- | :--- |
| **Kostenmodell** | Teuer bei hohem Speicherbedarf (mehrere GB/TB); laufende Bandbreitengebühren | Extrem günstig: Contabo Block Storage (z. B. 250–500 GB für wenige €/Monat) ohne Datentransferkosten zum VPS | **Contabo VPS** |
| **GeoTIFF / COG-Unterstützung** | Nur normale Dateiablage; keine HTTP Range Requests für Sub-Kacheln | Native Unterstützung von **Cloud-Optimized GeoTIFF (COG)** via Byte-Range-Requests; Web-Clients laden nur sichtbare Zoomstufen | **Contabo VPS** |
| **ML-Pipeline-Readiness** | Daten müssen für jedes Training über das Internet gestreamt werden | Direkter schneller NVMe/POSIX-Dateizugriff oder lokaler S3-Endpunkt für PyTorch, Rasterio, GDAL und Scikit-Learn | **Contabo VPS** |
| **Datensouveränität** | Abhängigkeit von Drittanbieter-Cloud | Vollständige Datenhoheit auf dem eigenen Contabo VPS in Deutschland/EU | **Contabo VPS** |

> **Architektur-Entscheidung Storage:**  
> Für die historische Satellitendatenbank wird ein lokales Verzeichnis (`/data/satellite/` auf Contabo NVMe/Block Storage) mit S3-kompatibler MinIO-Schnittstelle eingesetzt.  
> Satellitenszenen werden direkt nach dem Download auf das Hessische Ried zugeschnitten (BBOX-Clip) und als **Cloud-Optimized GeoTIFF (COG)** abgelegt. Dies reduziert die Dateigröße von ca. 500 MB pro Sentinel-Kachel auf **nur ca. 15–25 MB pro Szene**, sodass ein ganzes Jahr an wolkenfreien Szenen weniger als 2 GB Speicher belegt.

---

### 6.2 Datenquelle & Sentinel-2 Pipeline

* **Datenquelle:** Copernicus Data Space Ecosystem (CDSE) / OpenSearch / STAC API (`catalogue.dataspace.copernicus.eu`).
* **Satellit:** Sentinel-2 MSI (Multi-Spectral Instrument), Level-2A (Bottom-Of-Atmosphere Bodenreflektanz, wolkenkorrigiert).
* **Überflugfrequenz:** Ca. alle 5 Tage über dem Hessischen Ried.
* **Filterkriterien:**
  * Bounding Box: Hessisches Ried (`49.54, 8.33, 49.75, 8.58`)
  * Bewölkung: Cloud Cover < 20% über dem Zielgebiet
* **Berechnete Raster-Produkte pro Szene:**
  1. **True Color RGB (B04, B03, B02):** Visuelle Echtfarbendarstellung (10 m Auflösung).
  2. **NDVI (Normalized Difference Vegetation Index):**
     $$\text{NDVI} = \frac{\text{B08 (NIR)} - \text{B04 (Red)}}{\text{B08 (NIR)} + \text{B04 (Red)}}$$
     Vitalitäts- und Dürremonitoring für Agrarflächen und den Riedwald.
  3. **NDMI (Normalized Difference Moisture Index / Bodenfeuchte-Proxy):**
     $$\text{NDMI} = \frac{\text{B08 (NIR)} - \text{B11 (SWIR)}}{\text{B08 (NIR)} + \text{B11 (SWIR)}}$$
     Trockenstress-Erkennung auf landwirtschaftlichen Parzellen.

---

### 6.3 Mapping in das Three-Table Core Schema (Keine neuen SQL-Tabellen!)

#### 1. Entities
* `id`: `satellite-scene-sentinel2-<YYYYMMDD>`
* `name`: *"Sentinel-2 Szene Hessisches Ried <YYYY-MM-DD>"*
* `entity_type`: `satellite_scene`
* `metadata`:
  ```json
  {
    "satellite": "Sentinel-2A",
    "orbit": 108,
    "cloud_cover_percent": 4.2,
    "sensing_time": "2026-06-15T10:35:20Z",
    "bbox": [49.54, 8.33, 49.75, 8.58],
    "storage": {
      "rgb_cog": "satellite/2026/06/sentinel2_ried_20260615_rgb.tif",
      "ndvi_cog": "satellite/2026/06/sentinel2_ried_20260615_ndvi.tif",
      "preview_url": "/api/v1/satellite/scenes/20260615/preview.webp"
    }
  }
  ```

#### 2. Measurement Definitions & Readings (via `write_measurement`)
* **Mittlerer Vegetationsindex Ried:**
  * `metric`: `ndvi_mean`
  * `unit`: `index` ([-1.0 .. 1.0])
  * `source_id`: `copernicus-sentinel2`
  * `basis`: `observed`
  * `semantics`: `instantaneous`
* **Dürre- und Trockenstress-Fläche:**
  * `metric`: `drought_stressed_area`
  * `unit`: `ha`
  * `source_id`: `copernicus-sentinel2`
  * `basis`: `model` (Schwellenwert $\text{NDVI} < 0.25$ auf Ackerflächen)
  * `semantics`: `instantaneous`
* **Bewölkungsgrad:**
  * `metric`: `cloud_cover`
  * `unit`: `%`
  * `source_id`: `copernicus-sentinel2`
  * `basis`: `observed`
  * `semantics`: `instantaneous`

---

### 6.4 Frontend-Integration (Sensorkarte & Regionalatlas)

1. **Sensorkarte (`/karte`):**
   * Zuschaltbarer Ebenen-Layer *"Sentinel-2 Satellit"* mit Unteroptionen:
     * *Echtfarben (RGB)* – aktuelle Ansicht aus dem All
     * *Vegetationsgesundheit (NDVI)* – farbcodierte Heatmap (Rot = trocken/brach, Grün = vitale Vegetation)
   * Kachelung über performanten FastAPI-Tile-Handler (`/api/v1/satellite/tiles/{date}/{z}/{x}/{y}.png`), der direkt aus den COGs liest.
2. **Regionalatlas (`/regionalatlas`):**
   * **Zeitreise-Schieberegler:** Historische Gegenüberstellung von Satellitenszenen (z. B. Frühjahr vs. Hochsommer-Dürre).
   * **Trend-Charts:** Zeitlicher Verlauf des mittleren Ried-NDVI korreliert mit den HLNUG-Grundwasserständen und DWD-Niederschlägen.
3. **Datenquellen-Seite (`/quellen`):**
   * Transparente Auflistung von *Copernicus Sentinel-2* mit Lizenznachweis (Copernicus Open Access / EU-Verordnung) und Status-Chip.

---

---

## 8. TTN Mapper & Packet Broker LoRaWAN-Ausbau (Phase 1 Erweiterung)

* **Komponente:** `ttnmapper-collector` (`/www/vps/ttnmapper-collector`).
* **Quellen:** 
  - Packet Broker Mapper API (`https://mapper.packetbroker.net/api/v2/gateways`)
  - TTN Mapper Kacheln (`https://tms.ttnmapper.org/circles/...`)
* **Ziel:** Historisches und kontinuierliches Tracking des LoRaWAN-Gateway-Ausbaus und der Netzabdeckung im Hessischen Ried im Three-Table Core Schema.

### 1. Entities
* **Einzelne Gateways:**
  - `id`: `lora:gateway:<eui_or_id>` (z.B. `lora:gateway:eui-58a0cbfffe801234`)
  - `name`: z.B. *"LoRaWAN Gateway Bensheim"*
  - `entity_type`: `lora_gateway`
  - `metadata`: `{"net_id": "000013", "tenant_id": "ttn", "cluster_id": "eu1.cloud.thethings.network", "antenna_placement": "OUTDOOR", "updated_at": "..."}`
* **Regionaler Ried-Ausbau-Bereich:**
  - `id`: `lora:area:hessisches_ried`
  - `name`: *"LoRaWAN-Ausbau Hessisches Ried"*
  - `entity_type`: `lora_coverage_area`
  - `metadata`: `{"region": "Hessisches Ried", "center_lat": 49.64, "center_lon": 8.53, "radius_meters": 25000, "source": "ttnmapper"}`

### 2. Measurement Definitions & Readings (via `write_measurement`)
* **Gateway-Metriken:**
  - `latitude`: `degrees`, `reported`, `reference`
  - `longitude`: `degrees`, `reported`, `reference`
  - `altitude`: `m`, `reported`, `reference`
  - `online_status`: `state`, `observed`, `state` (1.0 = online, 0.0 = offline)
* **Regionale Aggregat-Metriken (Ausbau-Historie):**
  - `active_gateways_count`: `count`, `observed`, `instantaneous`
  - `total_gateways_count`: `count`, `observed`, `instantaneous`
  - `outdoor_gateways_count`: `count`, `observed`, `instantaneous`
  - `indoor_gateways_count`: `count`, `observed`, `instantaneous`
  - `online_ratio`: `percent`, `observed`, `instantaneous`

### 3. Frontend & Map Kompatibilität
* **Ebene Sensorkarte:** `lora` TMS Tile Layer (`https://tms.ttnmapper.org/circles/...`) mit Live-Gateways.
* **Kompatibilität:** Dual-Write in `sensor_metadata`, `sensor_data` und `sensor_latest` (`ttn-gw-<id>`), sodass bestehende Map- und API-Clients die Gateways sofort darstellen.




