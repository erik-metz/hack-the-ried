# Grundradar and regional reference data

`reference-collector` runs `reference_service.py` from the registry worker image.
It uses a separate, single-slot scheduler so slow downloads cannot occupy the
registry worker's acquisition slots or run a second movement predictor. The
normal registry daemon excludes the `reference` group. One-shot runs remain
available: `python main.py --job reference` or `--job reference-tax`.

## Implemented publications

- Grundradar's public JSON catalogue (weekly), municipal Grundsteuer B rates
  (weekly), and county land-value medians/zone counts (monthly).
- Monthly regional ArcGIS snapshots: flood scenarios, protected areas,
  monitoring-station inventory, Zensus population/age/rent/ownership/vacancy,
  land cover, HLNUG drinking-water protection, BGR geology and soil.
- KOSTRA-DWD 2020 Hn, 60 minutes/100 years, native 5-km EPSG:3035 cells
  (quarterly). The period is 1951–2020; this is not an inundation model.
- UBA/MoRE-DE mean groundwater distance (quarterly). The original file documents
  **decimetres**, converted to metres. Native raster values are area-averaged
  into explicitly labelled 1-km EPSG:25833 display cells. The timestamp is the
  export date from its README, not a groundwater observation time. It is not a
  measured current or maximum water level. The export is approximately 295 MB,
  downloaded to a bounded temporary file and removed after normalization.
- BfS geogenic radon potential (quarterly), stable WFS `gid` keys and explicit
  1992–2020 reference period; dimensionless, not an indoor concentration.
- DWD UHI-MAP v7 additional tropical nights with CLC2018 (monthly). Discovery
  selects the latest completed annual release from the official directory;
  the initial available release was 2024, newer than Grundradar's 2023 map.

Map coverage preserves the pre-existing context region
`[8.35,49.55,8.58,49.76]` (west/south/east/north). County aggregates include
Bergstraße, Groß-Gerau and Darmstadt-Dieburg; their whole-county values are
never presented as values exclusively for the Ried. Municipal rates cover
Biblis, Bürstadt, Groß-Rohrheim and Lampertheim by AGS. Border-intersecting
polygons and grid cells can extend outside the selection.

## Canonical storage and expiry

Source/feature metadata and geometry live in `entities`, metric identities in
`measurement_definitions`, and numeric observations in `readings`, using the
existing `write_measurement` function. No new physical domain table or schema
migration is required. Existing `measurement_heads`/`latest_readings` remain
key-based projections. Acquisition fingerprints and attempts use the existing
operational tables; raw bodies are not retained as another history store.

`reference-source:<layer>` contains the complete current member key set and
its successful check time. All feature updates, values and this publication
pointer commit together. Readers use repeatable-read transactions. Failed or
partial acquisition does not replace the previous publication. Missing values
remain null. Source reference dates, periods and successful verification times
are separate. Readings retain their source year; unchanged retrievals do not
produce a new timestamped sample. An import-contract fingerprint forces
renormalization after adapter/configuration changes.

HTTP validators are used for scalar/raster exports. ArcGIS snapshots validate
provider schema, stable object IDs, pagination and bounded response sizes.
Flood scenario IDs are explicitly mapped (provider 1/2/3 means high/medium/low,
UI 2/1/0), and protected-area OID fields are discovered from provider metadata.
Null geometries remain explicit `source_missing` records, never invented shapes.

The API reports overdue checks separately from old source reference years.
After three source intervals without a successful check, the layer returns 503;
no provider request or synthetic empty response is made by the API/frontend.
The new endpoints are `/api/v1/reference` and `/api/v1/reference/<layer>`.
The frontend page is `/umwelt/referenzdaten`. Existing context layers and
protected-area/monitoring layers now use the VPS publications, not request-time
ArcGIS acquisition. Weather warnings retain their existing short-lived path.

Each import has a 15-minute wall-clock limit, bounded network reads, a 10-second
SQL lock timeout and a 90-second per-statement timeout. A failed source retries
after ten minutes. Unchanged sources resume at their persisted next due date
on container restart. API reads have a 15-second statement deadline. Reference
queries disable parallel workers locally to avoid exhausting the production
container's small shared-memory allocation; this does not change other sessions.

## Overlap and limits

BORIS zones, BNetzA broadband, UBA air measurements, GTFS stops and OSM-derived
inventories retain their existing paths. Grundradar county medians are additional
aggregates, not replacement zone values. HLNUG groundwater stations are not
mean groundwater-depth grid cells. ECOSTRESS surface temperatures are not DWD
additional tropical nights. Housing metrics extend the existing Zensus layer.

The catalogue lists all other Grundradar themes with explicit integration status;
listing a theme is **not** evidence that its regional values have been imported.
EGMS archive discovery/download needs a CLMS API token, per the official
[EGMS manual](https://land.copernicus.eu/en/technical-library/egms-end-user-interface-manual/@@download/file).
No EGMS measurements are claimed without that access. The remaining
catalogue-only themes still require a verified regional data-export contract;
no undocumented Grundradar-internal API is scraped. No Hessian coverage is
assumed from a count such as "13 Länder".

## Deployment and verification

Build/publish the registry-worker image and API image. Preserve the production
Compose overrides and pinned images of unrelated services. Add/start only the
`reference-collector` service and replace only the API image for this release.
Do not restart TimescaleDB or cancel other workers' long transactions to make an
import succeed. Confirm each source via `/api/v1/collection/status` and the new
reference endpoints, rather than treating container health as ingestion proof.
Deploy the frontend after its tests and production build pass.

Integration tests exercise atomic rollback, partial exports, replay, 304,
provider pagination, canonical API values/periods, no-data handling and raster
unit conversion. Run with an isolated `COLLECTOR_TEST_DATABASE_URL`; tests create
and drop their own schemas. No production schema is removed by these tests.
