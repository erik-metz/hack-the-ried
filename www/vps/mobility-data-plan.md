# Mobility data for Bürstadt and Lampertheim

Research date: 2026-09-14. Planning only: no collectors, scheduled jobs, API changes or deployments were created.

## Recommendation

Build a mobility map layer with buses and passenger trains moving according to official schedules. Add realtime timetable corrections where available. Label the resulting positions as estimates, since a departure prediction is not GPS. Add ZAKB collection dates and Umweltmobil stops, followed by parking, roadworks and traffic counts. Delivery vans and live traffic-light phases should remain optional research/partnership items.

Documentation and public pages were inspected. This research does not certify complete local GTFS coverage: the timetable ZIP was not downloaded and the realtime protobuf was not decoded. Local route inventory, feed compatibility, endpoint quotas and redistribution terms are implementation gates. “No public feed found” below does not mean a provider cannot supply one.

## Available sources and practical limits

| Source | Evidence and access | What we can show | Remaining check / priority |
| --- | --- | --- | --- |
| VRN scheduled public transport | VRN confirms GTFS Schedule availability in its [realtime announcement](https://opendata.vrn.de/news/echtzeitfahrplandaten-ab-sofort-ueber-gtfs-realtime-verfuegbar). Its [portal](https://opendata.vrn.de/) also lists stops, platforms and route geometry. | Scheduled bus/train services, stops and estimated movement where the imported feed covers them. | Resolve current ZIP link, license, validity dates, shapes and local rail coverage. First choice for local buses. |
| VRN/RNN realtime | The [dataset](https://opendata.vrn.de/datasets/vrn-und-rnn-gtfs-realtime-echtzeitfahrplandaten) explicitly offers **TripUpdate** for buses/trams and excludes SPNV (regional rail). It links [the binary endpoint](https://www.vrn.de/service/entwickler/gtfs-realtime/). | Delays and timetable corrections; cancellations when supplied. Position remains interpolated. | Decode a sample and measure local operator coverage and static/RT trip-ID matches. The web reader encountered an unsupported octet-stream response, not a decoded feed. No VehiclePositions feed established. High priority. |
| VRN RapidJSON | [Current API page](https://opendata.vrn.de/API) recommends RapidJSON and says TRIAS XML will no longer be supported. The page is internally inconsistent about realtime, while its example enables realtime. | Departure boards and a cross-check against imported timetables. | Prefer GTFS for bulk animation. Verify actual responses, limits and terms before relying on RapidJSON. |
| DELFI nationwide GTFS | [Official DELFI download page](https://www.opendata-oepnv.de/ht/de/organisation/delfi/startseite): nationwide local transport plus long-distance rail, registration required, normally weekly publication. | Rail or bus timetable coverage missing from VRN, potentially passenger trains passing through without a local stop. | Inspect feed completeness and geometry; a larger import. Read download-specific reuse terms. Select one authoritative feed per service to avoid duplication. |
| Deutsche Bahn Timetables | [Official API](https://developers.deutschebahn.com/db-api-marketplace/apis/product/160163/api/160160): station lookup, hourly plans and change endpoints; requires DB-Client-ID and DB-Api-Key. | Station arrivals/departures and changes for local rail, subject to station coverage. | Station information is not GPS or a complete track trajectory. Resolve station IDs, subscription quotas and cross-feed trip matching. Second phase. |
| GTFS.de alternative | [Provider realtime documentation](https://www.gtfs.de/de/realtime/) lists VRN/RNN among providers and offers TripUpdates/ServiceAlerts matched to its own static feeds. | Alternative matched schedule/realtime source. | Third-party aggregation; local rail coverage not established. Its realtime publication is CC BY-SA 4.0; check the chosen static package separately. Never join its IDs directly to unrelated VRN/DELFI IDs. |
| ZAKB ordinary collection | [Owner portal](https://www.zakb.de/eigentuemerportal) offers collection-calendar downloads including a smartphone file; [calendar page](https://www.zakb.de/abfallkalender) requires dynamic content. | Collection date and waste category per selected street/zone. | Exact export format, public endpoint, street/zone mapping and reuse permission still unverified. No routes, collection order, GPS or exact pickup times established. Show day-level activity first. |
| ZAKB Umweltmobil | [Official schedule](https://www.zakb.de/leistungen/umweltmobil) publishes stop addresses and time windows in HTML and downloadable PDFs. | Scheduled presence at a location, with optional explicitly estimated travel between verified successive stops on the same tour. | Easy, useful addition. Do not assume separate timetable entries use the same physical vehicle. |
| Municipal parking and traffic | Existing repository [Smart City investigation](smartcity-collector-plan.md) reports public parking entities and hourly/daily traffic sums. [VRN ArcGIS directory](https://spatial.vrn.de/data/rest/services) lists P+R realtime and bicycle-box occupancy services. | Actual parking availability and aggregate traffic where timestamps/semantics are valid. | Municipal evidence comes from the earlier local investigation, not a repeat endpoint probe this turn. Inventory local coverage and rights; counts do not reveal individual cars. High priority alongside transit. |
| Roadworks and closures | [Hessen Mobil Verkehrsservice](https://mobil.hessen.de/verkehr/verkehrsservice-hessen) publishes current/planned work; [AMS documentation](https://mobil.hessen.de/sites/mobil.hessen.de/files/2025-07/hessen_mobil-broschuere_arbeitsstellenmanagement_ams.pdf) describes forwarding works to Mobilithek. [Lampertheim](https://www.lampertheim.de/de/wirtschaft-verkehr/verkehr/strassen-und-verkehrswegebau.php) also publishes project information. | Affected road segments and dates. | Discover a supported regional machine-readable feed and terms via Mobilithek/provider; website availability alone is not an API guarantee. Do not auto-reroute buses using generic road closures without transit-specific evidence. |
| Traffic volume / cycling | [Hessen Mobil traffic-volume map](https://mobil.hessen.de/verkehr/interaktive-verkehrsmengenkarte) describes historical road counts. Its [cycling brochure](https://mobil.hessen.de/sites/mobil.hessen.de/files/2024-12/241204_hemo_eurobike_ansicht_neu.pdf) identifies raddaten-hessen.de as a public count portal. | Historic road intensity, cycling counts, potentially a calibrated aggregate traffic model. | Query local station coverage and export access. Historical averages are not current flow; retain aggregation windows and distinguish model assumptions. |
| Shared bikes | [VRN interactive-map documentation](https://www.vrn.de/mobilitaet/interaktivekarte/index.html) describes nextbike availability; VRN also exposes station geometry through ArcGIS. | Available bikes/station locations wherever actual local stations exist. | Local Bürstadt/Lampertheim coverage and an approved availability feed need verification. Availability data does not provide riders' routes. |
| Charging infrastructure | Bundesnetzagentur offers [CSV/XLSX downloads](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/DownloadundKontakt.html); its [FAQ](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/FAQ/start.html) states monthly refresh and CC BY 4.0 attribution. | Charging locations and technical attributes. | This register is not live charger occupancy. Low effort optional static layer. |
| DHL / other delivery fleets | [DHL Unified Tracking](https://developer.dhl.com/tracking?language_content_entity=de) requires an eligible shipment tracking code and subscription key. [DHL live tracking](https://www.dhl.de/en/privatkunden/pakete-empfangen/sendungen-verfolgen/live-tracking.html) is recipient/shipment-specific. | Authorized shipment information in a private shipment feature, not an open city fleet map. | No public citywide DHL, other postal fleet routes or delivery timetable found. For the public map use generic fictional vans in an explicit scenario, or obtain fleet cooperation. Do not collect recipient tracking links. |

### Concrete Umweltmobil examples

The official schedule lists Bürstadt, Wertstoffhof, Zur Biogasanlage 1 on **19 September 2026, 09:30–12:30**, and Lampertheim, Wertstoffhof, Klärwerkstraße 6–8 on **31 October 2026, 09:30–13:00**. These support a precise “scheduled here” marker. They do not establish actual attendance or the travel route. Source: [ZAKB Umweltmobil](https://www.zakb.de/leistungen/umweltmobil).

### Ampeldaten

No supported public live red/amber/green feed for Bürstadt or Lampertheim was established. Distinguish four products: signal locations, detector counts, programmed timings, and live signal phases. They are not interchangeable.

The [Hessen open-data LSA/WFS result](https://opendata.hessen.de/dataset/wfs-verkehrsrelevante-baustellen-lichtsignalanlagen-lsa-mit-akustik-und-verkehrsmeldungen) is published by **Frankfurt**, so it is not evidence of local coverage. [Darmstadt's dashboard](https://datenplattform.darmstadt.de/) uses traffic-light-derived counts, not evidence of a public Ried phase stream.

An optional static infrastructure layer can use OpenStreetMap signal/crossing features after a local completeness check, with [OSM licensing and attribution](https://osmfoundation.org/wiki/Licence_and_Legal_FAQ). Ask the relevant city/Hessen Mobil asset owner for signal inventory, detector aggregates and a supported SPaT/MAP feed if available. A programmed cycle alone cannot reliably infer the current signal state. Simulated signals belong only in a clearly marked scenario. Apply the same caution to railway-crossing barrier states.

## Product semantics

Every map object should expose a plain-language status, source and age:

- **Position gemeldet**: genuine timestamped vehicle position, if a future provider supplies one.
- **Position geschätzt – mit Echtzeit-Fahrplan**: interpolated position using fresh timetable predictions.
- **Position geschätzt – nach Fahrplan**: interpolation using scheduled times only.
- **Abholung geplant / planmäßig vor Ort**: date or stop-window event, without invented movement.
- **Simulation / frei erfunden**: synthetic delivery or collection tour with no official route evidence.

Model timing and position separately: `position_basis` (reported/interpolated/scenario/none), `timing_basis` (predicted/scheduled/scenario), and `geometry_basis` (provider/routed/none). A realtime timetable never automatically turns the position into an observation. Expose `source_updated_at`, `fetched_at`, `estimated_for`, `valid_until`, source URL and attribution. Use text/icons as well as colour.

Scheduled traffic can provide context for environmental signals, but a predicted bus passage is not evidence that a particular noise or vibration was caused by that bus. Synthetic movements must stay out of observed traffic counts and the existing sensor-data exports.

## Architecture fitted to this repository

Existing deployment: Python FastAPI under `www/vps/api/v1`, PostgreSQL/TimescaleDB, Docker Compose, and a Next.js/Leaflet map in `www/hack-the-ried/app/components/MapComponent.tsx`. Existing numeric `sensor_data` and fixed-location `sensor_metadata` are unsuitable for complete moving-trip records.

Add an independent `www/vps/mobility-collector/` Python service, following shake-collector's deployment/logging conventions. Use separate ordinary PostgreSQL tables; PostGIS and Redis are optional later optimizations, not MVP requirements.

Proposed tables:

- `mobility_sources`: provider, endpoint, attribution/terms, refresh configuration and health.
- `mobility_feed_versions`: content hash, publication/validity dates, import status and retained file reference.
- `mobility_stops`, `mobility_routes`, `mobility_shapes`, `mobility_trips`, `mobility_stop_times`, `mobility_service_dates`: versioned imported schedule with namespaced IDs.
- `mobility_trip_updates`: latest accepted provider updates, source timestamp and expiration, linked to a specific trip instance.
- `mobility_events`: collection days, Umweltmobil stop windows, closures and other timed geographic events.

Key a trip instance by provider/feed version + trip ID + service date + start time where required. Route number alone is not identity. Keep an explicit crosswalk for DB/DELFI/VRN services and retain unmatched updates for diagnostics; never attach a delay to a guessed vehicle. Atomic imports prevent partially refreshed feeds. Keep older versions while their trips/replay windows are still needed.

Proposed FastAPI endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/mobility/trips?bbox=...&at=...` | Active estimated/reported movements with source semantics and server time. |
| `GET /api/v1/mobility/shapes/{id}?version=...` | Cacheable geometry referenced by trip responses. |
| `GET /api/v1/mobility/departures?stop_id=...` | Scheduled and predicted times shown separately. |
| `GET /api/v1/mobility/events?bbox=...&date=...` | Collection days, stop windows and road events. |
| `GET /api/v1/mobility/sources` | Attribution, coverage and freshness without credentials. |

Validate bounding boxes/time ranges and cap results. Reuse the current frontend/backend access pattern. Add a separate Leaflet overlay with bus/train toggles, event markers, source details and a pause/reduced-motion option. Send timed path segments so clients can animate locally between refreshes; do not make every animation frame a request or database insert.

## Scheduling and movement algorithm

The following cadences are proposed defaults, subject to provider limits:

1. **Daily, around 03:15 Europe/Berlin:** conditionally check timetable and calendar sources using ETag/Last-Modified where supported; otherwise compare content hashes. Reimport only changed files. DELFI's usual weekly publication still allows a cheap daily update check. Run missed checks after restart and avoid concurrent imports.
2. Validate the staged feed, derive the local subset and publish it atomically. Retain full relevant trips and the neighboring stops outside the viewport, so interpolation does not break at city boundaries. Include through-running services whose geometry crosses the area even if they do not stop locally; report that detection is incomplete if geometry is absent.
3. Use the agency timezone, service-date exceptions and stop arrival/departure times. Evaluate preceding service dates for overnight trips. Handle GTFS times beyond 24:00 and DST using the specification's service-day time semantics. Expand exact frequency trips correctly; mark non-exact/headway and on-demand service as uncertain or exclude it from exact vehicle animation. Reference: [GTFS Schedule](https://gtfs.org/documentation/schedule/reference/).
4. Map each stop occurrence to monotonically increasing distance along its trip geometry. Prefer GTFS shapes and distance fields; next use a reviewed provider route variant. If necessary, generate and review separate road/rail routes from OSM. Do not put trains on road routing or connect stops by an apparently precise straight line. Without reliable geometry, show the departure board only.
5. Hold the marker during dwell time. Between departure at stop A and arrival at stop B, interpolate distance along the intervening polyline. Clamp progress and reject invalid/zero-duration segments. This is deliberately an estimate, not a speed or acceleration model.
6. **Every 30–60 seconds initially:** fetch permitted realtime updates centrally. Apply stop-specific predictions, cancellations and skipped stops according to feed semantics. Proposed initial freshness threshold: 120 seconds, adjusted after measuring provider cadence. A removed update is not automatically a cancellation. See [GTFS Realtime reference](https://gtfs.org/documentation/realtime/reference/).
7. If realtime becomes stale, downgrade visibly to schedule-only where the schedule is still valid. Preserve known cancellations for the trip's relevant lifetime unless superseded; do not resurrect them just because the live feed failed. Hide movements once their schedule validity or supported trip window expires. Expose stale-source status.
8. **Every 15–30 seconds:** refresh the frontend's bounded active-trip snapshot; animate locally at a modest rate. An optional replay needs retained feed versions and updates, otherwise label it schedule replay rather than historic reality.

For ordinary waste collection, retain date-level precision. A truck tour may be generated only as a separate scenario with an explicit synthetic route/time window and deterministic seed; collection calendars cannot establish actual order, fleet size or the time a street is served. Umweltmobil stop windows can be rendered directly without such assumptions.

## Delivery plan and acceptance criteria

| Phase | Deliverable | Completion gate |
| --- | --- | --- |
| 0 — source spike | Current VRN schedule download, local stop/route inventory, decoded realtime sample, geometry assessment, source/license registry; test a ZAKB calendar export. | Demonstrate services in both towns; record missing operators/rail and RT match rate. Establish feed access/terms. No assumed line numbers hard-coded. |
| 1 — schedule MVP | Importer, separate mobility schema/API and bus/train overlay with daily refresh. | Review one bus and one rail journey end to end against official times and mapped geometry; validate weekday/weekend, calendar exceptions, overnight and DST cases. |
| 2 — realtime | VRN bus corrections; optional DB rail corrections after access and matching checks. | Verify cancellation, skipped stop, stale-feed fallback, duplicate updates, provider-ID mismatch and feed rollover. All inferred positions retain their labels. |
| 3 — municipal services | ZAKB date-level collection layer and Umweltmobil windows; parking via the Smart City collector. | Street/zone accuracy, calendar revisions/year rollover, source timestamps and separate observed/scheduled semantics. |
| 4 — additional context | Supported roadworks feed, local cycle/traffic counts, chargers and any locally useful bike-sharing availability. | Confirm local coverage and publication rights for each source. Avoid shipping empty regional layers. |
| 5 — scenarios / partnerships | Optional generic delivery/collection simulations; operator-provided vehicle or signal feeds if obtained. | Fictional mode is explicit; real feeds have documented meaning, cadence and access. |

Phase 0 determines reliable estimates for implementation effort; access delays and missing rail shapes are the main uncertainties. The first useful release is phase 1, not an all-provider integration.

Operational checks: bounded HTTP timeouts; exponential backoff/jitter; honor Retry-After; persist update/import checkpoints; reject malformed/out-of-order data; monitor last successful fetch separately from latest source observation. Track local active-trip count, shape coverage, realtime match rate, stale trips, import validity horizon and skipped/unmatched records. Pilot over a weekday and weekend before general release.

Tests should cover schedule boundaries, loops/repeated stops, missing geometry, feed version transitions, cross-source duplicate trips, cancelled journeys during outages, collector restarts and transactional rollback. Verify no mobility simulation writes to sensor_data and no animation-frame history accumulates. Retain only bounded diagnostic snapshots and the schedule/update history actually required for replay.

## Provider questions to resolve during implementation

- VRN: current static download, approved cadence/license, local operator coverage and any separate vehicle-position or rail feed.
- DB/DELFI: access terms, quotas, station/trip identity mapping and local rail/through-service coverage.
- ZAKB: supported calendar export and street-zone identifiers, permission to republish dates, any open route/tour data or vehicle cooperation.
- Cities/Hessen Mobil/platform operator: supported parking/count/roadworks endpoints; local signal asset ownership and availability of detector or phase data.

These are outstanding discovery items, not messages sent or commitments obtained.
