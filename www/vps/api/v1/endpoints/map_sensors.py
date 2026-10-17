"""Bounded public map inventory and latest measurements in one request."""

import hashlib
import json
import math
from datetime import UTC, datetime
from time import monotonic

from dependencies import get_db_pool
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from measurement_reads import core_reads, read_sql
from psycopg.errors import QueryCanceled
from snapshot_cache import sensor_map_cache

router = APIRouter()
MAX_MAP_SENSORS = 5000
MAX_MAP_READINGS = 64

MAP_QUERY = """
SELECT sm.id, sm.friendly_name, sm.latitude, sm.longitude, sm.description, sm.firmware_version,
       sc.entity_type, sc.entity_id AS source_entity_id,
       COALESCE(readings.items, '[]'::json) AS readings
FROM sensor_metadata sm
LEFT JOIN smartcity_sources sc ON sc.sensor_id = sm.id
LEFT JOIN LATERAL (
    SELECT json_agg(r) AS items FROM (
        SELECT metric, unit, value, timestamp FROM sensor_latest
        WHERE sensor_id = sm.id AND metric <> 'waveform'
        ORDER BY metric, unit LIMIT %s
    ) r
) readings ON TRUE
WHERE sm.is_hidden = FALSE
  AND (sm.latitude IS NULL OR sm.latitude BETWEEN -90 AND 90)
  AND (sm.longitude IS NULL OR sm.longitude BETWEEN -180 AND 180)
ORDER BY sm.id LIMIT %s
"""


async def get_map_sensors(pool=Depends(get_db_pool)):
    try:
        async with pool.connection() as conn, conn.transaction():
            await conn.execute("SET LOCAL statement_timeout = '5s'")
            cursor = await conn.execute(read_sql(MAP_QUERY), (MAX_MAP_READINGS + 1, MAX_MAP_SENSORS + 1))
            rows = await cursor.fetchall()
    except QueryCanceled:
        raise HTTPException(503, "Map data temporarily unavailable.") from None
    if len(rows) > MAX_MAP_SENSORS or any(len(row["readings"]) > MAX_MAP_READINGS for row in rows):
        raise HTTPException(422, "Map inventory exceeds supported size.")
    sensors = []
    for row in rows:
        item = dict(row)
        item["readings"] = [r for r in item["readings"] if isinstance(r["value"], (int, float)) and math.isfinite(r["value"])]
        sensors.append(item)
    return {"generated_at": datetime.now(UTC), "sensors": sensors}


@router.get("/map/sensors", tags=["Telemetry Public"])
async def map_sensor_snapshot(request: Request, pool=Depends(get_db_pool)):
    async def load():
        data = await get_map_sensors(pool)
        body = json.dumps(jsonable_encoder(data), separators=(",", ":"), ensure_ascii=False,
                          allow_nan=False).encode()
        return body, '"' + hashlib.sha256(body).hexdigest() + '"'

    (body, etag), expires = await sensor_map_cache.get((pool, core_reads()), load)
    # Bound downstream caching by the remaining lifetime of this snapshot.
    remaining = max(0, int(expires-monotonic()))
    headers = {"Cache-Control": f"public, max-age={remaining}, s-maxage={remaining}", "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)
