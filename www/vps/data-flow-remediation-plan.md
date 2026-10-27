# Persistent source data and reproducible predictions: implementation plan

Status: proposed implementation plan, 2026-09-17. No implementation or deployment
is performed by this document. Based on [the repository audit](data-flow-audit.md).
Revised to preserve evidence-based simulated movement and forecasts, as requested.
This revision supersedes the audit's recommendation to remove simulations broadly.

## 1. Outcome and boundaries

All displayed third-party domain data and map resources must follow:

```text
Third-party service / published source file
    -> VPS collector
    -> immutable raw response storage in PostgreSQL
    -> validation, normalization and provenance
    -> committed PostgreSQL / TimescaleDB data
    -> VPS prediction worker using versioned stored inputs
    -> committed prediction runs, trajectories and forecast history
    -> read-only VPS public API
    -> Next.js server / same-origin API
    -> frontend
```

The public read path must never fetch a third-party source to satisfy a request.
Collectors own acquisition; the database owns source history and published model
outputs. The frontend may show observations, schedules, forecasts and simulated
movement based on those stored records. Predictions must be labeled and retained
as predictions; they must never overwrite or impersonate observations.

Scope includes map imagery, route geometry, reference registries, statistics,
events and live observations. First-party UI labels, colors, category definitions,
icons and formatting remain code. External attribution/source hyperlinks are
allowed; automatically loaded external content is subject to the data flow above.

“Everything fetched” means retaining the complete acquired response/file/message,
including fields not yet understood by a parser, alongside normalized domain data.
This includes schedules, live feeds, geometry, imagery, PDFs/CSV/ZIP files and
stream messages. Scope the sources/geography deliberately, but do not silently
discard parts of a response after fetching it. A source inventory defines what to
fetch; it does not narrow what to retain from an acquired payload.

Prediction is part of this project. For example, a collected bus timetable and
route can drive a moving bus marker without GPS; a ZAKB street/date/fraction
schedule can drive a collection forecast. Store the evidence, modeling assumptions,
model version, generated forecast and later revisions. A forecasted trip is not
proof that the trip actually ran. Existing inferred nextbike trips follow the same
provenance rules. Browser animation renders persisted trajectories deterministically
without generating a separate, unrecorded version of the underlying prediction.

Two delivery milestones:

- **A — trustworthy capture and display:** fetched data is retained, predictions
  remain visible with their basis and age, and no estimate is presented as measured.
- **B — reproducible history and coverage:** source revisions, daily schedules,
  predictions and observations can be queried independently and replayed. Missing
  live feeds do not block schedule-based predictions; missing evidence is explicit.

## 2. Phase 0: establish deployment and source inventory

Deliverable: a source manifest and deployment baseline before migrations.

1. Inspect deployed image revisions, enabled Compose services, collector logs,
   schema versions and row freshness. The audit verified repository code only.
2. Capture a database backup and demonstrate a restore into staging. Record row
   counts by domain/source/year and distinguish latest-state from historical tables.
3. Extend the audit inventory with one entry per dataset: source owner, exact
   endpoint or file, access requirements, format, coverage, identifier, source time
   semantics, polling cadence, raw archive, attribution, parser and target tables.
   Inventory which scheduled services and model assumptions feed each simulation.
4. Investigate actual provider documentation and sample payloads before promising
   feeds. Named organizations and URLs in current code do not prove integration
   availability. Record credentials, publishing/storage permissions and technical
   limitations where they affect an importer, especially map resources.
5. Classify each integration as implemented, partial, awaiting source verification,
   access-dependent, or unavailable. Keep this status separate from runtime health.

Acceptance: every visible dataset has an accountable source entry; production
state and backups are known. Missing provider access does not block containment.

## 3. Phase 1: retain all acquired data and establish provenance

Primary files: `registry-sync-worker/jobs/*.py`, `scheduler.py`, `main.py`,
`api/v1/schema.sql`, `api/v1/migrate.py`, relevant endpoint queries.

### Stop misleading writes

