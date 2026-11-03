# Storage consolidation into the three measurement tables

## Accepted contract

`entities`, `measurement_definitions`, `readings` are the authoritative storage
for all suitable measured, reported, simulated and scheduled numeric data.
An observation has one current accepted value per definition and original time.
Corrections replace that value; neither the old value nor a per-value processing
or receipt trail is retained. Source, basis, units, dimensions and semantics belong
to the definition once, because they distinguish otherwise different quantities.
Different physical sensors and different simulation runs are not duplicate values.
Original timestamps and accepted numeric values must not change during migration.

Operational state and genuinely different products (geometries, calendar entries,
served raster files, archive catalogue) are allowed outside the core. They must
not create unlimited copies of numerical observations or publication histories.
Caches and retry receipts have explicit expiry. Existing monthly Parquet files
remain available; subsequent exports use the authoritative core only.

## Step 1 — inventory and baseline

- Record live relation sizes, active writers/readers, schema triggers and runtime
  cutover flags; inspect historical migration gaps rather than assume completion.
- Classify every large store: measurement history, repeated publication, runtime
  cache, file product, or configuration. Inventory JSON fields used by consumers.
- Save archive catalogue and representative API responses, counts and bounds.
- Locate existing backups and preserve rollback material outside the live DB;
  do not make another permanent in-database audit copy.

## Step 2 — stop amplification

- Replace revision-producing validation with bounds/identity validation only.
- Keep compatible write function signatures during rollout, but discard per-value
  receipt/provenance JSON and stop incrementing historical revision counters.
- Preserve only application-required domain context until it has moved into the
  entity/definition or a bounded current cache; do not erase fields still read.
- Stop inserting complete `collected_dataset_versions` publications. Continue
  replacing the current normalized publication for non-core API consumers.
- Add seven-day expiry for operational retry receipts and acquisition logs.
  Replays after expiry remain safe through unique canonical observation keys.

## Step 3 — complete core coverage

- Transfer sensor history in bounded transactions, resolving known mappings to
  existing native definitions before creating any missing definitions.
- Collapse exact duplicates only. Never merge separate physical sensor channels,
  units, sources, model bases or timestamps. Unexpected conflicting values stop
  the affected transfer; use the authoritative accepted native row where present.
- Transfer any missing movement history and numeric publication history before
  removing their duplicate stores. Preserve nonnumeric functional content in the
  entity or the current product as appropriate.
- Verify coverage by keys and exact values, not counts alone. Check hidden data
  as well as public data.

## Step 4 — canonical ingestion and reads

- Change all active sensor ingestion paths (HTTP, Shake, fuel, Nextbike, weather,
  radar/lightning, Smart City, RAST, UBA, openSenseMap, TTN and civic aggregates)
  to canonical writes. Eliminate compatibility observation copies and repairs.
- Reconstruct API compatibility shapes using views/queries over the core; views
  do not store a second copy. Keep source-specific field names where clients need
  them. Current-value indexes/caches must be justified and bounded.
- Switch APIs and archive generation to canonical reads. Remove legacy archive
  union/backfill paths so they cannot recreate duplicate definitions.
- Keep deployment order explicit: additive helpers first, compatible services,
  coverage verification, then destructive retirement.

## Step 5 — remove retired storage

- After successful coverage and consumer checks, remove physical `sensor_data`,
  duplicate movement history, revision/repair histories and publication versions.
- Remove obsolete per-reading provenance, unnecessary receipt dependencies and
  redundant indexes only after their consumers have been changed.
- Retain useful source configuration and a small bounded operational error/status
  window. Preserve actual downloadable raster/tile assets and monthly archives.
- Ensure bootstrap and later migrations cannot recreate retired physical stores.

## Step 6 — checks and publication

- Add migration and ingestion integration tests for replacement, invalid values,
  retries after receipt expiry, native-channel preservation and no audit growth.
- Run affected API/collector/archive tests, relevant lint and builds. Check public
  charts, maps, source status, raster downloads and monthly download catalogue.
- Commit only task changes, push, follow CI for that exact commit, and require
  all planned GHCR builds/publications to succeed.

## Step 7 — production rollout and reclaim

- Deploy exact published images in the configured Compose overlay order.
- Apply compatible schema changes before restarting writers. Pause affected
  writers for final verification and table retirement, then resume them.
- Reclaim obsolete physical storage with space-aware maintenance; do not rewrite
  the entire large readings table blindly. Measure disk/WAL headroom per step.
- Verify new collection cycles update the core without reintroducing histories,
  retain API/download availability, and report before/after sizes and free disk.

## Progress

- Initial repository status clean. Live schema has no sensor/movement shadow
  triggers: full core coverage must be proved before dropping either history.
- Live publication versions are dominated by events (~1.35 GiB JSON), waste
  calendar (~1.13 GiB) and coverage (~286 MiB), not numeric measurements alone.
- The first release passed all 18 CI jobs including TimescaleDB compression checks
  and every planned GHCR publication (commit `b727e83`). Historical transfer is
  gated by exact coverage checks before any physical legacy table is removed.

## Operational commands (exact committed code only)

1. Deploy the compatible API, registry, archive, environment, UBA and openSenseMap
   images first. Their capability probes also work before helper installation.
2. Mount this commit's script and SQL directory into the API environment; run
   `consolidate_core_storage.py --install`, then `--publications --transfer`.
   Transfer is resumable and can run while collectors continue acquisition.
3. Pause affected writers for the final catch-up and verified `--retire` command.
   The command verifies coverage again and holds an exclusive retirement lock.
4. Resume collection, then run `--deduplicate --maintain --compact --compress`.
   Current chunk pages are reclaimed for reuse without a long exclusive rewrite;
   old chunks are compressed losslessly and gain a seven-day compression policy.
