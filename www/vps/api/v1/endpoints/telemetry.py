import hashlib
import json
import math
from datetime import UTC, datetime, timedelta

import psycopg_pool
from dependencies import get_db_pool, verify_ingestion_key
from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from measurement_reads import read_sql
from psycopg.errors import QueryCanceled
from schemas import (
    BatchSensorReadings,
    SensorAggregateResponse,
    SensorReading,
)

router = APIRouter()

ALLOWED_INTERVALS = {
    "1 minute",
    "5 minutes",
    "10 minutes",
    "15 minutes",
    "30 minutes",
    "1 hour",
    "2 hours",
    "3 hours",
    "6 hours",
    "12 hours",
    "1 day",
    "7 days",
    "1 week",
    "30 days",
    "1 month",
}

MAX_AGGREGATE_ROWS = 5000
INTERVAL_SECONDS = {
    "1 minute": 60, "5 minutes": 300, "10 minutes": 600,
    "15 minutes": 900, "30 minutes": 1800, "1 hour": 3600,
    "2 hours": 7200, "3 hours": 10800, "6 hours": 21600,
    "12 hours": 43200, "1 day": 86400, "7 days": 604800,
    "1 week": 604800, "30 days": 2592000, "1 month": 2419200,
}


def validate_aggregate_range(start: datetime, end: datetime, interval: str):
    # Treat legacy timezone-less input as UTC, consistently with public docs.
    start = start.replace(tzinfo=UTC) if start.tzinfo is None else start.astimezone(UTC)
    end = end.replace(tzinfo=UTC) if end.tzinfo is None else end.astimezone(UTC)
    span = end - start
    if span < timedelta(0) or span > timedelta(days=31):
        raise HTTPException(400, "Aggregate ranges must be ordered and at most 31 days; use archives for bulk history.")
    # Add one for partial buckets at the boundaries.
    if math.ceil(span.total_seconds() / INTERVAL_SECONDS[interval]) + 1 > 2000:
        raise HTTPException(400, "Too many time buckets; use a coarser interval or shorter range.")
    return start, end


# --- INGESTION ENDPOINTS (LoRaWAN / TTN Webhook) ---