- Stop writing modeled values into tables/fields that represent collected facts.
  Move useful budget/population/energy projections and carry-forward assumptions
  into explicit prediction runs. Retain a model only with a documented basis;
  an arbitrary availability value is not made useful by labeling it predicted.
  Remove timestamp-only updates that falsely imply new source observations.
- Unimplemented jobs report `not_configured` or `unsupported`, with zero imported
  rows. They must not report successful source synchronization.
- Distinguish source/job states: success, partial, failed, not configured. Missing
  runtime dependencies must fail startup, not silently turn production into dry-run.
- An offline dry-run parses previously archived inputs without writes. Any command
  that actually fetches external data must archive it, even if normalization is
  preview-only. Rename/document preview flags accordingly; do not let `--dry-run`
  become an exception to capture. Remove hardcoded projected row counts.
- Ensure `--all` reports individual failures and returns a failure exit status when
  required jobs fail. Split multi-source jobs so one successful source does not
  conceal another source's failure.

### Raw acquisition archive: before normalization

Add the following conceptual tables using existing conventions where possible:

| Table | Required contents |
| --- | --- |
| `source_datasets` | Source, acquisition contract, coverage, attribution and polling/stream configuration |
| `acquisition_runs` | Attempt time, source, status, completeness, request identity and captured/rejected counts |
| `raw_payloads` | Immutable exact payload bytes, content type/encoding, checksum, byte length and compression metadata |
| `fetch_records` | Every response/message occurrence, receipt time, status, source cursor/sequence, safe response metadata and `raw_payload_id` |
| `normalization_runs` | Input payload references, parser version, output counts, errors and committed revision |

Store complete JSON responses as bytes, not only selected fields or a lossy JSON
rewrite. Keep decoded JSON where useful for search. Archive ZIP/PDF/image and
binary/stream payloads as received at the application boundary. Each fetched page
gets its own receipt record; an aggregate run records whether pagination completed.
Deduplicate identical bodies by checksum while retaining every fetch occurrence.
For 304 responses, keep the receipt and link the previous stored representation.
Retain non-success response bodies and malformed payloads for later diagnosis and
reprocessing; network failures have attempt records even when there is no body.
Do not persist authorization headers, tokens or secret-bearing request URLs in
generic logs/provenance. Raw data access is internal, separate from public APIs.

Archive first, commit normalized data second: a parser crash must not lose fetched
input. If DB storage is temporarily unavailable, durably spool received bytes on
the VPS and replay into the DB before publishing results; this is an outage buffer,
not a permanent substitute for DB retention. Backpressure/pause acquisition when
the buffer is full, report gaps, and resume/replay from upstream cursors where
supported. No architecture can recover unreceived stream data without source replay;
make those gaps visible. Never advance an upstream acknowledgement/cursor before
durable capture where the protocol permits it.

Apply capture to existing Shake/SmartCity/nextbike/traffic/environment clients,
registry jobs, route-generation tools and map assets. Shake must retain received
waveform/messages regardless of whether raw waveform is currently optional.
Use bounded DB chunks for large streams/files and manifest/checksum verification.

Default retention is indefinite for acquired source data, revisions and prediction
history. Use compression, partitions and deduplication; do not introduce TTLs,
downsampling that deletes originals, or external-only archives implicitly. Any
future retention exception needs an explicit user decision. Estimate storage,
WAL, backup and restore costs for waveform, map imagery and repeated feeds early.

### Add provenance without replacing working collector designs

Reuse existing source, observation and sync tables where practical. Add a shared
dataset catalog and ingestion-run identity, with domain rows referencing their
source/run or an equivalent existing provenance record. Store:

| Field | Meaning |
| --- | --- |
| source / dataset / external ID | Stable origin and upstream identity |
| observed_at or reporting_period | Source measurement time or publication period |
| fetched_at | When the VPS obtained the input |
| published_at / issued_at / valid_at | Where relevant to documents and forecasts |
| last_attempt_at / last_success_at | Collector health, independent of observation age |
| ingestion_run_id / parser_version | Traceability to one import and normalization version |
| source checksum / revision | Replay, deduplication and correction detection |
| provenance_kind | Observed, published reference, scheduled, provider forecast, modeled, derived, legacy unknown, fixture |
| raw_payload_id / source revision | Traceability back to the complete acquired input |
| verification_status | Verified, pending review, rejected |

