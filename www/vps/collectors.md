# Collector maintenance and deployment

The collectors use the same local structure while remaining independently deployable. There is no shared runtime package or universal data model.

### Regional sky collector

`sky-collector` calculates solar azimuth/altitude, lunar azimuth/altitude,
illuminated fraction and phase every five minutes for a fixed reference point
in the Hessian Ried (49.62° N, 8.46° E; 100 m). It stores timestamped model
readings through `write_measurement` under `region:hessisches-ried`; no external
ephemeris service or observation is implied. The map reads the latest database
snapshot from `/api/v1/sky`. Install the canonical measurement schema before
starting the collector. `SKY_POLL_SECONDS` can change the cadence, with a
60-second minimum.

| Module | Responsibility |
| --- | --- |
| `config.py` | Explicit `Settings.from_env()` validation; no import-time settings |
| `source.py` | HTTP or CAPS acquisition; source failures propagate |
| `normalize.py` | Deterministic domain conversion and validation |
| `storage.py` | Transactions, source-specific reconciliation and replay rules |
| `health.py` | Atomic status snapshots and health evaluation |
| `main.py` | Connect the domain pipeline and start the service |
| `runtime.py` | Polling lifecycle, bounded cycle, CLI, backoff and shutdown; pollers only |
| `buffer.py` | Durable bounded per-station queue; Shake only |

Small lifecycle/status helpers are intentionally duplicated. When changing their contract, update the equivalent local copies and their regression tests. Domain rules remain local.

## Polling services

Smart City, Nextbike and Traffic expose:

```sh
python main.py                     # daemon
python main.py --once              # one committed cycle; failure exits nonzero
python main.py --dry-run           # acquire and normalize; no DB or state writes
python main.py --dry-run --input snapshot.json
python main.py --healthcheck
```

Each cycle runs acquisition, normalization and persistence in that order. HTTP responses are limited to 20 MiB per endpoint with a 45-second acquisition deadline. A whole cycle has a 50-second budget, below Compose's 60-second shutdown grace. SQL transactions use statement/lock timeouts; connections are opened after acquisition and closed each cycle. Unexpected failures are logged and retried; `--once` and `--dry-run` fail immediately.

Retries use exponential backoff and jitter, respect HTTP Retry-After, and never poll faster than the configured normal interval. No cycles overlap. Fix invalid configuration before restart; configuration errors fail startup. Schema incompatibilities remain visible failures until the API migration is deployed.

### Status

All pollers use `/data/status.json` (under their configured state directory). Common fields are `status`, `last_attempt`, `last_success`, `consecutive_failures`, `error_category`, `accepted`, `skipped`, `source_coverage`, `complete`, `ingestion`, and `durations_seconds`. Domain-specific fields are retained, including Smart City's observation timestamps.

A failed attempt preserves the last successful status details and increments the failure count. Docker health becomes unhealthy when no successful commit occurred within `max(300, 3 * poll_seconds)` seconds. A single temporary failure can therefore report degraded status while still inside the health grace period. Unchanged valid observations count as successful ingestion; zero newly inserted rows is not itself a failure. Status-file errors are logged separately and never turn a committed transaction into a failed write.

### Domain rules

- **Smart City:** all configured dashboards must be acquired. Source timestamps, units, duplicate detection, revision history, and admin metadata protection remain intact. Metadata writes occur once per sensor per batch. The latest raw dashboard bundle remains available for diagnostics.
- **Nextbike:** `NEXTBIKE_CITY_IDS` requires positive IDs or the explicit value `all`. Missing configured cities, malformed records, and duplicate station/bike identities reject the snapshot. Counts are sampled on change or after 15 minutes; a roster change also records an availability observation. Acquisition time is not a provider measurement timestamp. Movement records carry `inferred_station_change` evidence. Bike freshness expires after `max(900, 3 * poll_seconds)` seconds and the API filters expired bikes even if collection is unavailable. Admin names and existing coordinates survive polling. Previous metrics are read once for the station batch; previous bike reads are scoped to incoming bike IDs.
- **Traffic:** every configured road's warning, roadworks and closure endpoint must succeed and validate. Up to three requests run concurrently. Failed/partial snapshots never write clear snapshots or resolve incidents. Valid empty snapshots may resolve unseen incidents after six minutes, scoped to the configured roads and `autobahn_api`. Duplicate incident IDs are counted once; closure takes precedence. Unknown locations remain empty. Delay provenance is `reported`, `estimated` or `unknown`; closures no longer invent a 30-minute delay. Start/end times describe collector observations, not verified incident occurrence times.