@router.post(
    "/telemetry",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Security(verify_ingestion_key)],
    summary="Push single sensor telemetry reading (TTN / Ingestion Key required)",
    tags=["Telemetry Ingestion"],
)
async def push_sensor_data(
    reading: SensorReading, 
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    """Inserts a single sensor reading from an authenticated source."""
    ts = reading.timestamp or datetime.now(UTC)
    query = """
        INSERT INTO sensor_data (timestamp, sensor_id, value, unit, metric)
        VALUES (%s, %s, %s, %s, %s);
    """
    async with pool.connection() as conn:
        # Automatically register sensor if it does not already exist
        await conn.execute(
            """
            INSERT INTO sensor_metadata (id, friendly_name, is_hidden)
            VALUES (%s, %s, FALSE)
            ON CONFLICT (id) DO NOTHING;
            """,
            (reading.sensor_id, reading.sensor_id),
        )
        await conn.execute(query, (ts, reading.sensor_id, reading.value, reading.unit, reading.metric))
    return {"status": "inserted", "timestamp": ts}


@router.post(
    "/telemetry/batch",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Security(verify_ingestion_key)],
    summary="Push batch telemetry readings (TTN / Ingestion Key required)",
    tags=["Telemetry Ingestion"],
)
async def push_batch_sensor_data(
    payload: BatchSensorReadings, 
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    """Bulk inserts multiple sensor readings in a single transaction."""
    if not payload.readings:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Readings array cannot be empty.",
        )

    if payload.batch_id and any(item.timestamp is None or not math.isfinite(item.value) for item in payload.readings):
        raise HTTPException(400, "Replayable batches require explicit timestamps and finite values")
    canonical = [{"sensor_id": item.sensor_id, "metric": item.metric, "value": item.value,
                      "unit": item.unit, "timestamp": item.timestamp.isoformat() if item.timestamp else None}
                 for item in payload.readings]
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    now_utc = datetime.now(UTC)
    records = [
        (item.timestamp or now_utc, item.sensor_id, item.value, item.unit, item.metric)
        for item in payload.readings
    ]

    unique_sensors = [(s_id, s_id) for s_id in {item.sensor_id for item in payload.readings}]

    query = """
        INSERT INTO sensor_data (timestamp, sensor_id, value, unit, metric)
        VALUES (%s, %s, %s, %s, %s);
    """
    async with pool.connection() as conn, conn.transaction(), conn.cursor() as cur:
        if payload.batch_id:
            await cur.execute("SET LOCAL statement_timeout = '30s'")
            await cur.execute("SET LOCAL lock_timeout = '10s'")
            await cur.execute("""INSERT INTO telemetry_ingest_batches(batch_id,payload_hash)
                VALUES (%s,%s) ON CONFLICT DO NOTHING RETURNING batch_id""", (payload.batch_id, digest))
            if await cur.fetchone() is None:
                await cur.execute("SELECT payload_hash FROM telemetry_ingest_batches WHERE batch_id=%s", (payload.batch_id,))
                previous = await cur.fetchone()
                if previous["payload_hash"] != digest:
                    raise HTTPException(409, "Batch identity reused with different readings")
                return {"status": "duplicate", "batch_id": payload.batch_id, "inserted_count": 0}
        # Auto-register distinct sensors in the batch
        await cur.executemany(
            """
                INSERT INTO sensor_metadata (id, friendly_name, is_hidden)
                VALUES (%s, %s, FALSE)
                ON CONFLICT (id) DO NOTHING;
                """,
            unique_sensors,
        )
        await cur.executemany(query, records)

    return {"status": "success", "inserted_count": len(records), "batch_id": payload.batch_id}


# --- RETRIEVAL ENDPOINTS (Public Open Data) ---

