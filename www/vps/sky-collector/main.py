"""Calculate and persist solar/lunar conditions for the Hessian Ried."""

import logging
import os
import time
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from calculations import ENTITY_ID, LATITUDE, LONGITUDE, SOURCE_ID, calculate

POLL_SECONDS = max(60, int(os.getenv("SKY_POLL_SECONDS", "300")))
DB = {
    "host": os.getenv("DB_HOST", "timescaledb"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "mydatabase"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
    "connect_timeout": 10,
}
LOG = logging.getLogger("sky-collector")


def persist(conn: psycopg.Connection, snapshot: dict) -> None:
    metadata = {
        "region": "Hessisches Ried",
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "elevation_m": 100,
        "reference": "fixed regional reference point; astronomy-engine",
    }
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(734225, 17)")
        cur.execute(
            """INSERT INTO entities(id,name,entity_type,metadata)
               VALUES (%s,%s,'regional_reference',%s)
               ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,
                 metadata=entities.metadata || EXCLUDED.metadata, updated_at=NOW()""",
            (ENTITY_ID, "Hessisches Ried – Himmelsstand", psycopg.types.json.Jsonb(metadata)),
        )
        for metric, (value, unit) in snapshot["readings"].items():
            cur.execute(
                """SELECT write_measurement(
                     %s,%s,%s,%s,'model','{}'::jsonb,%s,%s,%s,%s,
                     'valid',NULL,NULL,'instantaneous',FALSE)""",
                (
                    ENTITY_ID,
                    metric,
                    unit,
                    SOURCE_ID,
                    snapshot["observed_at"],
                    value,
                    datetime.now(UTC),
                    psycopg.types.json.Jsonb({
                        "algorithm": "Astronomy Engine",
                        "region": "Hessisches Ried",
                        "latitude": LATITUDE,
                        "longitude": LONGITUDE,
                        "phase_name": snapshot["phase_name"],
                    }),
                ),
            )
        cur.execute(
            """INSERT INTO collection_attempts(source_id,http_status,status,item_count,item_count_unit)
               VALUES (%s,200,'success',%s,'measurements')""",
            (SOURCE_ID, len(snapshot["readings"])),
        )


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    while True:
        try:
            snapshot = calculate(datetime.now(UTC))
            with psycopg.connect(**DB) as conn:
                persist(conn, snapshot)
            Path("/tmp/sky-heartbeat").touch()
            LOG.info("Stored Ried sky snapshot at %s", snapshot["observed_at"].isoformat())
        except Exception:
            LOG.exception("Sky snapshot failed")
            try:
                with psycopg.connect(**DB) as conn:
                    conn.execute(
                        "INSERT INTO collection_attempts(source_id,status,error,error_stage) VALUES (%s,'failed',%s,'processing')",
                        (SOURCE_ID, "Sky calculation or persistence failed; see collector log"),
                    )
            except Exception:
                LOG.exception("Could not record failed sky collection attempt")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