Unknown source timestamps remain unknown; fetch time is not substituted as a
measurement time. Define freshness per dataset: annual statistics do not expire
like vehicle positions. Successful checks for unchanged data must not advance
its observation date.

### Existing data and migrations

1. Separate production schema/reference configuration from demo domain seeds.
   Move fixture data to test-only loaders. The current migration reruns `schema.sql`;
   remove production seed statements there so quarantined data is not recreated.
2. Introduce ordered, recorded migrations with an advisory lock and transactional
   application where possible. Support both existing installations and fresh DBs.
3. Produce a reviewable classification report for existing rows. Use insertion
   history, checksums and collector evidence; never label a row verified solely
   because it resembles an official record or has a source-name string.
4. Preserve uncertain rows and classify them honestly. Documented local schedules,
   geometry or assumptions can be imported as versioned manual/model inputs, with
   `legacy/manual` provenance; they must not be relabeled as official fetched data.
   Untraceable fixtures remain excluded from production. Do not mass-delete records.
5. Classify old projections as legacy estimates, with unknown generation/input
   lineage where necessary. New forecasts must use full lineage. Re-import verified
   records using stable keys, preserving prior versions and corrections.

Normalized histories must retain revisions, not just raw payloads: preserve event
changes/cancellations, timetable versions, registry changes, route revisions and
observations. Current/latest tables are rebuildable projections. Store both source
validity (`valid_from/to`, reporting/service date) and knowledge time (`recorded_at`,
superseded revision), enabling “what was valid?” and “what did we know then?” queries.

Acceptance: every acquired payload survives parser failure, every displayed estimate
is distinguishable from an observation, history survives corrections, and migrations
are safe to rerun without restoring fixtures.

## 4. Phase 2: define DB-only API and frontend behavior

Primary files: `api/v1/endpoints/*`, `hack-the-ried/lib/*Data.ts`,
`lib/regionalStats.ts`, `lib/mapBackend.ts`, `app/api/**/route.ts`,
`app/components/MapComponent.tsx`, page/widget consumers.

### Response and error contract

Introduce a versioned/additive frontend-facing envelope so existing public array
API consumers are not silently broken:

```json
{
  "data": [],
  "meta": {
    "dataset": "traffic_incidents",
    "state": "empty",
    "source_id": "autobahn",
    "last_success_at": "<source-run timestamp>",
    "observed_at": null,
    "reason": null
  }
}
```

Define states `ready`, `empty`, `stale`, `unavailable`, `not_configured` and
`partial` with documented semantics. `empty` requires a successful complete
snapshot: no observations yet is not the same as zero incidents. Preserve
per-source status for mixed datasets. Backend/DB failure returns an appropriate
non-success response, never fabricated success data. A stale DB snapshot can be
served with its age; stale vehicle locations must not appear as live vehicles.

Freshness and evidence kind are independent. Every item carries `data_kind`
(`observed`, `scheduled`, `predicted`, etc.), source/input revision, observation or
valid time, and prediction run when applicable. Mixed layers carry per-item labels.
Expose prediction generation time, horizon and basis. Use uncertainty intervals or
qualitative confidence with a documented meaning; do not invent confidence scores.

Select a fresh observation when available; otherwise use a stored valid prediction
if its prerequisites/horizon permit it. A successful empty observation snapshot
does not forbid a separately labeled scheduled service, but must never trigger
unrelated fabricated incidents. Expired predictions become unavailable or historical.

### Remove every frontend bypass

1. Add a server-only backend client that normalizes timeouts, validation and errors.
   Keep shared display types/utilities separate from server fetch code.
2. Replace baseline returns in demographics, economy, real estate, finance,
   elections, social and environment helpers. Update all page consumers to handle
   empty/unavailable states without crashes or accidental zero-value claims.
3. Remove route fallbacks for infrastructure, traffic and street closures. Traffic
   must accept successful empty arrays; use the actual DB corridor inventory.