## Shake streaming

Each station independently discovers its channel, reads the stream, builds fixed UTC source-time windows, and writes acknowledged batches. Windows default to five seconds and allow two seconds of lateness. Aggregates are timestamped at the exclusive end of their window. Duplicate timestamps within a window collapse; samples older than the durable window cursor are counted and skipped. `pgv` and `rms` remain **counts**, not calibrated physical velocity.

Queued readings and the source cursor are stored together in `/data/<sensor-id>/spool.json`. Each atomic replacement is flushed to disk. The default capacity is 120 batches per station. Full queues apply backpressure; unacknowledged batches are never discarded to make room. Restart resumes pending batches and requests source replay from the last queued window boundary. Replay beyond the upstream history available from CAPS is not guaranteed. Incomplete in-memory windows rely on source replay after a crash. Do not run multiple processes against the same station spool directory.

A stable batch ID and payload hash are committed in `telemetry_ingest_batches` in the same database transaction as readings. Both direct SQL and API ingestion recognize receipts. Retrying after a lost acknowledgment cannot duplicate a committed batch; reusing an ID with different content fails. Other API clients without `batch_id` retain their original append behavior. Receipt retention is intentionally not automatic: deleting receipts would invalidate replay protection for old queued batches. Account for this table in storage/retention planning.

SIGTERM stops acquisition and allows a bounded drain (default 20 seconds). Unacknowledged queued batches remain on disk after the deadline. Use the persistent Compose volume `shake_state`; removing it also removes replay cursors and pending data. A real station's source records, not wall-clock arrival times, determine historical windows.

New primary environment names:

| Variable | Default |
| --- | --- |
| `SHAKE_INGEST_MODE` | `direct_db` (`api` also supported) |
| `SHAKE_API_URL` | `http://backend-api:8080/api/v1` |
| `SHAKE_SAMPLING_INTERVAL_SEC` | `5` |
| `SHAKE_STORE_RAW_WAVEFORM` | `false` |
| `SHAKE_RAW_DECIMATION_FACTOR` | `10` |
| `SHAKE_LATENESS_SECONDS` | `2` |
| `SHAKE_QUEUE_BATCHES` | `120` |
| `SHAKE_SHUTDOWN_SECONDS` | `20` |
| `SHAKE_STATE_DIR` | `/data` |
| `SHAKE_RECONNECT_DELAY_SEC` | `5` |
| `SHAKE_MAX_RECONNECT_DELAY_SEC` | `60` |

The old unprefixed ingestion/window environment names remain aliases; prefixed names take precedence. Station/network/endpoint variables and database credentials remain supported. API mode requires distinct ingestion and admin keys, and registers metadata without overwriting admin edits. Direct mode reuses one recoverable connection per station, bounding connection count by configured stations.

Health checks evaluate every configured station's latest commit and source timestamp. Recent writes of old replayed data do not indicate a healthy live stream. Use `--duration 60` for a bounded live capture. Offline normalization requires one station and writes nothing:

```sh
SHAKE_STATIONS=R498E python main.py --dry-run --input samples.json
```

`samples.json` is an array of `[unix_seconds, counts]` pairs.

## Archive worker

