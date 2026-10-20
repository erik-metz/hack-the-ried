# Deploying the collector refactor to an existing VPS

This guide assumes your existing Docker Compose stack is already running and you are deploying the collector refactor, not provisioning a new server. Commands run on the VPS in the directory containing its active `docker-compose.yml` and `.env`, except the GitHub publishing step.

Allow a maintenance window: the API and collectors will stop briefly, and the database will be recreated with the same image and volume to install its new healthcheck. Incoming API requests will be unavailable during that interval. Source backfill is provider-dependent; do not assume every missed reading can be recovered.

The order is: pause automatic updates → preserve rollback images → publish/pull images → stop writers and back up → update Compose → database readiness → schema migration → API → collectors → optional archives.

## 1. Establish the existing project and pause Watchtower

Use the existing deployment directory. Do not create a new Compose project: that can select new empty volumes instead of your existing data.

```bash
docker compose version
docker compose ps -a
docker inspect timescaledb --format '{{index .Config.Labels "com.docker.compose.project"}}'
```

Keep using the same directory and any existing `-p`, `--env-file`, or override-file options throughout. The commands below assume your existing deployment uses plain `docker compose`.

Pause Watchtower **before publishing the new images**. This change needs updated mounts/environment settings and ordered schema deployment; an automatic image replacement alone is insufficient.

```bash
docker compose stop watchtower
```

If CI has already published images, first inspect the currently running images and logs to establish which services have already changed.

## 2. Save configuration and retain the running images

These commands assume Bash and should run in the same shell session for the rest of the guide.

```bash
umask 077
BACKUP_DIR="$PWD/deploy-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml"
cp .env "$BACKUP_DIR/.env"
cp nginx.conf "$BACKUP_DIR/nginx.conf"
printf '%s\n' "$BACKUP_DIR"
```

Keep this directory private: `.env` contains credentials. Copy any deployment-specific Compose override files too.

Preserve each existing service image under a local rollback tag **before pulling `latest`**:

```bash
for service in backend-api shake-collector smartcity-collector nextbike-collector traffic-collector environment-collector registry-sync-worker archive-worker; do
  container_id=$(docker compose --profile archives ps -a -q "$service")
  if [ -n "$container_id" ]; then
    image_id=$(docker inspect --format '{{.Image}}' "$container_id")
    docker image tag "$image_id" "local/ried-rollback-$service:before-refactor"
  fi
done
```

Omit service names absent from your old Compose file. Do not prune images during this deployment.

Pin the exact running database image for the healthcheck recreation below. This rollout does not upgrade PostgreSQL or TimescaleDB:

```bash
DB_IMAGE_ID=$(docker inspect --format '{{.Image}}' timescaledb)
docker image tag "$DB_IMAGE_ID" local/ried-db:before-refactor
cat > compose.db-pinned.yml <<'YAML'
services:
  timescaledb:
    image: local/ried-db:before-refactor
YAML
```

Record the current database volume so you can verify it after recreation:

```bash
docker inspect timescaledb --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}' \
  > "$BACKUP_DIR/database-mounts.txt"
cat "$BACKUP_DIR/database-mounts.txt"
```

## 3. Publish the correct images

On your development machine, commit and push the intended changes through your normal review process, including the CI import-path fix. The current workflow publishes images on a successful push to `main`; a pull request alone does not publish them.

Wait for the entire image build/push job to finish, not merely the API image step. It publishes these separate images:

- `ghcr.io/erik-metz/open-ried-sens-api:latest`
- `ghcr.io/erik-metz/open-ried-sens-shake-collector:latest`
- `ghcr.io/erik-metz/open-ried-sens-smartcity-collector:latest`
- `ghcr.io/erik-metz/open-ried-sens-nextbike-collector:latest`
- `ghcr.io/erik-metz/open-ried-sens-traffic-collector:latest`
- `ghcr.io/erik-metz/open-ried-sens-environment-collector:latest`
- `ghcr.io/erik-metz/open-ried-sens-registry-sync-worker:latest`
- `ghcr.io/erik-metz/open-ried-sens-archive-worker:latest`

Compose references the `erik-metz` namespace. If deploying from a fork, the workflow publishes under the fork owner's namespace; update Compose accordingly.

The CI workflow currently uses mutable `latest` tags. Avoid overlapping deployments/publishing runs. If your GHCR packages require authentication, authenticate on the VPS before pulling.

From the existing VPS Compose directory:

```bash
docker compose pull backend-api shake-collector smartcity-collector nextbike-collector traffic-collector environment-collector registry-sync-worker
```