4. Change bus/truck/train responses to use stored service instances, observations
   and predictions. Match by stable trip/service identifiers, not just line number.
   Database origin alone does not tell the user whether a point is measured or
   predicted; preserve per-item evidence labels in mixed responses.
5. Replace local mobility/departure handlers with DB reads. Replace VPS mobility
   stubs: implement authenticated transactional ingestion or disable the no-op
   `/record` endpoint with an explicit error until implemented.
6. Refactor `calculateRiedMobility`, `calculateBusMobility`,
   `calculateWasteTruckMobility` and useful traffic/energy models into versioned
   VPS prediction logic driven by persisted inputs. Keep frontend motion: interpolate
   along stored predicted trajectories using persisted stop/dwell/segment timings.
   Store interpolation version and parameters so any shown position is reproducible.
   The browser must not choose a new route, speed profile or delay independently.
7. Load infrastructure, company, environment, BORIS, development-plan and election
   layers from DB APIs. Remove default-record merges from `fetchMapData`.
8. Remove hidden hardcoded data fallbacks; import justified manual/model inputs
   into the DB with provenance. Keep useful model algorithms and their tests.
   Production must not silently substitute unrecorded fixture data.
9. Refresh source/status descriptions on `/quellen`, data downloads and widgets.
   Replace unsupported “live”/“verified” claims with accurate provenance and age.

Acceptance: an empty DB with no inputs yields no invented markers; DB schedules
without GPS can yield labeled moving predictions. Backend failure shows unavailable
or an explicitly stale cached DB response. Source outage does not invalidate a still
applicable stored timetable, but must not conceal missing live updates. UI controls
and animated predicted movement remain functional.

## 4a. Prediction engine and historical mobility analysis

This is core implementation scope, not an optional follow-up. Reuse tested existing
motion logic where meaningful, replacing hardcoded schedules and assumptions with
versioned DB records. Run prediction generation on the VPS, independently of browser
visits, so services are recorded even if nobody opens the map that day.

### Persist service instances and model output

| Entity | Required fields and behavior |
| --- | --- |
| `schedule_versions` / `route_versions` | Archived input links, validity, service calendars, exceptions, geometry and publication/version identity |
| `service_instances` | Stable trip/collection-service ID, source trip ID if present, local service date, operator/line, origin/destination or street/fraction, schedule version |
| `service_stop_times` | Ordered stops/streets, planned arrival/departure or collection window; retain every revised plan |
| `observed_service_events` | Actual positions/arrivals/departures only when reported by an observation source; link raw input and source timestamps |
| `prediction_runs` | Model ID/version, generation time, input cutoff, exact input revisions, assumptions, parameters/seed, horizon, status and superseded run |
| `predicted_stop_times` | Estimated arrivals/departures/collection windows, uncertainty, service ID and run ID |
| `predicted_trajectories` | Time-indexed route segments/points, dwell intervals, interpolation algorithm/version, run ID and virtual/actual vehicle association |

Exact schema names are provisional; extend existing bus/truck/train tables where
compatible. Keep observed and predicted histories logically separate, with explicit
query defaults. Predictions are immutable runs: recalculation creates a new version,
not an overwrite. Store input lineage for all model inputs, including weather,
historical aggregates and clustered features if used. Persist model artifacts or
their reproducible source/version and parameters; store a random seed when relevant.

Materialize each day's valid service instances from stored calendars, including
weekends, holidays, cancellations and exceptional schedules. Handle Europe/Berlin
DST and timetable times after midnight (including >24-hour service-day notation
where the source uses it). Do not infer actual operation simply because a scheduled
time passed. A trip can remain “scheduled; actual operation unknown.”

Generate runs on schedule import/revision, before a service day, and when meaningful
new inputs arrive. Select cadence/horizon by domain rather than every animation
frame. Store deterministic trajectories/segments to reproduce arbitrary frame times;
storing 60 positions per second is unnecessary. Keep all generated runs and service
plans; latest/current views merely choose among them. If exact proof of what a
particular user saw is later required, add separate response/run-selection logging;
model replay alone does not prove a browser actually rendered a point.

### Bus and train example

