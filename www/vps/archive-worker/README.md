# Public monthly archives

The opt-in Node 22 worker exports **all public canonical measurements**, bypassing the
interactive API's 5,000-row cap. It streams a repeatable-read PostgreSQL snapshot
to CSV parts (64 MiB uncompressed by default), compresses each into a ZIP, uploads
to UploadThing and atomically publishes the month's catalogue record. No
measurements are truncated. The API serves `GET /api/v1/archives`; the Daten page
lists every part and a Python script downloads whole years or the entire archive.

## Activate on the VPS

1. Deploy/restart the updated backend API first. Its idempotent schema migration
   creates `data_archives` in the existing database.
2. Create a dedicated UploadThing app. Enable **Allow Overriding ACL** so the
   worker can explicitly upload `public-read` files. Confirm the account's storage
   allowance and file limits for ZIP downloads. No browser upload route is needed.
3. Copy the archive settings from [`../.env.example`](../.env.example) into the
   VPS Compose `.env` and set `UPLOADTHING_TOKEN=...` (never commit it). The
   token belongs only to the worker, not the frontend or any public environment.
   Optionally set `ARCHIVE_PART_MB=64` (1–256 MiB). This is the approximate maximum
   CSV size per ZIP; metadata and ZIP overhead add a little to the final file.
4. After pushing the changes to `main`, wait for the GHCR build to succeed.
   Copy the updated `docker-compose.yml` to the VPS. From the directory containing
   that file (for example `/home/ubuntu/my-app`), run:

   ```sh
   docker compose --profile archives pull backend-api archive-worker
   docker compose up -d backend-api
   docker compose --profile archives run --rm archive-worker node worker.mjs
   docker compose --profile archives up -d archive-worker
   docker compose logs -f archive-worker
   ```

The first run backfills closed months from the earliest public reading. The
service checks on startup and every 24 hours for missing closed months. Failed
runs retry on the next check; a PostgreSQL advisory lock prevents overlapping
workers. The current month is normally left to the live API. No external
scheduler or AWS account is necessary. The service is opt-in and uses
`ghcr.io/erik-metz/hack-the-ried-archive-worker:latest`, built by GitHub Actions
after the validation jobs pass. No source folder or Docker build tools are
needed on the VPS. Once started, the existing Watchtower service monitors and
updates it like the other GHCR services. If the new GHCR package is private,
make it public or configure the same registry credentials used for the other
services before pulling it.

## Refreshes and current-month snapshots

Closed archives are snapshots, not promises that no late data will arrive.
Refresh a month after late ingestion, corrections, or a change in public data:

```sh
docker compose --profile archives run --rm archive-worker node worker.mjs --month 2026-09 --refresh
```

An explicit current month export is allowed and labelled incomplete. It is
replaced by a full-month snapshot on the automatic run after month end. Completed
months are otherwise skipped, avoiding repeated uploads and maintaining stable
hackathon snapshots. A refresh publishes the new set before removing the old
remote files. Previously downloaded copies remain usable; their saved checksums
and catalogue identify their version.

Snapshots containing a now-hidden or deleted station are immediately excluded
from the catalogue. On the next worker run their remote files are deleted and
closed months are rebuilt from the remaining public stations. Already shared
public URLs may remain usable until deletion/CDN expiry; downloaded copies cannot
be recalled. Hiding a station is not retroactive revocation of published data.

## Contents and resources

Every ZIP contains `entities.csv`, `measurement_definitions.csv`, `readings.csv`,
`manifest.json`, and `README.txt` (format version 2). Each part includes exactly
the entities and definitions referenced by its readings. Metadata may repeat
across parts; merge it by `id`. Numeric values and bigint IDs are retained as
exact strings during export; timestamps retain microseconds. Structured fields
are JSON in CSV cells. Metadata reflects export time, not historical versions.
Sources/licences follow `source_id` and the project source catalogue.

Before taking the read snapshot, the worker transactionally inserts missing
public legacy telemetry for the period into the canonical tables. It never
overwrites existing canonical readings and does not enable shadow writes or
change API read mode. Legacy source/basis uncertainty is explicitly retained.
Identical legacy duplicates collapse to one canonical key; conflicting duplicates
fail the period instead of inventing a value. No production history is deleted.

Deploy the updated backend first: its idempotent schema adds `format_version`
and `entity_ids` to the archive catalogue. The worker automatically regenerates
all format-1 catalogue entries, including empty months, and discovers closed
months from both public canonical and legacy history. New files are fully
uploaded and published before old files are queued for deletion. Both entity and
legacy sensor visibility are checked at export, publication and catalogue read.

Temporary disk must accommodate approximately one month's CSV plus compressed
ZIPs. Memory is bounded by cursor batches, stream buffers, metadata, and SDK
upload buffering. Files are uploaded one at a time using disk-backed Blobs;
archives are served directly by UploadThing, never proxied through Next.js.
If a monthly export is too large for the VPS disk, provision more temporary disk
before running it. Do not use a serverless request to run this worker.

The read transaction lasts for CSV/ZIP generation; publication/uploads happen
after it ends. Plan large backfills for low-traffic periods. Long-lived database
snapshots can delay vacuum cleanup. An empty month is recorded with zero files.
A crash after uploading but before publishing, or a failed old-file deletion,
can leave unreferenced files in UploadThing; inspect the dedicated app for these
before deleting anything. Catalogue entries only refer to fully uploaded sets.
The worker exits nonzero on one-shot failure; watch mode logs failure and retries.

## Storage abstraction and testing

`storage.mjs` implements only `upload(file)` and `remove(keys)`. Replace that
adapter for S3 later; the export layout and catalogue need not change.

```sh
npm ci
npm test
# Optional isolated PostgreSQL integration test:
# ARCHIVE_TEST_DATABASE_URL=postgresql://user:password@localhost/testdb npm test
```

The frontend's `public/downloads/download_archives.py` uses only Python's standard
library. `--year YYYY` selects a year; omitting it downloads every published part.
Checksums are verified before replacing existing files. Reruns skip verified
files and retry interrupted files from their start; ZIPs are not auto-extracted.

The dependency override for `effect` keeps the UploadThing SDK on a patched
3.x release (GHSA-38f7-945m-qr2g). The SDK upload/delete test covers this combination.

## Collector operational conventions

Watch-mode status, retry scheduling, the persistent cleanup queue and deployment order are documented in [collector maintenance](../collectors.md#archive-worker). Apply the updated API schema before running this version.