If using archives:

```bash
docker compose --profile archives pull archive-worker
```

Pull only application services. Do not run a blanket `docker compose pull`, which would also pull unrelated infrastructure images. Nextbike and Traffic have `build:` sections; use the published images consistently rather than accidentally building old source on the VPS.

## 4. Stop writers and back up PostgreSQL and state

```bash
docker compose stop -t 60 shake-collector smartcity-collector nextbike-collector traffic-collector
```

If running archives, stop it too; preferably let its current export finish first:

```bash
docker compose --profile archives stop -t 60 archive-worker
```

Stop the API for a consistent maintenance cutoff. Leave the database running for the backup:

```bash
docker compose stop -t 60 backend-api
docker compose exec -T timescaledb sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP_DIR/database.dump"
```

**Check that the dump command exited successfully before continuing.** Verify the file is nonempty and its archive catalogue is readable:

```bash
test -s "$BACKUP_DIR/database.dump"
docker compose exec -T timescaledb pg_restore --list \
  < "$BACKUP_DIR/database.dump" > "$BACKUP_DIR/database.contents.txt"
head -20 "$BACKUP_DIR/database.contents.txt"
```

This checks archive readability, not a full restore. Retain your normal tested TimescaleDB backup/restore procedure; this rollout does not require restoring or deleting the database.

If existing collectors already have `/data` state, copy it from their stopped containers:

```bash
for service in shake-collector smartcity-collector nextbike-collector traffic-collector archive-worker; do
  container_id=$(docker compose --profile archives ps -a -q "$service")
  if [ -n "$container_id" ]; then
    mkdir -p "$BACKUP_DIR/$service-state"
    docker cp "$container_id:/data/." "$BACKUP_DIR/$service-state/"
  fi
done
```

Older Shake/archive images may have no `/data`; that specific missing-directory error is expected for a first upgrade. Other copy failures should be investigated. On subsequent deployments, Shake's spool must be preserved because it contains pending batches and replay cursors.

## 5. Install the updated deployment configuration

Update the existing VPS checkout to the intended release commit, or copy the new `www/vps/docker-compose.yml` and required deployment files into the existing deployment directory. Keep the original `.env`, certificates, database volume and Compose project name.

Do not replace production `.env` with `.env.example`.

Review these settings in your existing `.env`:

```dotenv
# Keep your existing database credentials and two distinct API keys.

SHAKE_INGEST_MODE=direct_db
SHAKE_SAMPLING_INTERVAL_SEC=5.0
SHAKE_STORE_RAW_WAVEFORM=false

NEXTBIKE_CITY_IDS=559
NEXTBIKE_POLL_SECONDS=60

TRAFFIC_ROADS=A67,A5,A6
TRAFFIC_POLL_SECONDS=180

SMARTCITY_POLL_SECONDS=60
```

Keep your intended station list and Smart City dashboard/filter settings. Direct database ingestion is the new default; API ingestion remains supported with `SHAKE_INGEST_MODE=api`. The existing example file selects API mode explicitly, so check your actual setting.

Nextbike city IDs must be valid positive IDs. Collecting all cities requires the explicit value `all`; a blank or misspelled filter is not accepted.

Only environment variables forwarded in Compose reach the containers. Advanced settings such as `SHAKE_QUEUE_BATCHES` or `SHAKE_LATENESS_SECONDS` require adding matching `environment:` entries or a Compose override; adding them to `.env` alone does not forward them.

Validate without printing expanded secrets:

```bash
docker compose -f docker-compose.yml -f compose.db-pinned.yml config --quiet
```

## 6. Activate the database healthcheck with the existing image and volume

The updated Compose file waits for `timescaledb` to be healthy. An old container without the new healthcheck needs recreation, even if its image did not change.

```bash
docker compose -f docker-compose.yml -f compose.db-pinned.yml \
  up -d --no-deps --no-build --pull never --force-recreate \
  --wait --wait-timeout 120 timescaledb
```

Verify the database mount is the same as recorded earlier:

```bash
docker inspect timescaledb --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
docker compose exec -T timescaledb sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), version();"'
```

If the database is unexpectedly empty or the mount changed, stop here and correct the project/volume selection. Do not initialize a replacement database or continue migrating the wrong volume.

Keep `compose.db-pinned.yml` until you deliberately plan a database image update. The remaining commands use `--no-deps` to avoid incidental database recreation.

## 7. Apply the schema before starting collectors

Check that the pulled API image includes the new migration command:

```bash
docker compose run --rm --no-deps backend-api \
  python -c 'from pathlib import Path; assert Path("migrate.py").is_file(); print("Migration command available")'
```

Apply it using the container's configured database credentials:

```bash
docker compose run --rm --no-deps backend-api python migrate.py
```

Continue only if it exits successfully. The command applies the repository's idempotent schema in a transaction. Verify the version marker:

```bash
docker compose exec -T timescaledb sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version, applied_at FROM collector_schema_versions WHERE version=20260916;"'
```

Expected: one row containing `20260916`.

The refactor adds replay receipts, bike freshness/evidence, traffic provenance and archive cleanup tracking. The migration command also runs the rest of the existing `schema.sql`; review it if this database has diverged from the repository schema.

If `migrate.py` is missing, you pulled an old/wrong API image. If migration fails, leave collectors stopped, read the error, and fix it before continuing.

## 8. Prepare state-volume permissions

The Python collectors now run as UID 10001. The old Traffic container ran as root, so its existing state volume may otherwise prevent writing health status. With collectors still stopped:

```bash
for service in shake-collector smartcity-collector nextbike-collector traffic-collector; do
  docker compose run --rm --no-deps --user root --entrypoint sh "$service" \
    -c 'mkdir -p /data && chown -R 10001:10001 /data'
done
```

These commands affect only the collector state volumes, not the database volume. For archives, the image uses the `node` account:

```bash
docker compose --profile archives run --rm --no-deps --user root --entrypoint sh archive-worker \
  -c 'mkdir -p /data && chown -R node:node /data'
```

Run the archive command only if enabling archives.

## 9. Start and verify the API

```bash
docker compose up -d --no-deps --no-build --pull never \
  --wait --wait-timeout 180 backend-api
docker compose logs --tail=100 backend-api
```

Verify internal readiness:

```bash
docker compose exec -T backend-api python -c \
  'import urllib.request; print(urllib.request.urlopen("http://localhost:8080/health", timeout=10).read().decode())'
```

Expected: `{"status":"healthy"}`.

Verify the public route using your deployment hostname. The repository's nginx configuration uses:

```bash
curl --fail --show-error https://open-ried-sens.duckdns.org/health
```

If internal health works but nginx returns 502, inspect its logs and reload nginx after validating its configuration:

```bash
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
```

Do not expose port 8080 or PostgreSQL publicly to work around a proxy problem.

## 10. Smoke-test and start collectors

Optional live dry runs validate acquisition and parsing without changing the database or state files:

```bash
docker compose run --rm --no-deps smartcity-collector python main.py --dry-run
docker compose run --rm --no-deps nextbike-collector python main.py --dry-run
docker compose run --rm --no-deps traffic-collector python main.py --dry-run
```

Traffic requires all configured source endpoints to succeed. Investigate errors rather than treating an empty/failed fetch as a successful rollout.

Start the pollers:

```bash
docker compose up -d --no-deps --no-build --pull never \
  --wait --wait-timeout 240 smartcity-collector nextbike-collector traffic-collector
```

Start Shake separately:

```bash
docker compose up -d --no-deps --no-build --pull never \
  --wait --wait-timeout 300 shake-collector
```

Shake checks every configured station. An unavailable station can keep its overall healthcheck unhealthy while other stations collect normally; inspect the per-station status and logs. Do not run a second live Shake process against the same state volume as a “test.”

Inspect results:

```bash
docker compose ps
docker compose logs --since=10m --tail=150 \
  smartcity-collector nextbike-collector traffic-collector shake-collector
```

Poller status:

```bash
for service in smartcity-collector nextbike-collector traffic-collector; do
  docker compose exec -T "$service" python -m json.tool /data/status.json
done
```

Shake status:

```bash
docker compose exec -T shake-collector python -c \
  'from pathlib import Path; print("\n".join(f"{p.parent.name}: {p.read_text()}" for p in sorted(Path("/data").glob("*/status.json"))))'
```

Check advancing `last_success` times, low/reset `consecutive_failures`, realistic accepted counts and source coverage. Smart City data can legitimately be older than its last successful fetch. Shake source timestamps should be recent, and pending batches should drain after recovery.

## 11. Start archives only if already configured

Verify your existing `UPLOADTHING_TOKEN` and provider settings, then:

```bash
docker compose --profile archives up -d --no-deps --no-build --pull never archive-worker
docker compose --profile archives logs --tail=100 archive-worker
```

The worker may begin exporting missing months immediately. It has a status file, but no Docker healthcheck; a running container alone does not prove export success. Status is written after a watch-loop pass, so it may not exist during the initial backfill.