1. Collect and archive timetable/route/calendar inputs on the VPS.
2. Persist today's trip from stop A to stop D and planned arrival/departure at every
   intermediate stop. Stable identity includes service date and trip, not just line.
3. Generate a route-following position model with explicit travel and dwell times;
   publish only after committing the trajectory and predicted stop times.
4. Display a moving marker labeled **“Prognose · Fahrplan”**, with timetable date,
   model generation time and last live update if one exists.
5. If actual positions/delays arrive, archive and store them separately, reconcile
   the service, then generate a new forecast revision. Never rewrite the original
   schedule or previous prediction to match later observations.

### ZAKB street/fraction example

1. Archive and normalize “Restmüll, Straße X, date Y,” collection area, published
   time window and exceptions. Retain schedule revisions and cancellations.
2. If the source provides no truck, route order or exact time, represent a virtual
   collection service. Persist modeled ordering, working-hours assumptions, travel
   and stop durations, and route geometry as model inputs.
3. Show its estimated progress with **“Simulierte Abholtour · Abfallkalender”**.
   Do not invent a real license plate/vehicle identity or imply GPS tracking.
   A whole-day schedule justifies a broad window; exact-looking motion is a modeled
   visualization whose uncertain sequence/timing must remain visible.
4. Store predicted street service windows and trajectory/run history. Actual
   completion remains unknown unless an explicit observation supports it.

### Apply the same contract to other domains

Energy output estimates, traffic predictions and demographic projections can remain
useful if based on stored evidence and documented models. Save their input periods,
assumptions, model versions, generation/valid times and forecast outputs separately
from measurements/published statistics. Do not roll last year's data forward as a
new official observation. Do not infer a precise live charger occupancy count from
station capacity alone; an evidence-based occupancy forecast needs a real basis.

### Historical queries and evaluation

Provide DB-backed history endpoints/exports with service-date, entity, data-kind and
`as_of` filters. Answer:

- Which bus/train trips were planned today, from/to where, and at which stop times?
- What did the forecast predict at 08:00 for the arrival at 08:30?
- What was actually observed, if anything, and how did that differ from the plan?
- Which streets/fractions were scheduled for ZAKB, and what sequence/windows did
  each model version predict?
- Can the map replay the stored prediction for yesterday without fetching sources?

Support both “latest corrected history” and “what we knew at time T.” Backfilled
forecasts are marked retrospective with their real generation time; do not claim
they existed on an earlier day. Evaluate models against actual observations where
available, prevent use of future knowledge in as-of evaluation, and report lack of
ground truth rather than scoring predictions against their own simulated output.

Acceptance: a schedule-only bus/train and virtual ZAKB service animate from persisted
predictions, all stop/street plans and prediction revisions remain queryable after
service completion, and late observations never erase the earlier forecast.

## 5. Phase 3: finish currently implemented collection paths

### Weather and river levels

Files: `environment-collector/{source,normalize,storage,config}.py`, API environment
and telemetry endpoints, collector/API tests.

- Validate the actual provider response shape against fixtures obtained during
  source verification, including gauge current-measurement availability.
- Store temperature, humidity and precipitation history in `sensor_data` and
  update latest values through the established latest-value mechanism. Add river
  observation history using the existing telemetry schema or a dedicated table
  with a stable station key; keep gauge metadata separate.
- Preserve source observation times and timezone semantics; store UTC internally.
  Protect latest values from older/out-of-order observations. Deduplicate replays.
- Make gauge and weather failures explicit and independent; current source code
  swallows failures and can return no data as a successful cycle.
- Reconcile the differing default weather longitude in configuration and test both
  direct settings construction and environment-derived settings.

### Events

Files: `registry-sync-worker/jobs/social_sync.py`, scheduler and tests.

- Paginate to documented completion, with bounded requests and duplicate detection.
- Fail or report partial status on non-200/invalid responses and exceptions.
  Stage a full source snapshot before reconciliation; do not retire missing records
  after an incomplete fetch. Keep the previous complete snapshot available.
