# VPS Telemetry Backend & TimescaleDB Infrastructure

Collector structure, CLI, reliability contracts, migration order and testing are documented in [collectors.md](collectors.md).

This directory contains the FastAPI backend, TimescaleDB configuration, and
independently deployable data collectors for the Open Ried Sens VPS at
`169.58.102.132`. The public API is served over HTTPS through Nginx at
`open-ried-sens.duckdns.org`. The frontend is a separate Next.js deployment on
Vercel.

---

## Architecture Overview

```
 [LoRa Tracker]
       │ (LoRaWAN 868MHz)
       ▼
 [The Things Network (TTN)]
       │ (HTTP Webhook / REST POST)
       ▼
 ┌──────────────────── VPS 169.58.102.132 ───────────────────────┐
 │                                                               │
 │   ┌─────────────────┐           ┌────────────────────────┐    │
 │   │   backend-api   │◄─────────►│      timescaledb       │    │
 │   │   FastAPI       │  psycopg3 │ PostgreSQL + Timescale │    │
 │   └────────▲────────┘           └────────────────────────┘    │
 │            │ HTTPS                                             │
 │   ┌────────┴────────┐     ┌───────────────────────────────┐   │
 │   │     nginx       │     │ unabhängige Datenkollektoren │   │
 │   └────────▲────────┘     └───────────────────────────────┘   │
 │            │                                                   │
 │   ┌────────┴────────┐  Watchtower: GHCR-Monitor, kein Auto-Update│
 │   │   certbot/TLS   │  (WATCHTOWER_MONITOR_ONLY=true)          │
 │   └─────────────────┘                                          │
 └───────────────────────────────────────────────────────────────┘
```

### Compose services in this repository

The Compose file defines the API, TimescaleDB, Nginx, Certbot and collectors for
TTN/Shake, Smart City, Nextbike, fuel prices, traffic, environment and weather,
rest areas, OpenSenseMap, UBA air quality, TTN Mapper, EMF, archives, registry
sync, aircraft, AIS, Rhine maps and satellite data. Some services use Compose
profiles, and the production stack may enable only a subset. See
[`docker-compose.yml`](docker-compose.yml) for the current service and profile
definitions, and each collector's README for its own data contract.

The live server was inspected read-only on **2026-10-21**. Its active Compose
project is `/root`, using `/root/docker-compose.yml` and
`/root/docker-compose.override.yml`. Active containers included the API,
TimescaleDB, Nginx, Watchtower, registry sync, EMF, satellite, AIS, aircraft,
Rhine map and environment services. The aircraft container reported unhealthy
during that inspection. This runtime inventory is a dated snapshot, not a
guarantee that the same set of optional services is active later. The separate
repository checkout at `/root/kamue-digital-lora-sensor` reported commit
`d5d0c84`, while the local repository was at `6e1bdfb`; verify the deployed
release before assuming the VPS has the current `main` revision.

Watchtower polls GHCR every 300 seconds with
`WATCHTOWER_MONITOR_ONLY=true`. It reports available images but does not replace
running containers. A GHCR image publication is therefore not proof that a VPS
deployment occurred.

---

## Continuous Integration & Deployment (CI/CD)

The workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs
for pull requests and pushes to `main` that change `www/vps/**` or the workflow
itself. It runs collector/API validation and tests, then builds and publishes
the individual service images (API and collectors) to GHCR on pushes to `main`.
The image names and build contexts are defined in the workflow; there is no
single `kamue-digital-lora-sensor` application image.

Frontend changes use the separate
[`frontend.yml`](../../.github/workflows/frontend.yml) workflow. Neither
workflow deploys the frontend or restarts the VPS by itself.

VPS rollout: GHCR publication and VPS deployment are separate. Follow
   [`DEPLOYMENT.md`](DEPLOYMENT.md) for schema-aware ordered rollout and verify
   the exact running image and health status after deployment. Watchtower is
   monitor-only; it does not automatically restart services from new images.

---

## Environment Variables (`.env`)

Create a `.env` file in the same directory as `docker-compose.yml` on the VPS:

```bash
# PostgreSQL / TimescaleDB Credentials
POSTGRES_DB=mydatabase
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YourSuperSecurePassword123!

# Bearer API Key required for ingesting data (LoRa tracker / TTN webhook)
API_KEY=open-ried-sens-live-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ADMIN_API_KEY=open_ried_sens_admin_replace_with_separate_random_key
```

Both API keys are required and must differ. Generate independent random values
(for example `openssl rand -hex 32`); retain the `open_ried_sens_admin_` prefix
for the admin key used by the Next.js frontend. The API fails startup if a key
is absent or both keys are equal. Set `BACKEND_ADMIN_API_KEY` on the frontend
to the same admin value. The collector needs the admin key for API-mode metadata
registration; ingestion credentials alone cannot perform that operation.

Only nginx publishes host ports (80/443). PostgreSQL and the backend communicate
over the Compose network and must not be exposed on public ports 5432/8080.
Use `docker compose exec timescaledb psql -U <user> -d <database>` for database
administration. A separately run local API may still listen on localhost:8080.
Recreate the Compose services when deploying these changes: updating an image
alone does not remove existing host port mappings. Verify external firewall
rules and listeners after deployment.

