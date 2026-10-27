# Third-party data flow audit

Date: 2026-09-17. Scope: checked-in frontend, Next.js routes, VPS collectors,
API endpoints, schema seeds, and Docker Compose configuration.

**Result: the application does not currently satisfy “all third-party data is
collected by the VPS, persisted in the database, and the frontend displays only
database data.”** There are direct external map requests, local frontend
datasets and simulations, backend simulations, and registry jobs that do not
actually fetch their advertised sources.

This is a source-code investigation, not confirmation of the deployed VPS or
database contents. No production requests, deployments, or data changes were
performed. Existing unrelated working-tree changes were left untouched.

## Data-source inventory

| Data | VPS collection / persistence | Frontend path and verdict |
| --- | --- | --- |
| Raspberry Shake | `shake-collector/source.py` and `storage.py`: external station/waveform inputs; metrics written to `sensor_data`, directly or through ingestion API | Map/telemetry backend requests exist. Core database path implemented. |
| SmartCity dashboards | `smartcity-collector/source.py` and `storage.py`: dashboard fetches, metadata, observations, revisions, `sensor_data` | Database-backed map readings. Core path implemented. |
| nextbike | `nextbike-collector/source.py` and `storage.py`: feed fetches, station observations, bike inventory, inferred trips and `sensor_data` | Database-backed bike/map endpoints. Core path implemented. |
| Autobahn traffic | `traffic-collector/main.py`, `source.py`, `storage.py`: fetched incidents and corridor snapshots persisted | Next.js traffic route and map retain local traffic fallback. An empty successful database response also leaves simulated incidents in place. |
| Municipal street closures | Persistence helper exists in `traffic-collector/street_closures.py`, but the active collector entry point only invokes `persist_traffic_incidents` | Next.js route and map fall back to `VERIFIED_RIED_STREET_CLOSURES`. No municipal-source fetch wired into the active collector found. |
| Pegelonline / Open-Meteo | `environment-collector`: external requests and latest-state writes | Some widgets use backend fetches with defaults; map gauge overlay directly uses `DEFAULT_FLOOD_GAUGES`. Humidity is dropped; weather history is not inserted into `sensor_data`. |
| Bürstadt Cross-7 events | `registry-sync-worker/jobs/social_sync.py`: HTTP fetch and `cultural_events` upsert | Social page fetches database endpoint but falls back to bundled events. Collector only requests page 1, size 50. |
| Rail / level crossings | VPS mobility endpoint returns constants, sample positions and time-based crossing states; record endpoint does not persist | Map directly runs local rail simulation; Next.js mobility route also computes locally. No real rail collection path found. |
| VRN buses / departures | Database endpoints/tables exist; no corresponding live-source collector found in Compose or collector code | Map directly simulates buses and departures. Next.js bus route merges database values into simulated buses; departure route is entirely local. |
| ZAKB trucks | Database endpoints/tables exist; no corresponding fleet-source collector found | Map directly simulates trucks. Next.js route merges database values into simulated trucks. |
| Infrastructure: broadband, Wi-Fi, roads, EV charging, energy | Schema seed data; registry job updates timestamps and generates energy/charger status, without source HTTP calls | API fallbacks and map constants remain. Backend energy endpoint also calculates production estimates at request time. |
| Nature, agriculture, groundwater | Seed data; registry job updates measurement timestamps and copies prior-year agriculture values, without source HTTP calls | Local defaults remain in map and fetch helpers. |
| Demographics / commuters / education | Seed data; registry job projects population from last year rather than fetching HSL/BA | Fetch helpers and Next.js routes fall back to local baselines; map adds local education entries. |
| Real estate / BORIS / housing / plans | Seed data; registry job updates source/plan timestamps without fetching sources | Local baselines in fetch helpers and direct map overlays. |
| Economy / taxes / companies | Seed data; registry job copies previous-year tax rates without source fetches | Local baselines in fetch helpers; map company catalog starts and remains local. |
| Finance / elections | Seed data; registry job projects budgets, no budget or election source fetch | Fetch helpers fall back to local budgets, spending and elections; map uses bundled district geometry. |
| Social indicators / waste statistics / facilities | Seed data; social job copies previous-year waste data; Cross-7 is its only external request | Fetch helpers fall back to bundled social, waste and facility data. |
| OpenStreetMap basemap / BKG heavy-rain layer | No VPS ingestion/storage path used by these layers | Leaflet requests external tiles/WMS directly from the browser. |
| OSRM route geometry | `hack-the-ried/scripts/generate-road-routes.mjs` fetches OSRM and generates local route assets | Geometry is bundled with frontend rather than read from DB. This is a tooling-time external fetch, not a browser runtime request. |

## Priority findings and evidence

