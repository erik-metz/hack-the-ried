# Measurement migration: deployment and rehearsal

## Production deployment — 2026-10-01

At the user's explicit request, the additive core was applied directly to the VPS
without another test run. `entities`, `measurement_definitions` and `readings`
are installed and live shadow writes are enabled. Current sensor metadata/readings,
movement readings, seven statistics publications, two charger publications, two
gauge publications and 1,765 archived weather receipts were transferred.

The API runs with `MEASUREMENT_READ_MODE=core_current`: current snapshots and
supported publications use canonical readings; historical `sensor_data` queries
continue using the complete old history. Historical transfer and some domain
mappings remain incomplete. The weather collector runs with
`MEASUREMENT_WEATHER_WRITE_MODE=dual`; its first live acquisition committed and
both updated services started healthy.

Source is mounted read-only from
`/home/ubuntu/my-app/releases/measurement-229fb2d/www/vps/` using the default
`docker-compose.override.yml`. `measurement_reads.py` includes the subsequent
`core_current` change. Automatic image updates remain enabled. No legacy tables
were removed; full historical transfer was not started with only 2.4 GiB free.

## Earlier implementation notes

The working branch implements the three core tables, shared SQL ingestion, revision/latest helpers, sensor/movement/statistics/charger shadow writes, bounded backfill, comparison audits and preliminary disk sizing. Sensor, movement, statistics, charger and archive readers have an opt-in compatibility path. Reads default to legacy; this is not a completed production cutover. Installing an updated API image alone does not activate migration.

## Verified local rehearsal, 30 September 2026

- Streamed a full custom-format backup directly from the VPS to the local machine, without creating a dump file on the VPS. Backup size: 2,483,227,471 bytes; SHA-256: `efd2b610d3fcec60e0b2dfded487532252468ab45dc93fbbdcae4e431f3e7888`.
- Restored PostgreSQL 16.15 / TimescaleDB 2.30.0 in a separate Docker volume, with a 4 GB memory cap, two CPUs, and a loopback-only port. Disabled restored scheduled jobs. The backup, local password and detailed manifests live under the gitignored `.local-db-rehearsal/` directory.
- Copied all 585 sensor metadata records, 17,000 historical sensor samples and 11,000 movement samples. History is still partial; do not infer complete migration from these counts.
- The first bounded scan spilled a global aggregation to disk. Replaced it with an ordered physical batch and separate locked duplicate validation. A 10,000-sample batch took approximately 16 seconds for sensors and 23 seconds for movements on this local machine.
- Found and fixed PostgreSQL's 15-significant-digit float-to-numeric rounding. `legacy_numeric` preserves the original legacy float on round-trip; it cannot recover precision lost before the original float was stored. All metadata now matches exactly.
- Normalized all seven current statistical publications into readings. All seven reconstructed JSON payloads compare equal to the originals. Their helper templates contain nulls in measurement cells and references to readings, not a second authoritative copy of values.
- Reduced the combined reconstruction time for the seven publications from approximately 7.2 seconds to 0.42 seconds by assembling records instead of rewriting the full JSON for every cell. This is a local query measurement, not a 200-client load test.
- Normalized 411 charger stations and their corresponding map features into shared scalar readings. Both reconstructed payloads match exactly; the combined read measured about 0.47 seconds locally. No occupancy observations are invented for the inventory-only source.
- Current-value readiness passes after copying the source keys referenced by 1,319 cached sensor measurements and 88 movement cache rows. The 585-row sensor-map query returns identical results in legacy/core modes; an expression index reduced canonical query time from about 1.4 seconds to 56 ms (legacy: 53 ms).
- Server-side batch loops preserve row locking and duplicate validation while reducing client round trips. Subsequent 10,000-sample batches took about 7.9 seconds for sensors and 11.3 seconds for movements. Larger bounded runs are recorded separately in the private rehearsal directory.
- A real canonical archive export excludes a deliberately conflicting legacy value and honours visibility changes. All 8 archive tests pass; the fixture now loads only archive tables on plain PostgreSQL, fixing the earlier `create_hypertable` CI error.
- A 200-request concurrent burst against the local canonical sensor-map route with a ten-connection pool completed without errors but had 12.34-second p95 latency without coalescing. Added a five-second per-process serialized snapshot cache, shared in-flight reads, ETags, and post-commit invalidation on admin metadata/visibility changes. A cold-cache repeat used one database connection request, returned all 200 responses in 0.42 seconds, with 0.40-second p95 and a successful conditional `304`. Both runs overlapped the local historical backfill. These are ASGI tests, not network/proxy/frontend or multi-worker deployment benchmarks.

Statistics retain source units/scales, original markers, cell labels and reporting periods. Annual and monthly anchors are labelled in provenance; they are not collection timestamps. Unknown missing-value markers are not automatically labelled as confidentiality suppression. Source-aware sensor classification, other inventory mappings, full-history replay, visual UI validation and production rollout remain unfinished.