- Parse event dates in `Europe/Berlin` rather than hardcoding `+02:00`.
- Upsert all mutable event fields, including venue, times, status and links.
  Update the current projection while retaining each historical revision, source
  IDs, provenance and cancellation history; an upsert alone is not history storage.
- Any displayed remote image must use a stored VPS asset, not its upstream URL.

### Existing stable collectors

Preserve Shake, SmartCity, nextbike and Autobahn behavior. Add source/run coverage
where missing and verify atomicity, replay safety and correction handling rather
than rewriting functioning collectors. Separate observed bike availability from
inferred trips. Keep collector schedules provider-specific and configurable.
Add complete raw acquisition capture to each; current normalized persistence alone
does not fulfill the revised “everything fetched” requirement.

Acceptance: all supported metrics survive a source-to-DB-to-API round trip; replay
does not duplicate history; a failed source never advances its success timestamp.

## 6. Phase 4: implement missing sources by domain

Each adapter follows source fetch -> validated staging -> normalized transaction
-> provenance -> public DB query. Use published source-file imports on the VPS
when a suitable API does not exist. Preserve file checksum, publication period
and extraction method; require validation before publishing extracted PDF values.
Never copy last year's figures to imply this year's publication.

| Workstream | Required implementation | Behavior until available |
| --- | --- | --- |
| Municipal closures | Identify actual municipal/Hessen feeds or publications; implement fetch/parse and call `persist_street_closures`; distinguish lifecycle completion from missing data | Empty/unavailable municipal layer; collected Autobahn data remains separate |
| Rail and buses | Archive timetables/updates/positions; persist daily trips and stop times; generate versioned predicted trajectories from stored inputs | Moving timetable-based predictions remain available without GPS |
| Level crossings | Store observed states if available; predicted closure windows require a separate documented model and stored inputs | Actual state `unknown`; any predicted window is explicitly an estimate |
| Waste trucks | Archive collection calendars and exceptions; persist street/date/fraction services and virtual tour forecasts; ingest fleet GPS if available | Animated modeled tours with uncertain timing, no invented actual vehicle identity |
| EV / Wi-Fi / broadband / roads | Import registries and inspection records with dates; distinguish inventory, observations and supported forecasts | Unknown live availability; forecast only with sufficient stored evidence |
| Energy | Import facility registry, weather and available readings; persist modeled output with model version and assumptions | Clearly labeled stored generation estimate where inputs support it |
| Environment | Import protected/crop geometry, reporting-year agriculture and groundwater measurements; retain forecast/model outputs separately | Observations may be absent while supported forecasts remain visible |
| Demographics / economy / social | Import published indicators/tax/commuter/facility/company records and preserve reporting periods; store projections separately | Most recent published year plus clearly separated modeled scenarios |
| Real estate | Verify BORIS and other source access; import values, geometry, housing/permit statistics and plans with publication dates | Only datasets with verified import coverage |
| Finance / elections | Import budgets, expenditure, events, districts/results and revisions; preserve official status; model outputs are separate | Budget scenarios may be labeled projections; no modeled value presented as adopted budget or election result |

Deliver each source adapter independently with representative fixtures, count
reconciliation, parser-version provenance and an explicit source manifest update.
Do not make completion of one domain depend on inaccessible sources in another.

## 7. Phase 5: store and serve map resources

The strict DB-only requirement includes basemap tiles, WMS imagery and route
geometry. A same-origin pass-through proxy does not meet it.

1. Verify an acquisition method/provider that permits the intended stored regional
   dataset; do not assume existing public tile URLs permit bulk ingestion.
2. Bound the geographic area, zoom levels, layer/style combinations, update cadence
   and update cadence. Retain acquired revisions; estimate disk/WAL/backup demand
   in staging before ingestion. Do not silently discard old imagery versions.
3. Store acquired imagery as DB binary assets with content type, checksum, source,
   attribution, acquisition time and stable tile/resource key. For vector data,
   store source geometry and serve DB-derived tiles. Choose one representation per
   layer after examining the actual source format and measured storage needs.
4. Serve imagery from a first-party DB-only endpoint with ETags and caching.
   Missing tiles return an explicit no-data response; background collection may
   fill coverage, but the request handler cannot fetch upstream imagery.
