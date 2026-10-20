# VPS Telemetry Backend & TimescaleDB Infrastructure

Collector structure, CLI, reliability contracts, migration order and testing are documented in [collectors.md](collectors.md).

This directory contains the cloud backend service and container configuration deployed on an **AWS EC2** instance to ingest, store, and serve LoRaWAN GPS tracker and sensor telemetry.

---

## Architecture Overview

```
 [LoRa Tracker]
       │ (LoRaWAN 868MHz)
       ▼
 [The Things Network (TTN)]
       │ (HTTP Webhook / REST POST)
       ▼
 ┌────────────────── AWS EC2 Host ──────────────────────────────┐
 │                                                               │
 │   ┌─────────────────┐           ┌────────────────────────┐    │
 │   │   backend-api   │◄─────────►│      timescaledb       │    │
 │   │ (FastAPI Port   │  psycopg3 │  (PostgreSQL 16 with   │    │
 │   │      8080)      │           │ TimescaleDB Hypertable)│    │
 │   └────────▲────────┘           └────────────────────────┘    │
 │            │ (Auto-update)                                    │
 │   ┌────────┴────────┐                                         │
 │   │   watchtower    │ ◄── Polls GHCR every 300s               │
 │   └─────────────────┘                                         │
 └───────────────────────────────────────────────────────────────┘
```

### Services (Docker Compose)
1. **`backend-api`**: High-performance asynchronous FastAPI service powered by `psycopg 3` with connection pooling (`psycopg-pool`). Automatically self-initializes the database schema on startup and auto-registers unknown incoming sensor IDs.
2. **`timescaledb`**: TimescaleDB running on PostgreSQL 16. Automatically partitions the `sensor_data` table into optimized time-based chunks (hypertables) for millisecond queries over millions of telemetry points.
3. **`shake-collector`**: Real-time daemon streaming 100 Hz seismic telemetry from Raspberry Shake station `AM.R498E.00.EHZ` (Bürstadt / Bobstadt) via CAPS WebSocket, calculating 5-second windowed vibration intensity metrics (Peak Ground Velocity & RMS Noise Floor), and pushing telemetry to the backend API.
4. **`watchtower`**: Monitors GitHub Container Registry (GHCR) for new images. It runs with `WATCHTOWER_MONITOR_ONLY=true`; updates are deployed in a controlled order after any required migration and health checks.
5. **`smartcity-collector`**: Polls the public Bürstadt/Lampertheim overview every 60 seconds, preserves source observation timestamps and transactionally deduplicates measurements. See [collector setup and deployment](smartcity-collector/README.md) for supported metrics, pilot filters, schema ordering and freshness checks.

---

## Continuous Integration & Deployment (CI/CD)

The deployment pipeline is defined in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml):

1. **Code Validation**: Every push and pull request runs `ruff check www/vps/` to enforce code quality and styling.
2. **Container Build & Push**: On commits pushed to `main`:
   - Builds the Docker image from `www/vps/dockerfile`.
   - Authenticates to **GitHub Container Registry** (`ghcr.io`).
   - Pushes the image tagged as `ghcr.io/<repo-owner>/kamue-digital-lora-sensor:latest`.
3. **EC2 Continuous Deployment**:
   - The EC2 instance runs `watchtower`, which polls GHCR every 300 seconds (5 minutes).
   - Once a new image is detected, Watchtower gracefully restarts `backend-api` using the updated image.

---

## Environment Variables (`.env`)

Create a `.env` file in the same directory as `docker-compose.yml` on the EC2 host:

```bash
# PostgreSQL / TimescaleDB Credentials
POSTGRES_DB=mydatabase
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YourSuperSecurePassword123!

# Application Configuration
API_PORT=8080

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

The database structure is defined in [`schema.sql`](schema.sql):

- **`sensor_metadata`**: Stores sensor identity, friendly name, and installation coordinates (latitude/longitude).
- **`sensor_data`**: TimescaleDB hypertable storing timestamped measurements (`timestamp`, `sensor_id`, `value`, `unit`).
- **`idx_sensor_data_composite`**: Composite B-tree index on `(sensor_id, timestamp DESC)` for low-latency queries.

### How Schema Initialization Works
- **Self-Healing on Startup:** `backend-api` executes `schema.sql` automatically during its FastAPI lifespan startup (`main.py`). All statements use `IF NOT EXISTS`, making this safe and idempotent across container restarts.
- **Auto-Registration:** When sensor readings arrive via `/telemetry` or `/telemetry/batch` for an unregistered `sensor_id`, the API automatically creates a stub entry in `sensor_metadata` to satisfy the foreign key relation without dropping incoming packets.

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
| `POST` | `/api/v1/sensors/register` | Bearer `ADMIN_API_KEY` | *Deprecated* legacy registration endpoint |

---

## EC2 Operation & Troubleshooting Commands

SSH into your EC2 instance and run these commands from your application directory (e.g. `~/app`):

### View Live Logs
```bash
# Follow live logs from backend API
docker compose logs -f backend-api

# Follow live database logs
docker compose logs -f timescaledb

# Check Watchtower update logs
docker compose logs -f watchtower
```

### Apply Schema Manually (Optional)
If you ever need to manually apply or verify `schema.sql` directly inside TimescaleDB:
```bash
# Inspect existing tables
docker compose exec timescaledb psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\dt"

# Execute schema.sql from the host (if schema.sql is present on EC2)
docker compose exec -T timescaledb psql -U $POSTGRES_USER -d $POSTGRES_DB < schema.sql
```

### Restart / Update Services Manually
```bash
# Pull latest images and restart containers immediately
docker compose pull backend-api
docker compose up -d --force-recreate backend-api

# Clean up stale dangling images to save EC2 disk space
docker image prune -f
```

## Public bulk data archives

The optional `archive-worker` service generates monthly ZIP parts, publishes them
through UploadThing and records a public download catalogue. See
[archive-worker/README.md](archive-worker/README.md) for credentials, first-run
backfill, scheduling, refreshes and operational requirements. The website's
Daten page offers monthly links and a script for downloading full years.