## Production prerequisite

On 2026-09-30 the operator reported a 19 GB root volume with 4 GB available. The largest reported relations included 1969 MB of collected payloads and history chunks of 1302 MB, 617 MB and 551 MB. Row estimates are not exact counts, and chunk names alone do not identify their source hypertables. Do not start shadow history duplication or backfill on this disk until storage headroom has been increased and a restored-copy rehearsal has measured actual growth, WAL, memory and throughput. Do not delete old history or run disk-consuming table rewrites to make room implicitly.

Take a recoverable backup off the nearly full volume. Verify restoration on a separate database. Account for ongoing collector growth and temporary downloads. The new `capacity` command includes Timescale inheritance when sizing sensor/movement storage; its 4x source-size estimate plus 2 GiB reserve is deliberately preliminary, not a guarantee. It requires a fresh host free-space reading because SQL cannot portably report available disk space.

## Commands after a release containing these files is available

The API service already supplies database credentials. None of these commands prints passwords. Run from the Compose directory; first confirm the image contains `measurement_migration.py`. These are operator/rehearsal instructions, not evidence that production has been migrated.

Read-only inventory:

```bash
docker compose exec -T backend-api python measurement_migration.py inventory
```

Read-only preliminary capacity check (replace `4` with the actual fresh available GiB on the **database volume**, not RAM):

```bash
docker compose exec -T backend-api python measurement_migration.py capacity --available-disk-gib 4
```

Install only the additive schema:

```bash
docker compose exec -T backend-api python measurement_migration.py install
```

After backup, disk and rehearsal checks, enable atomic shadow writes. Replace `AVAILABLE_GIB` with the fresh available GiB on the database volume:

```bash
docker compose exec -T backend-api python measurement_migration.py install --shadow --available-disk-gib AVAILABLE_GIB
```

New sensor metadata/readings, movement positions and supported statistical publications then write to both stores in the same transaction. Legacy API reads remain authoritative by default. This adds write overhead and storage growth; monitor collector lag, DB CPU and free disk. An invalid core reading fails the original transaction too, so source validation and replay behavior must be rehearsed before enabling this on the VPS.

For historical copy, run one bounded command at a time. Replace `AVAILABLE_GIB` with a current numeric reading; it is intentionally not a runnable default. Start with metadata, then sensors, then movements:

```bash
docker compose exec -T backend-api python measurement_migration.py backfill metadata --batch-size 100 --max-batches 1 --available-disk-gib AVAILABLE_GIB
docker compose exec -T backend-api python measurement_migration.py backfill sensors --batch-size 1000 --max-batches 1 --available-disk-gib AVAILABLE_GIB
docker compose exec -T backend-api python measurement_migration.py backfill movements --batch-size 1000 --max-batches 1 --available-disk-gib AVAILABLE_GIB
docker compose exec -T backend-api python measurement_migration.py backfill statistics --batch-size 10 --max-batches 1 --available-disk-gib AVAILABLE_GIB
docker compose exec -T backend-api python measurement_migration.py backfill chargers --batch-size 5 --max-batches 1 --available-disk-gib AVAILABLE_GIB
```

`batch_processed` reports this invocation; `processed` is the persisted total for that family. Repeat with fresh free-space information until `caught_up` is true. A checkpoint commits with its batch. Backfill does not replace live core samples. Duplicate legacy samples with differing values stop the batch for review; they are not silently flattened. Row locks prevent selected historical samples from being concurrently corrected/deleted during their copy. An unchanged legacy sensor value already stored as a float cannot retroactively recover lost precision; new canonical writers must supply exact decimals directly.

Compare explicit time windows (substitute the actual desired interval):

```bash
docker compose exec -T backend-api python measurement_migration.py audit --start 2026-09-29T00:00:00+00:00 --end 2026-09-30T00:00:00+00:00
```

The audit uses a consistent database snapshot. `missing`, `extra`, `different`, and `conflicting_legacy` must be zero for covered scalar sensor/movement samples. Run all historical windows and recent live windows. Sensor inventory coordinates and other fields need their own contract checks; this audit does not certify their complete migration. A caught-up cursor or successful import is not proof of parity.

## Emergency pause

```bash
docker compose exec -T backend-api python measurement_migration.py disable-shadow
```

This stops additional writes and keeps both histories. With the default read mode the UI still reads legacy data. Re-enabling is deliberately refused after a pause: updates and deletions in that gap require reconciliation, including resetting/replaying appropriate checkpoints. Do not manually clear the reconciliation flag as a shortcut.

`MEASUREMENT_READ_MODE=core` selects compatibility views for migrated sensor, movement and statistics endpoints and sensor archives. API startup checks current-value parity and refuses incomplete migration. This guard does not certify historical coverage or every remaining inventory: full audits are still required. Do not activate this flag on production yet. To roll back readers during the dual-write phase, restore `MEASUREMENT_READ_MODE=legacy` and recreate the API/archive containers.