5. Move OSRM route acquisition from frontend scripts to a VPS import job, persisting
   returned geometry, route inputs, source and revision. Frontend renders DB routes.
6. Replace Leaflet URLs with first-party endpoints. Keep attribution visible.
   Cache only DB-derived resources; invalidate on data revision.
7. If map ingestion is blocked, disable the affected layer until it has stored
   coverage. Do not retain external loading as an invisible exception.

Acceptance: basemap/overlays work for stored coverage with upstream networking
disabled. Browser requests never contact OSM, BKG, OSRM or other data providers.

## 8. Phase 6: enforce and test the architecture

Extend `www/vps/test-collectors.sh` to include registry-sync-worker tests in an
isolated interpreter. Add targeted Python DB integration tests and frontend
behavior tests to the existing suites. Add a browser test runner for network and
failure-state assertions. Preserve and adapt useful simulation tests to stored
inputs and reproducible outputs. Replace tests requiring hidden hardcoded data.

| Scenario | Required assertion |
| --- | --- |
| Empty initialized DB with no model inputs | No unsupported baseline records or predictions |
| DB timetable but no GPS | Moving predicted services with clear labels and stored trajectories |
| ZAKB date/street/fraction but no fleet feed | Virtual collection forecast; no claim of actual truck identity/completion |
| Prediction recomputation | New immutable run; original plan and forecast remain queryable |
| Observation arriving after prediction | Actual and predicted history remain separate; latest display selects appropriate evidence |
| Historical as-of replay | Correct input/model revisions, no future knowledge leakage |
| Service day / DST / overnight trip | Correct daily service identity and stop times across midnight/calendar exceptions |
| Complete payload with unknown fields / parser failure | Original bytes preserved and later reprocessable |
| Repeated identical response / 304 | Every receipt recorded; payload deduplicated without losing fetch history |
| Stream/DB interruption | Durable spool replayed, acknowledgements safe, unavoidable gaps recorded |
| No browser visits during a day | Scheduled instances and forecast history still generated on VPS |
| Complete traffic snapshot with zero incidents | Zero displayed incidents, not local congestion |
| Backend unavailable | Unavailable state; no fake successful response |
| Provider unavailable / partial snapshot | Last complete DB data preserved with explicit age/coverage |
| Old/out-of-order observation | Latest observation does not regress |
| Duplicate source delivery | Idempotent writes and unchanged history count |
| Collector crash mid-import | Raw input survives; no partially published snapshot or false success |
| Source timestamp unknown | Unknown measurement time; fetch time separately visible |
| Published annual data | Reporting year unchanged by polling or calendar rollover |
| Events > 50 / winter dates | Complete pagination; correct Berlin timezone |
| Weather | Humidity, temperature, precipitation and river history readable through API |
| Legacy migration / clean install / rerun | Verified data preserved; fixtures not exposed or recreated |
| Browser across all pages/layers/downloads | No automatic third-party data/media requests |
| Public read API with provider egress blocked | DB-only responses continue to work |

Add CI checks for forbidden production fixture imports, unpersisted prediction
generation in frontend handlers, and unexpected
external resource URLs, with narrow exceptions for source/attribution hyperlinks.
Runtime browser checks remain necessary because static searches cannot prove the
absence of dynamic external requests. Run frontend tests, lint and production
build, relevant collector/API integration suites, and existing archive tests when
schema/query changes affect archives.

Expose per-source health: latest attempted/successful run, actual observation age,
coverage, imported/rejected rows and failure reason. Alert on actionable stale or
failed sources, not just process exit. Prevent overlapping imports for a source.

## 9. Suggested pull requests and dependency order

