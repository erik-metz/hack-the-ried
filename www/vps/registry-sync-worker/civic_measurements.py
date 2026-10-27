"""Mirror civic source aggregates into the shared measurement core and dashboard."""

from psycopg.types.json import Jsonb


async def write_civic_measurement(
    conn, *, entity_id, entity_name, source_id, metric, unit, value,
    observed_at, collected_at, dimensions, provenance, semantics="state",
    period_start=None, period_end=None, metadata=None,
):
    """Write one stable observation to entities/definitions/readings and legacy UI."""
    await conn.execute(
        """INSERT INTO entities(id,name,entity_type,metadata)
        VALUES (%s,%s,'civic_area',%s)
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,
            metadata=entities.metadata || EXCLUDED.metadata, updated_at=NOW()""",
        (entity_id, entity_name, Jsonb(metadata or {})),
    )
    await conn.execute(
        """SELECT write_measurement(%s,%s,%s,%s,'reported',%s,%s,%s::numeric,%s,%s,
            'valid',%s,%s,%s)""",
        (entity_id, metric, unit, source_id, Jsonb(dimensions), observed_at,
         value, collected_at, Jsonb(provenance), period_start, period_end, semantics),
    )


async def write_dashboard_snapshot(conn, *, sensor_id, name, description, readings, timestamp):
    """Feed the existing station selector and 24-hour chart from the same snapshot."""
    await conn.execute(
        """INSERT INTO sensor_metadata(id,friendly_name,description,is_hidden)
        VALUES (%s,%s,%s,FALSE)
        ON CONFLICT (id) DO UPDATE SET friendly_name=EXCLUDED.friendly_name,
            description=EXCLUDED.description, is_hidden=FALSE, updated_at=NOW()""",
        (sensor_id, name, description),
    )
    for metric, value, unit in readings:
        await conn.execute(
            """DELETE FROM sensor_data WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s""",
            (sensor_id, metric, unit, timestamp),
        )
        await conn.execute(
            """INSERT INTO sensor_data(timestamp,sensor_id,value,unit,metric)
            VALUES (%s,%s,%s,%s,%s)""",
            (timestamp, sensor_id, value, unit, metric),
        )