## Remaining before full cutover

### TTN interval readings

The TTN uplink writer stores each accepted observation in the canonical
`entities` / `measurement_definitions` / `readings` model. Window min, mean and
max are separate readings under one metric definition family, distinguished by
`dimensions.statistic`; `period_start` and `period_end` carry the source window.
TTN event ID and sample count are provenance. `ttn_uplink_events` remains the
idempotency ledger. During transition, `sensor_data` still receives the mean
for old readers, but new interval windows are not written to the legacy window
tables. `/telemetry/latest/window` prefers canonical readings and falls back to
the legacy window tables for historical windows.

Before deploying this writer, install the canonical measurement schema and the
`20261021_ttn_interval_statistics.sql` extension through the explicit
measurement migration command. The webhook transaction fails as a whole if
the canonical schema is unavailable; this prevents silently accepting future
TTN data only into the legacy store. The bounded `backfill ttn` family copies
legacy TTN windows first, then unwindowed TTN samples, preserving event/window
provenance where available. Conflicting legacy values stop the batch. Use the
normal fresh-disk capacity gate and audit the resulting interval before
retiring either legacy window table.

Example bounded invocation (repeat with a fresh free-space reading until the
result reports `caught_up: true`):

```bash
docker compose exec -T backend-api python measurement_migration.py backfill ttn \
  --batch-size 250 --max-batches 4 --available-disk-gib AVAILABLE_GIB
```

### Local rehearsal checkpoint, 2026-10-01

The restored production copy now has exact JSON parity for both gauge publications
(`environment/flood/gauges` and `map/layers/floods`). Gauge coordinates are separate
scalar readings; water levels preserve the provider's datum without inventing NHN.
The movement backfill has processed 131,000 source positions and is not complete.
The sensor checkpoint has processed 4,046,646 keys through September 25, 20:20 UTC;
it is also incomplete. After reconciliation, the 07:00–08:00 UTC audit matched all
16,426 sensor keys and 2,642 movement positions, with zero missing, extra or
different values, zero unexplained conflicts and one verified correction.

The sensor backfill intentionally stopped at conflicting historical weather values.
At 2026-09-25 07:15 UTC, archived successful provider responses reported humidity
92% at receipt times 07:18 and 07:23, then 90% at 07:28. Selecting MIN/MAX or physical
row order would lose the correction history. The new `weather` backfill family
replays successful archived responses using verified payload checksums, exact
decimal values, provider valid time and actual receipt time. All 1,439 receipts in
the local backup were replayed; the canonical model stream holds 90% and retains
the earlier values and source receipt provenance in `reading_revisions`. A model
issue time is left unknown because the response does not supply one.

This is an additive source-aware stream, not yet a replacement for the generic
legacy sensor compatibility stream. Evidence-backed reconciliation now verifies
that every distinct legacy value exists in the canonical weather stream or its
revision history and is linked to an archived provider receipt. Only then does it
update the compatibility stream to the latest provider correction. Unexplained
values still abort the batch. The local historical migration has resumed beyond
the first conflicting weather key. No production state changed.

The environment collector supports `MEASUREMENT_WEATHER_WRITE_MODE=dual` after
schema installation and historical weather replay. This writes verified archived
weather responses to the model stream before legacy writes, in one transaction.
Acquisition carries its exact receipt ID to persistence; a missing or mismatched
receipt aborts the cycle. Retrying an older response cannot regress the latest
value. Keep the default `legacy` mode on production until rehearsal and deployment
gates pass. This flag controls weather only, not every collector's migration.

The sensor audit reports `reconciled_legacy` separately for evidence-backed
corrections; `conflicting_legacy` counts only unexplained conflicting keys. The
expected current value for a verified correction comes from the source-aware
model stream, while all preceding source revisions remain retained.

The `gauges` and `weather` families use the same bounded, transactional checkpoint
mechanism as other families. Missing archived weather bodies, unexpected units,
invalid values or checksum mismatches abort their batch instead of skipping data.

### Outstanding work

- Complete source/metric/period classification. The sensor bridge labels legacy basis/semantics `unknown`; it must not label weather-model data as observed GPS or sensor measurements.
- Map all numeric registry/statistics fields and publication completeness/expiry into canonical readings and helper manifests, preserving source years, units, suppression and financial precision.
- Replace compatibility bridges with source-aware canonical writes and migrate all other active ingestion/admin paths.
- Update and compare API readers, source visibility/deletion semantics, latest-position validity, archives and frontend contracts. No frontend redesign is part of this migration.
- Rehearse actual production-scale backfill, 200-client cached reads, restore and rollback on a disk with sufficient room.
- Retain legacy tables until parity and an observation window pass; destructive retirement is a later reviewed operation.