5. Verify the exact images, real ingestion cycles, API results and archive catalogue.
   Record actual size/free-space measurements only after maintenance completes.

Current-value caches have one row per key or one current publication per dataset.
They support existing UI shapes; numeric historical authority is the core. File
products and geometric/calendar objects are not flattened into artificial scalar
measurements. Empty compatibility views for retired audit names store zero rows.

## Response-derived definition cleanup

A response SHA must not create a new measurement definition for the same quantity.
The snapshot-aware API/registry release precedes `normalize_snapshot_identity.py
--apply`. This merges definitions that differ only by `snapshot_sha256`, retaining
the most recently accepted value per original time. Equally recent disagreements
stop that group for review. Units, source, observation basis, actual forecast issue
times, resolution and physical sensor dimensions remain distinct.

Current pollen, discharge, energy and GBIF result sets use a bounded membership
index containing only measurement keys. Earlier accepted values stay in `readings`;
no JSON response or historical snapshot copy is needed. Superseded memberships
expire after seven days; one current set is retained per source. This normalization
must precede physical compaction/compression so obsolete copies are not compressed.

After deploying the snapshot-aware release, apply its updated helper migration
with `--install`, complete transfer/retirement, run snapshot normalization, then
run `--deduplicate --maintain --compact --compress`. Existing archive URLs remain
available throughout; any refreshed month uses only accepted canonical readings.

## Current-value index

`--heads` replaces the physical `latest_readings` value copy with a read-only view
joining the core to a small key-only index (`measurement_heads`). Corrections are
visible immediately from the original row. There is no second numeric/provenance
copy. The legacy UI cache gets a refresh timestamp and expires after seven days.
Apply `--heads` after retirement and before snapshot normalization. Withdrawal
paths delete from `readings`; its trigger maintains the key index atomically.

## Coverage refinements

Movement verification includes all ten scalar quantities, including AIS heading
and navigational status, before context retirement. Current entity descriptions
exclude dynamic numeric fields and receipt hashes. Static inventory coordinates
reuse their original reference observation while unchanged; actual position
observations keep every original timestamp. Large inventory recursion passes a
small context record instead of copying the full source JSON at each node.

`--traffic` transfers corridor status, incident counts and reported extent into
the same core, verifies exact historical coverage and replaces the physical
corridor snapshot table with a writable compatibility view. Unknown delay
semantics never manufacture an accepted delay measurement. Online backfill
precedes the final lock and delta verification.

Historical bulk transfer validates scalar bounds as a batch and updates current
keys once per definition. It suppresses per-row side effects only inside its own
explicit maintenance transaction, never in collector sessions. Coverage checks
still compare every copied key/value before retirement. One-hour occupied
windows bound each transaction. TTN retry receipts expire after seven days;
interval buffers expire only once every min/mean/max statistic, interval and
sample count is present exactly in the core.

## Unresolvable November weather conflicts

The transfer gate found nine legacy weather quantity/time keys on 1 November
without a native accepted value; their original HTTP responses no longer exist.
`quarantine_ambiguous_weather.py --apply` secures only such unresolved keys in
an external PostgreSQL binary COPY gzip file with a checksum/restore manifest.
It restores that exact file into a temporary table and compares both row multisets
before removing the unresolved rows from the live legacy store. It never guesses
a value or removes an already accepted native observation. No persistent
in-database quarantine/history is created for this cleanup.

Invalid inputs are discarded by the canonical row trigger, including direct SQL
writes. They cannot create invalid placeholders or replace an existing valid
observation with NULL. Missing/suppressed source indicators remain distinct from
invalid inputs; the migration does not invent numerical values for them.

Cache expiry proves coverage for at most 5,000 candidates in one occupied hour.
It materializes only the matching native quantities and bounded reading interval,
rather than sorting the entire historical reading set. Nextbike retains at most
the latest cache row per key even when that station stopped updating. Uncovered
cache values are retained for review. Batch counters keep explicit maintenance
running until all eligible verified caches have been processed.

Snapshot identity normalization retires old latest-key entries only after its
accepted-value copy passes verification, in the same transaction. This avoids
repeated full-history head searches for identities being deliberately retired.
The target key and all accepted observations remain present throughout commit.
The publication-cell foreign key has a measurement-key index so retiring old
definitions does not repeatedly scan the complete current publication layout.

## Bounded full-history proof

Movement transaction windows adapt to the actual scalar count (90,000 target,
100,000 hard insertion limit). Every original row/time remains covered. Proofs
map each definition once and compare all numeric keys/values with a bounded
hash anti join. The maintenance connection uses exact shortest-decimal float
conversion with `extra_float_digits=3`; tests cover a caller using the shorter
client format and confirm the original setting is restored.

Retirement holds a source write lock while validating all occupied bounded
windows in one transaction. Reads remain available during verification. The
final DROP upgrades that lock only after all windows pass. No single proof
materializes the entire multi-gigabyte movement or core history. A failed check
rolls back the complete retirement and preserves the old physical stores.

Sensor copy and verification share one repeatable-read transaction. The final
write-locked proof also copies any unambiguous late arrivals behind a saved
checkpoint; already accepted conflicting values still stop retirement. Temporary
transfer tables are dropped after each batch, including inside the final outer
transaction. Re-running transfer after cutover is a no-op. Tests simulate late
sensor and movement rows in multiple windows and confirm full recovery.

An old movement cache may retain a value already corrected in the accepted core.
The migration proof permits that difference only when the existing revision for
the exact definition/time contains the exact valid old value and predates the
current accepted collection time. It never overwrites the current observation.
Unexplained differences still abort retirement. This uses the old revision table
only during migration; retirement removes that table and creates no new history.
