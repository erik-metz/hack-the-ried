import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote_plus

import psycopg
import psycopg_pool
from dependencies import validate_api_keys
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from measurement_reads import ensure_core_ready
from psycopg.rows import dict_row
from router import api_router as v1_router

logger = logging.getLogger(__name__)

SCHEMA_FILE = Path(__file__).parent / "schema.sql"
SCHEMA_SQL = SCHEMA_FILE.read_text(encoding="utf-8") if SCHEMA_FILE.exists() else ""


async def init_db(pool: psycopg_pool.AsyncConnectionPool) -> None:
    """Initializes the database schema if schema.sql is available."""
    async with pool.connection() as conn:
        cursor = await conn.execute("SELECT to_regclass('public.measurement_migration_state') AS relation")
        row = await cursor.fetchone()
        if row['relation'] is not None:
            cursor = await conn.execute("""SELECT 1 FROM measurement_migration_state
                WHERE name='retired_unused_registries'""")
            if await cursor.fetchone() is not None:
                # Explicit versioned migrations own an upgraded database. The
                # old bootstrap would recreate retired registries on restart.
                await conn.execute((Path(__file__).parent / "migrations" / "20261007_collection_status.sql").read_text())
                firmware_migration = Path(__file__).parent / "migrations" / "20261017_ttn_firmware_version.sql"
                await conn.execute(firmware_migration.read_text())
                await conn.execute((Path(__file__).parent / "migrations" / "20261018_firmware_version_number.sql").read_text())
                logger.info("Canonical database: skipping legacy bootstrap DDL")
                return
    if SCHEMA_SQL:
        try:
            async with pool.connection() as conn:
                await conn.execute(SCHEMA_SQL)
            logger.info("Database schema initialized successfully.")
        except (psycopg.Error, OSError) as e:
            logger.error("Failed to initialize database schema: %s", e)
            raise
    async with pool.connection() as conn:
        await conn.execute((Path(__file__).parent / "migrations" / "20261017_ttn_firmware_version.sql").read_text())
        await conn.execute((Path(__file__).parent / "migrations" / "20261018_firmware_version_number.sql").read_text())


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_api_keys()
    user = os.getenv("DB_USER", "")
    password = os.getenv("DB_PASSWORD", "")
    host = os.getenv("DB_HOST", "timescaledb")
    port = os.getenv("DB_PORT", "5432")
    db = os.getenv("DB_NAME", "")

    conninfo = f"postgresql://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{db}"

    app.state.pool = psycopg_pool.AsyncConnectionPool(
        conninfo=conninfo,
        open=False,
        max_size=10,
        max_waiting=32,
        timeout=5,
        kwargs={"row_factory": dict_row},
    )
    await app.state.pool.open()

    try:
        await init_db(app.state.pool)
        async with app.state.pool.connection() as conn:
            await conn.execute((Path(__file__).parent / "migrations" / "20261007_archive_format.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261007_fuel.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261009_traffic_events.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261010_webcam_snapshots.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261010_webcam_retention.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261016_ttn_ingestion.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261020_sensor_window_statistics.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261027_newsletter_subscribers.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261030_qr_scan_events.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261029_registration_categories.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261028_sky_collector.sql").read_text())
            await conn.execute((Path(__file__).parent / "migrations" / "20261016_reading_export_index.sql").read_text())
            await ensure_core_ready(conn)
        yield
    finally:
        await app.state.pool.close()


app = FastAPI(
    title="HackTheRied Telemetry API",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    lifespan=lifespan,
)

# Enable CORS for Open Data public access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    async with app.state.pool.connection() as conn:
        cursor = await conn.execute("SELECT 1 FROM collector_schema_versions WHERE version=20260928")
        if await cursor.fetchone() is None:
            raise HTTPException(503, "Collector schema migration is not ready")
    return {"status": "healthy", "collector_schema_version": 20260928,
            "capabilities": ["collected-publications", "persisted-movements", "indexed-departures"]}