1. **Frontend data remains independent of the database.**
   `hack-the-ried/app/components/MapComponent.tsx:755`, `:874`, and `:1111`
   invoke rail, truck, and bus simulations directly. Changing Next.js routes
   alone will not fix these layers. The same component initializes local
   infrastructure/company data at lines 134–147 and draws local environment,
   BORIS, development-plan and election overlays starting at line 1827.
   `hack-the-ried/lib/mapBackend.ts:18` also merges default crossings,
   education and facilities into otherwise database-backed map data.

2. **Failure and empty-result behavior invents or substitutes data.**
   `hack-the-ried/app/api/traffic/route.ts:63` only replaces local incidents
   when the DB array is nonempty. Therefore zero real incidents can display
   simulated congestion. Bus and truck routes merge onto local fleets and can
   label the result `database_timescaledb` even while unmatched simulated
   vehicles remain. `demographicsData.ts:666`, `realestateData.ts:886`,
   `financeData.ts:389`, `electionsData.ts:336`, `economyData.ts:400`, and
   `regionalStats.ts:748` contain backend fetches with local baseline fallbacks.
   The infrastructure routes and `mapBackend.ts` have similar behavior.

3. **Most registry jobs are not source synchronization.**
   In `registry-sync-worker/jobs/`, only `social_sync.py` makes an external
   request. `infrastructure_sync.py` generates energy yield and charger
   availability; `demographics_sync.py` applies a population multiplier;
   `finance_sync.py` applies budget multipliers; `economy_sync.py`,
   `environment_sync.py`, and `social_sync.py` carry forward previous-year
   values. `realestate_sync.py` advances `last_synced_at` without fetching
   anything, and `environment_sync.py` advances groundwater `measured_at`
   without new observations. These values can be in the DB without being
   collected facts. `api/v1/schema.sql` also seeds most registry domains.

4. **VPS API location does not guarantee DB-backed data.**
   `api/v1/endpoints/mobility.py` returns simulated crossing statuses, constant
   stations, and sample train positions. Its `/record` endpoint returns counts
   and success without writing data. `api/v1/endpoints/infrastructure.py:207`
   reads facility metadata, then calculates current energy output from time
   and capacity instead of reading stored production observations.

5. **External map resources bypass the VPS.**
   `hack-the-ried/app/components/MapComponent.tsx:252` loads OSM tiles and
   line 353 loads BKG WMS directly. Storing a service URL in the database would
   not make the downloaded imagery database-backed. Ordinary attribution and
   source hyperlinks were not counted as automatic external data fetches.

6. **Real ingestion has completeness gaps.**
   `environment-collector/normalize.py` parses humidity, but `storage.py`
   stores only temperature and precipitation in `sensor_latest`, and only the
   latest river level in `flood_gauges`. Despite its comment, it never inserts
   weather into `sensor_data`. Measurement timestamps are assigned at
   collection time rather than taken from source observations.
   `registry-sync-worker/jobs/social_sync.py:19` fixes Cross-7 pagination at
   page 1 / 50 entries. Non-200 responses and caught HTTP failures can still
   result in a successful job audit record, so health/sync success alone does
   not establish successful source ingestion.

## Recommended implementation order

1. Stop generating observations in registry jobs and stop refreshing source or
   measurement timestamps without a successful import. Preserve provenance for
   existing rows; investigate generated/seeded records before any cleanup.
2. Make frontend routes, server fetch helpers, and map layers consume database
   responses exclusively. Treat successful empty arrays as authoritative.
   Show unavailable/stale states on failures, retaining only genuinely
   database-derived last-known data with its original timestamp.
3. Implement missing VPS importers from actual accessible source feeds or
   explicit source-file imports. Leave unavailable domains empty until real
   data is ingested. Existing source-name strings are not source integrations.
4. Replace mobility API stubs and connect mobility map layers to stored
   observations. If estimates are required, explicitly model and store their
   provenance and basis rather than presenting them as collected positions.
5. Complete weather persistence and event pagination/error reporting.
6. For the strict all-resources requirement, ingest and serve map resources
   through the VPS/storage architecture too; route geometry must likewise
   move out of frontend-generated assets. A pass-through proxy alone does not
   satisfy database persistence.
7. Add behavioral checks: empty DB stays empty; backend failure produces an
   unavailable state; no local simulation appears in production; frontend
   network requests use only approved first-party endpoints; fetched metrics
   survive DB round trips; ingestion failure never advances observation or
   source-success timestamps.

## Verification boundary

Findings were established by tracing active call sites, imports, source clients,
SQL writes, route handlers, and service configuration. No runtime tests were
run for this documentation-only investigation. Deployment verification still
requires checking running collector images, logs, last successful source
fetches, database provenance/freshness, and a browser network capture.