| PR | Scope | Depends on |
| --- | --- | --- |
| 1 | Source/deployment inventory; disable fabricated writes and false success | Baseline audit |
| 2 | Raw archive, revision/provenance schema, ordered migrations, legacy classification | PR 1 |
| 3 | DB-only API contract including observed/scheduled/predicted kinds and shared frontend client | PR 2 |
| Mobility inputs | Timetable and collection-calendar capture; daily service instances and versioned geometry | PR 2 and source verification |
| Prediction worker | VPS model generation, immutable runs/trajectories, historical queries and replay | Mobility inputs; PR 3 for API exposure |
| 4 | Replace hidden frontend fallbacks with DB observations/predictions; preserve animated movement | PR 3 and Prediction worker for mobility |
| 5 | Weather persistence, source failure handling, event pagination/timezones | PR 2; can proceed alongside 3–4 |
| 6+ | One verified source adapter per independent domain/dataset | PR 2 and source verification |
| Map PRs | Stored map-resource/route ingestion and first-party serving | PR 2 and acquisition/storage validation |
| Final gate | Browser network enforcement, deployment verification and source-status documentation | Relevant preceding PRs |

Add tests in the PR that changes behavior; do not defer correctness testing to
the final gate. Prioritize one complete bus/train service and one ZAKB virtual tour
as vertical slices: raw input -> daily plan -> stored forecast -> moving marker ->
historical replay. Extend the same pattern to other domains. Migrate each existing
animation after its persisted equivalent is ready; do not remove all moving layers
up front. Label legacy estimates honestly during transition and do not claim their
unrecorded past frames are recoverable. Milestone A requires all active paths to
use capture/provenance; milestone B adds complete historical queries and coverage.

## 10. Deployment and rollback

1. Rehearse migration on a restored staging DB; inspect visibility classification
   and before/after counts. Keep a restorable backup and export of classifications.
2. Deploy containment first so legacy workers stop writing estimates as observed
   facts. Keep modeled outputs only through explicit prediction persistence.
3. Apply additive migrations, then compatible API/collector releases. Use pinned
   tested image revisions for this coordinated release and control automatic
   updates during the migration window.
4. Run real-source canaries and compare payload samples with stored records and
   API output. Check source timestamps, units, coordinates and pagination counts.
5. Deploy DB-only frontend and stored map layers, preserving labeled predictions.
   Verify schedule-only movement and historical replay as well as live observations.
6. Observe at least two normal cycles per enabled live collector. Run explicit
   one-shot imports for slow annual/monthly datasets; do not wait a calendar period.
7. Verify production browser network traffic, DB freshness and source health.
   Restore-test the resulting backup including raw payloads, waveform chunks, map
   assets, schedule versions, model inputs and prediction history. Monitor archive
   growth, spool backlog and prediction coverage independently of source health.

Rollback pauses failing new collectors and retains verified DB data. Keep schema
changes additive through stabilization. Roll back to a known DB-only release or
temporarily disable affected features. A last compatible stored prediction can
remain visible within its validity horizon; do not revert to unrecorded models.
Destructive legacy cleanup is a separate, backed-up migration after classification
review and is not needed to establish database-only display.

## 11. Definition of done

- Every fetched response/file/message is durably retained in the DB, with receipt
  history and provenance, including unparsed fields and failed-parse inputs.
- Every displayed value is a traceable observation, published/scheduled record or
  explicitly labeled forecast/derivation using versioned stored inputs.
- Animated bus/train and modeled ZAKB movement remain supported without GPS;
  schedules, service instances, stop/street timings and prediction revisions are
  retained for historical analysis. Estimates never establish actual operation.
- No hidden baseline fallback, backend success stub or false freshness update remains.
- Supported normalized fields are persisted and tested, and raw originals remain
  available for future analysis. There is no implicit historical-data deletion.
- No automatically requested third-party data/map/media resource bypasses the DB.
- Freshness, evidence kind, uncertainty, publication period, empty results and errors
  have truthful UI behavior. Historical queries distinguish plan, forecast and actual.
- Migrations, replay/failure tests, frontend build and browser network tests pass.
- Deployed images, collector runs, database contents and browser behavior have been
  checked; repository implementation alone is not treated as deployment proof.

Provider access, complete raw-stream retention, map storage volume and the quality
of prediction inputs are the largest unknowns. Size storage and model scope after
Phase 0 sampling. Raw capture and truthful provenance can begin immediately;
absence of live GPS is not a blocker for timetable/calendar-based prediction.
