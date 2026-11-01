# Public monthly Parquet archives

The worker exports all public sources together as a monthly snapshot of three
tables: `entities`, `measurement_definitions`, and `readings`. Observations and
simulations keep their stored source, basis, values and original timestamps.
There is no time alignment, interpolation, resampling or additional labelling.
The existing public-data visibility rules still apply.

Each ZIP contains the three Parquet tables, `manifest.json` and `README.txt`.
Large months have several numbered ZIP parts. Download all parts for the full
month; merge entities and definitions by `id`. Every part is referentially
complete. Format version 4 publishes **only Parquet**, without CSV copies,
day packages or on-demand monthly CSV generation. Existing older catalogues are
rebuilt automatically and replaced only after their new files are uploaded.

IDs and exact decimal values are strings to avoid precision loss. Timestamps
retain UTC microseconds. Structured fields remain JSON text. Unknown original
receipt times remain null; metadata reflects export time. Hourly repeatable-read
snapshots release database locks regularly; late corrections may require refresh.
When refreshing or upgrading small existing snapshots, the worker discovers all
currently populated hours first and skips empty hours. New or dense months retain
the full hourly scan. Data arriving after hour discovery can require a refresh.

## Data quality

Unresolved legacy conflicts stop publication. The worker never chooses an
arbitrary value or creates an extra conflict table. Repair the source data first.
Verified provider corrections remain in the canonical revision history and the
archived provider responses. The operational `clean_weather_legacy` routine
preserves the old compatibility rows in `weather_legacy_repairs` before replacing
them with the receipt-backed current model value. Incorrectly dated TTN gateway
statuses are handled by the explicit, separately backed-up procedure in
[`../ttnmapper-collector/README.md`](../ttnmapper-collector/README.md).

The worker prepares missing legacy entity/measurement definitions and streams
missing legacy history without copying it all into canonical storage. Current
canonical values take precedence for the same definition and timestamp. It does
not enable shadow writes or change API read mode.

## Deployment

1. Deploy the API catalogue schema and measurement migrations first, including
   `20261101_weather_legacy_cleanup.sql`. Complete source-data repairs before
   publishing a new archive.
2. Configure a dedicated UploadThing app with **Allow Overriding ACL**, and set
   `UPLOADTHING_TOKEN` in the VPS Compose environment. The token stays server-side.
3. Wait for CI and GHCR publication for the exact pushed commit, then pull and
   recreate the service from the VPS Compose directory:

   ```sh
   docker compose --profile archives pull archive-worker
   docker compose --profile archives run --rm archive-worker node worker.mjs
   docker compose --profile archives up -d archive-worker
   docker compose logs --tail=50 archive-worker
   docker compose exec archive-worker cat /data/status.json
   curl --fail https://hack-the-ried.duckdns.org/api/v1/archives
   ```

Watchtower only monitors images; image publication does not deploy this service.
Confirm that the latest closed month is published and every nonempty catalogue
entry has only `parquet` files. A running container alone is not evidence of a
successful export. The Daten page links to the UploadThing files directly.

The worker runs on startup and every 24 hours, retries failures with backoff,
and uses a PostgreSQL advisory lock to prevent overlapping exports. It backfills
closed months from the earliest public data. No external scheduler is needed.
Empty months have no files. One-shot failures exit nonzero; watch mode retains
failure state and retries. The API serves `GET /api/v1/archives`.

## Resources and recovery

`ARCHIVE_PART_MB=64` controls the approximate uncompressed JSON input per part
(1–256 MiB). Metadata is written once per part, not once per reading. Temporary
disk holds one part's input, Parquet tables and ZIP. Each completed part is
uploaded immediately and its local files removed. The catalogue is updated only
after the entire month succeeds. Incomplete uploads and replaced files enter a
persistent cleanup queue; cleanup uses batches of at most 100 keys.

Memory is bounded by cursor batches, one part's metadata and Parquet row groups.
The image includes Python and PyArrow; the SDK uploads disk-backed Blobs. Do not
run this exporter in a serverless request. A crash between upload and publication
can leave orphan files: inspect the dedicated UploadThing app before removing any.

Refresh a month after late ingestion or correction:

```sh
docker compose --profile archives run --rm archive-worker node worker.mjs --month 2026-10 --refresh
```

An explicit current-month snapshot is labelled incomplete and replaced after
month end. Completed unchanged months are skipped. Visibility changes invalidate
existing catalogue entries; remote cleanup cannot recall downloaded copies.

## Tests and bulk downloads

```sh
npm ci
npm test
# Use an explicitly isolated PostgreSQL database for integration tests:
# ARCHIVE_TEST_DATABASE_URL=postgresql://user:password@localhost/testdb npm test
```

Tests use PyArrow round trips to check exact numeric values, original text,
microsecond timestamps, table references, checksums, cleanup and conflict failure.
`storage.mjs` exposes `upload(file)` and `remove(keys)` for a future storage adapter.

The frontend's `public/downloads/download_archives.py` downloads Parquet archives
with Python's standard library. Use `--month YYYY-MM`, `--year YYYY`, or no filter
for all archives. It verifies size and SHA-256, skips verified files and preserves
the catalogue used. ZIPs are not automatically extracted.