The Node export workflow remains separate. It still streams consistent database snapshots into bounded ZIP parts, validates station visibility and publishes only after upload. Old file keys are queued in `archive_cleanup` in the catalogue replacement transaction; failed deletion is retried on a later pass without undoing publication or losing keys. Cleanup stops at the first failure to avoid hammering an unavailable provider. Failed unpublished uploads are also queued for cleanup when the database remains reachable.

Watch mode writes `/data/status.json`, waits a day after successful work, and retries failed export work with capped exponential delay. SIGTERM interrupts the wait and prevents another month starting; an already-running month is allowed to finish, subject to the container grace period. Process termination during an upload can still leave orphaned remote artifacts. Durable upload-intent tracking is not introduced by this refactor.

## Deploying this change

1. Build/pull the updated images. Stop the old collectors before replacing them.
2. Apply the updated API schema first: `docker compose run --rm backend-api python migrate.py`, then restart the updated API. Startup still applies the idempotent schema for compatibility and now fails if migration fails.
3. Start the collectors. Compose waits for database/API readiness. The Python collectors use the same non-root Docker baseline and persistent state directories.
4. Inspect the per-service status files and Docker health. Preserve the Shake volume on subsequent deployments.

The additive schema migration introduces batch receipts, traffic delay/category provenance, bike freshness/evidence, an archive cleanup queue and schema version `20260916`. It does not delete existing telemetry. Legacy rows may have unknown provenance. Do not deploy only the new collectors against an old API/schema. No deployment is performed by this repository change.

## Verification

Run from the repository root with dependencies installed:

```sh
bash www/vps/test-collectors.sh
```

The runner executes each service in a separate Python process to avoid collisions between their intentionally identical local module names, then runs API and archive tests. Python tests use pytest discovery; unittest test cases are also supported. Node dependencies must be installed in the archive worker.

For integration tests, set `COLLECTOR_TEST_DATABASE_URL`, `SMARTCITY_TEST_DATABASE_URL`, `MAP_TEST_DATABASE_URL`, and `ARCHIVE_TEST_DATABASE_URL` to an isolated disposable test database. Tests create and remove temporary schemas. Set `COLLECTOR_TEST_TIMESCALE=1`, `SMARTCITY_TEST_TIMESCALE=1`, and `MAP_TEST_TIMESCALE=1` to test real Timescale hypertables. CI uses TimescaleDB on Python 3.11 and installs the real ObsPy decoder; local PostgreSQL-only tests cannot validate Timescale-specific behavior.

Regression coverage includes complete vs failed traffic snapshots, scoped resolution, rollback recovery, deterministic replay, changed bike rosters, metadata preservation, source-time windows, durable queue recovery, failed-write retries, bounded shutdown, API replay receipts, and delayed archive cleanup.

### Local refactor verification (2026-09-16)

99 tests passed: Smart City 33, Nextbike 8, Traffic 9, Shake 10, API 33, archive worker 6. All database integration tests ran against isolated PostgreSQL 14 schemas. One real MiniSEED decoder test was skipped locally because ObsPy is absent; CI installs it under Python 3.11. Local Python was 3.14, so this run does not substitute for the production-runtime/Timescale CI jobs. Changed Python files passed Ruff, Compose configuration validated, and `git diff --check` passed. No live upstream capture or production deployment was performed.

## Flugverkehr über dem Ried

Der eigenständige [aircraft-collector](aircraft-collector/README.md) erfasst frische
ADS-B-/MLAT-Positionen über dem Ried via adsb.lol und schreibt sie in die gemeinsame
Bewegungs- und Messwertpipeline. Die Karte erhält sie über den Mobilitätsstream.
Abruf standardmäßig alle 15 Sekunden, Positionen maximal 60 Sekunden gültig,
Quellenangabe adsb.lol / ODbL 1.0. Segelflugzeuge sind nur teilweise erfasst;
OGN ist in diesem ersten Adapter noch nicht angebunden. Deployment benötigt beide
API-Migrationen, den neuen Compose-Dienst und das aktualisierte Frontend.