@router.get(
    "/telemetry/raw",
    response_model=list[SensorReading],
    summary="Get raw historical telemetry readings (Public)",
    tags=["Telemetry Public"],
)
async def get_raw_telemetry(
    sensor_id: str = Query(..., description="The ID of the sensor"),
    start_time: datetime = Query(..., description="Start timestamp (ISO 8601)"),
    end_time: datetime | None = Query(None, description="End timestamp"),
    limit: int = Query(default=100, ge=1, le=5000, description="Max points to return (1-5000)"),
    metric: str | None = Query(None, min_length=1, max_length=64),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    """Retrieves raw historical data points for a specific visible sensor over a time range."""
    end = end_time or datetime.now(UTC)

    query = """
        SELECT sd.timestamp, sd.sensor_id, sd.value, sd.unit, sd.metric
        FROM sensor_data sd
        JOIN sensor_metadata sm ON sd.sensor_id = sm.id
        WHERE sd.sensor_id = %s AND sm.is_hidden = FALSE
          AND (%s::text IS NULL OR sd.metric = %s) AND sd.timestamp >= %s AND sd.timestamp <= %s
        ORDER BY sd.timestamp DESC
        LIMIT %s;
    """
    async with pool.connection() as conn:
        cur = await conn.execute(read_sql(query), (sensor_id, metric, metric, start_time, end, limit))
        rows = await cur.fetchall()

    return [
        {
            "sensor_id": row["sensor_id"],
            "timestamp": row["timestamp"],
            "value": row["value"],
            "unit": row["unit"],
            "metric": row["metric"],
        }
        for row in rows
    ]


@router.get(
    "/telemetry/aggregates",
    response_model=list[SensorAggregateResponse],
    summary="Get aggregated telemetry time buckets (Public)",
    tags=["Telemetry Public"],
)
async def get_telemetry_aggregates(
    sensor_id: str = Query(..., description="The ID of the sensor"),
    interval: str = Query(
        default="1 hour",
        description="Bucket interval (e.g. 15 minutes, 1 hour, 1 day)",
    ),
    start_time: datetime = Query(..., description="Start timestamp (ISO 8601)"),
    end_time: datetime | None = Query(None, description="End timestamp"),
    metric: str | None = Query(None, min_length=1, max_length=64),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    """
    Leverages TimescaleDB's native `time_bucket` to calculate min, max, average values 
    and sample counts grouped into regular time intervals for visible sensors.
    """
    cleaned_interval = interval.strip().lower()
    if cleaned_interval not in ALLOWED_INTERVALS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid interval '{interval}'. Allowed intervals: "
                f"{', '.join(sorted(ALLOWED_INTERVALS))}"
            ),
        )

    end = end_time or datetime.now(UTC)
    start_time, end = validate_aggregate_range(start_time, end, cleaned_interval)

    query = """
        SELECT 
            time_bucket(%s::interval, sd.timestamp) AS bucket,
            AVG(sd.value) AS avg_value,
            MIN(sd.value) AS min_value,
            MAX(sd.value) AS max_value,
            COUNT(*) AS sample_count,
            sd.unit,
            sd.metric
        FROM sensor_data sd
        JOIN sensor_metadata sm ON sd.sensor_id = sm.id
        WHERE sd.sensor_id = %s AND sm.is_hidden = FALSE
          AND (%s::text IS NULL OR sd.metric = %s) AND sd.timestamp >= %s AND sd.timestamp <= %s
        GROUP BY bucket, sd.unit, sd.metric
        ORDER BY bucket ASC
        LIMIT %s;
    """
    try:
        async with pool.connection() as conn, conn.transaction():
            # Transaction-local: also bounds database work before LIMIT is applied.
            await conn.execute("SET LOCAL statement_timeout = '5s'")
            cur = await conn.execute(read_sql(query), (cleaned_interval, sensor_id, metric, metric, start_time, end, MAX_AGGREGATE_ROWS + 1))
            rows = await cur.fetchall()
    except QueryCanceled:
        raise HTTPException(503, "Query exceeded its time budget; shorten the range.") from None
    if len(rows) > MAX_AGGREGATE_ROWS:
        raise HTTPException(422, "Too many results; select a metric or shorten the range.")

    return [
        {
            "bucket": row["bucket"],
            "avg_value": round(row["avg_value"], 2) if row["avg_value"] is not None else None,
            "min_value": row["min_value"],
            "max_value": row["max_value"],
            "sample_count": row["sample_count"],
            "unit": row["unit"],
            "metric": row["metric"],
        }
        for row in rows
    ]


@router.get(
    "/telemetry/latest",
    response_model=SensorReading,
    summary="Get latest reading for sensor (Public)",
    tags=["Telemetry Public"],
)
async def get_latest_sensor_reading(
    sensor_id: str = Query(..., description="The ID of the sensor"),
    metric: str | None = Query(None, min_length=1, max_length=64),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    """Retrieves the single most recent data point for a given visible sensor."""
    query = """
        SELECT sd.timestamp, sd.sensor_id, sd.value, sd.unit, sd.metric
        FROM sensor_data sd
        JOIN sensor_metadata sm ON sd.sensor_id = sm.id
        WHERE sd.sensor_id = %s AND sm.is_hidden = FALSE
          AND (%s::text IS NULL OR sd.metric = %s)
        ORDER BY sd.timestamp DESC
        LIMIT 1;
    """
    async with pool.connection() as conn:
        cur = await conn.execute(read_sql(query), (sensor_id, metric, metric))
        row = await cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No telemetry found for sensor '{sensor_id}' (or sensor is hidden).",
        )

    return dict(row)