Public aggregate requests permit at most 31 days and 2,000 time buckets, and
return at most 5,000 rows across metrics/units. Choose coarser intervals or a
metric filter when rejected; use monthly archives for bulk history. Queries
have a five-second database timeout. nginx limits each source IP to 10 requests
per second (burst 20) and 10 concurrent connections, returning 429 on excess.
The API also bounds its connection pool and waiting queue.

---

## Database Schema & Auto-Initialization

The initial/compatibility schema is defined in
[`api/v1/schema.sql`](api/v1/schema.sql):

- **`sensor_metadata`**: Stores sensor identity, friendly name, and installation coordinates (latitude/longitude).
- **`sensor_data`**: TimescaleDB hypertable storing timestamped measurements (`timestamp`, `sensor_id`, `value`, `unit`).
- **`idx_sensor_data_composite`**: Composite B-tree index on `(sensor_id, timestamp DESC)` for low-latency queries.

The codebase also contains the normalized `entities`,
`measurement_definitions` and `readings` model and versioned migrations. The
production API was observed with `MEASUREMENT_READ_MODE=legacy` on 2026-10-21,
so its standard telemetry reads still use the compatibility tables
`sensor_metadata`, `sensor_data` and `sensor_latest`. Do not assume that the
normalized model is already the active read path; see the migration and
measurement-read runbooks before changing that setting.

### Schema initialization and migrations
- The API applies bootstrap DDL and its versioned migrations during startup.
  A container restart is not a substitute for a required ordered data migration.
- Incoming telemetry can register unknown sensor IDs in the compatibility
  metadata table. Sensor metadata includes a `friendly_name`; admin changes must
  be preserved by each collector.

---

## API Endpoints Reference

All routes are prefixed with `/api/v1`. Open Data GET endpoints are completely public with CORS enabled. Ingestion routes require `Authorization: Bearer <API_KEY>`, while Admin mutation routes require `Authorization: Bearer <ADMIN_API_KEY>`.

### Public Open Data Endpoints
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/sensors` | No | List all publicly active sensors (`is_hidden = FALSE`) |
| `GET` | `/api/v1/sensors/{sensor_id}` | No | Get metadata and status for a single public sensor |
| `GET` | `/api/v1/telemetry/latest` | No | Get the most recent telemetry reading for a given sensor |
| `GET` | `/api/v1/telemetry/raw` | No | Fetch raw historical points (`sensor_id`, `start_time`, `end_time`, `limit`) |
| `GET` | `/api/v1/telemetry/aggregates` | No | Fetch aggregated metrics (`avg`, `min`, `max`, `count`) grouped by `time_bucket` |
| `GET` | `/health` | No | Service health check |
| `GET` | `/docs` | No | Interactive Swagger UI API documentation |

### Ingestion Endpoints (LoRaWAN / TTN)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/telemetry` | Bearer `API_KEY` | Ingest a single sensor reading |
| `POST` | `/api/v1/telemetry/batch` | Bearer `API_KEY` | Bulk ingest multiple sensor readings in a single transaction |

### Admin Endpoints (Open Ried Sens Next.js Webapp)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/admin/sensors` | Bearer `ADMIN_API_KEY` | List all sensors (including hidden stations) |
| `POST` | `/api/v1/admin/sensors` | Bearer `ADMIN_API_KEY` | Register or create a new sensor station |
| `PUT` | `/api/v1/admin/sensors/{id}` | Bearer `ADMIN_API_KEY` | Update sensor metadata (name, coordinates, visibility) |
| `PATCH` | `/api/v1/admin/sensors/{id}/visibility` | Bearer `ADMIN_API_KEY` | Toggle sensor visibility (`is_hidden: true/false`) |
| `DELETE` | `/api/v1/admin/sensors/{id}` | Bearer `ADMIN_API_KEY` | Archive/hide or purge a sensor |

---

## VPS operation & troubleshooting

Connect to the production VPS with the configured SSH key, then use the existing
Compose deployment directory and project options:

```bash
ssh -i ~/.ssh/id_ed25519 root@169.58.102.132
```

From that deployment directory:

### View Live Logs
```bash
# Follow live logs from backend API
docker compose logs -f backend-api

# Follow live database logs
docker compose logs -f timescaledb

# Check the GHCR monitor logs (this does not apply updates)
docker compose logs -f watchtower
```

### Apply Schema Manually (Optional)
If you ever need to manually apply or verify `schema.sql` directly inside TimescaleDB:
```bash
# Inspect existing tables
docker compose exec timescaledb psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\dt"

# Execute schema.sql from the host (if schema.sql is present on the VPS)
docker compose exec -T timescaledb psql -U $POSTGRES_USER -d $POSTGRES_DB < schema.sql
```

### Restart / Update Services Manually
```bash
# Pull latest images and restart containers immediately
docker compose pull backend-api
docker compose up -d --force-recreate backend-api

# Clean up stale dangling images to save VPS disk space
docker image prune -f
```

## Public bulk data archives

The optional `archive-worker` service generates monthly ZIP parts, publishes them
through UploadThing and records a public download catalogue. See
[archive-worker/README.md](archive-worker/README.md) for credentials, first-run
backfill, scheduling, refreshes and operational requirements. The website's
Daten page offers monthly links and a script for downloading full years.
