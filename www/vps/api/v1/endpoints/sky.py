"""Latest calculated solar and lunar readings for the Hessian Ried reference point."""

from datetime import UTC, datetime, timedelta

from dependencies import get_db_pool
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder

router = APIRouter(prefix="/sky", tags=["Regional sky conditions"])
ENTITY_ID = "region:hessisches-ried"


@router.get("")
async def regional_sky(pool=Depends(get_db_pool)):
    async with pool.connection() as conn:
        ready = await (await conn.execute(
            "SELECT to_regclass('latest_readings') IS NOT NULL AS ready"
        )).fetchone()
        if not ready or not ready["ready"]:
            raise HTTPException(503, "Canonical measurement storage is not installed")
        cursor = await conn.execute(
            """SELECT e.name,e.metadata,d.metric,d.unit,d.source_id,d.basis,
                      r.observed_at,r.value,r.quality,r.provenance
               FROM entities e JOIN measurement_definitions d ON d.entity_id=e.id
               JOIN latest_readings r ON r.measurement_id=d.id
               WHERE e.id=%s AND d.source_id='astronomy-engine:hessisches-ried-v1'
               ORDER BY d.metric""",
            (ENTITY_ID,),
        )
        rows = await cursor.fetchall()
    if not rows:
        raise HTTPException(503, "Regional sky measurements are not available yet")
    freshest = max(row["observed_at"] for row in rows)
    if freshest < datetime.now(UTC) - timedelta(minutes=30):
        raise HTTPException(503, "Regional sky measurements are stale")
    metadata = rows[0]["metadata"]
    values = {
        row["metric"]: {
            "value": float(row["value"]) if row["value"] is not None else None,
            "unit": row["unit"],
            "quality": row["quality"],
            "observed_at": row["observed_at"],
            "provenance": row["provenance"],
        }
        for row in rows
    }
    return jsonable_encoder({
        "entity_id": ENTITY_ID,
        "name": rows[0]["name"],
        "location": {
            "region": "Hessisches Ried",
            "latitude": metadata["latitude"],
            "longitude": metadata["longitude"],
        },
        "observed_at": freshest,
        "phase_name": rows[0]["provenance"].get("phase_name"),
        "readings": values,
    })