@router.get(
    "/telemetry/latest/metrics",
    response_model=list[SensorReading],
    summary="Get the latest reading of each metric for a sensor (Public)",
    tags=["Telemetry Public"],
)
async def get_latest_sensor_metrics(
    sensor_id: str = Query(..., description="The ID of the sensor"),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    query = """
        SELECT DISTINCT ON (sd.metric, sd.unit)
            sd.timestamp, sd.sensor_id, sd.value, sd.unit, sd.metric
        FROM sensor_data sd
        JOIN sensor_metadata sm ON sd.sensor_id = sm.id
        WHERE sd.sensor_id = %s AND sm.is_hidden = FALSE
        ORDER BY sd.metric, sd.unit, sd.timestamp DESC;
    """
    async with pool.connection() as conn:
        cur = await conn.execute(read_sql(query), (sensor_id,))
        rows = await cur.fetchall()
    return [dict(row) for row in rows]


@router.get(
    "/telemetry/latest/window",
    summary="Get the latest locally aggregated sensor window",
    tags=["Telemetry Public"],
)
async def get_latest_sensor_window(
    sensor_id: str = Query(..., description="The ID of the sensor"),
    pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool),
):
    async with pool.connection() as conn:
        cur = await conn.execute("""SELECT MIN(r.period_start) AS window_start,
                r.period_end AS window_end,
                EXTRACT(EPOCH FROM (r.period_end-MIN(r.period_start)))::integer AS window_seconds
            FROM readings r
            JOIN measurement_definitions d ON d.id=r.measurement_id
            JOIN entities e ON e.id=d.entity_id
            WHERE d.entity_id='sensor:'||%s AND d.source_id LIKE 'ttn:%%'
                AND r.period_end IS NOT NULL AND e.is_hidden=FALSE
            GROUP BY r.period_end ORDER BY r.period_end DESC LIMIT 1""", (sensor_id,))
        canonical_window = await cur.fetchone()
        canonical_metrics = None
        if canonical_window is not None:
            cur = await conn.execute("""SELECT d.metric,d.unit,
                    MAX(r.value) FILTER (WHERE d.dimensions->>'statistic'='min') AS min_value,
                    MAX(r.value) FILTER (WHERE d.dimensions->>'statistic'='mean') AS mean_value,
                    MAX(r.value) FILTER (WHERE d.dimensions->>'statistic'='max') AS max_value,
                    MAX((r.provenance->>'sample_count')::integer) AS sample_count
                FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
                WHERE d.entity_id='sensor:'||%s AND d.source_id LIKE 'ttn:%%'
                    AND r.period_end=%s
                GROUP BY d.metric,d.unit ORDER BY d.metric""",
                (sensor_id, canonical_window["window_end"]))
            canonical_metrics = await cur.fetchall()

        # Read historical windows written before TTN switched to canonical readings.
        cur = await conn.execute("""SELECT w.window_start,w.window_end,w.window_seconds
            FROM sensor_measurement_windows w
            JOIN sensor_metadata sm ON sm.id=w.sensor_id
            WHERE w.sensor_id=%s AND sm.is_hidden=FALSE
            ORDER BY w.window_end DESC LIMIT 1""", (sensor_id,))
        window = await cur.fetchone()
        if window is not None:
            cur = await conn.execute("""SELECT metric,unit,minimum AS min_value,mean AS mean_value,
                    maximum AS max_value,sample_count
                FROM sensor_window_metrics
                WHERE sensor_id=%s AND window_end=%s
                ORDER BY metric""", (sensor_id, window["window_end"]))
            metrics = await cur.fetchall()
            if canonical_window is None or window["window_end"] > canonical_window["window_end"]:
                return {**dict(window), "metrics": [dict(row) for row in metrics]}
        if canonical_window is None:
            raise HTTPException(status_code=404, detail="No aggregated sensor window found")
        return {**dict(canonical_window), "metrics": [dict(row) for row in canonical_metrics]}