```bash
docker compose --profile archives exec -T archive-worker node -e \
  'console.log(require("node:fs").readFileSync("/data/status.json", "utf8"))'
```

Cleanup failures leave old remote keys in `archive_cleanup` for later retry. Do not remove pending keys manually just to clear the queue.

## 12. Observe the controlled update monitor

Observe several poll cycles (at least ten minutes with default intervals). Keep the backup and rollback images until you are satisfied.

Keep Watchtower running in monitor-only mode after verification. This provides an update signal without replacing containers outside the ordered schema/Compose deployment:

```bash
docker compose start watchtower
```

`WATCHTOWER_MONITOR_ONLY=true` must remain set. Do not remove it as part of
routine recovery. A deployment must explicitly pull and recreate the intended
services after its migrations and health checks are ready.

Long-running collectors expose Docker liveness through heartbeats. Source-level
success and partial failures remain recorded separately in
`collection_attempts` or each worker's status output; a `healthy` heartbeat does
not assert that every upstream source returned data.

Install the repository's `systemd/open-ried-certbot-renew.service` and
`systemd/open-ried-certbot-renew.timer` under `/etc/systemd/system/`, then run
`systemctl daemon-reload && systemctl enable --now open-ried-certbot-renew.timer`.
Certbot is a one-shot renewal job and should not be kept running as a daemon. The
timer uses the existing Compose files and certificate volumes, then reloads
Nginx after a successful renewal.

For future schema changes, pause it again before publishing. Digest/version-pinned application releases and a controlled migration step are preferable to relying on `latest` for coordinated upgrades.

## Rollback

For an application failure after a successful migration, normally roll back images rather than restoring the database. The new fields/tables can remain. A database restore would discard writes since the backup and requires a separate Timescale-aware recovery procedure.

Stop the affected service. For a full application rollback, stop all collectors and the API; stop archives if enabled. Preserve the new Shake state volume even when temporarily running an older image.

Create `compose.rollback.yml` with only services whose rollback tags you saved:

```yaml
services:
  backend-api:
    image: local/ried-rollback-backend-api:before-refactor
  shake-collector:
    image: local/ried-rollback-shake-collector:before-refactor
  smartcity-collector:
    image: local/ried-rollback-smartcity-collector:before-refactor
  nextbike-collector:
    image: local/ried-rollback-nextbike-collector:before-refactor
  traffic-collector:
    image: local/ried-rollback-traffic-collector:before-refactor
```

Use the saved old Compose definition as the base so old images receive their original commands/environment settings. Preserve the existing project name and resolve any relative bind mounts against the live deployment directory. An easy approach, after saving the new configuration separately, is to copy the backed-up Compose file back into that directory, then run:

```bash
docker compose -f docker-compose.yml -f compose.rollback.yml \
  up -d --no-deps --no-build --pull never backend-api
```

Verify API logs and its internal `/health` before starting the old collectors:

```bash
docker compose -f docker-compose.yml -f compose.rollback.yml \
  up -d --no-deps --no-build --pull never \
  shake-collector smartcity-collector nextbike-collector traffic-collector
```

Leave Watchtower stopped during rollback. Do not run `docker compose down -v`, delete state volumes, prune rollback images, or reverse/drop the new schema tables as part of an image rollback. An older Shake image does not drain the new durable spool; retain it for recovery with the updated service.

## Common failure symptoms

| Symptom | What to check |
| --- | --- |
| CI cannot import `health` | Include the Smart City test-path fix and rerun CI. |
| `migrate.py` missing | Correct API image, GHCR namespace, and completed build/push job. |
| Dependency has no healthcheck | Recreate TimescaleDB with the updated Compose healthcheck and the exact existing image/volume. |
| `/data/status.json` permission denied | Stop the collector and repair its state-volume ownership as above. |
| Schema table/column missing | Apply the new API migration before restarting collectors. |
| Traffic remains degraded | Any required upstream failure rejects the full snapshot; inspect endpoint/validation errors. |
| Shake receipt conflict | Same batch identity has different contents; preserve the spool and investigate instead of deleting receipts. |
| Shake database connections exhaust limits | One reusable connection per station plus API/other services; review server connection capacity and station count. |
| New deployment appears empty | Wrong Compose project/volume selection; compare recorded mounts before writing anything. |

Related: [collector implementation and contracts](collectors.md), [Compose run options](https://docs.docker.com/reference/cli/docker/compose/run/), [Compose up options](https://docs.docker.com/reference/cli/docker/compose/up/).
