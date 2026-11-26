"""Explicit read cutover. No fallback from canonical measurements to old values."""

import os
import re

RELATIONS = {
    "sensor_data": "core_sensor_data",
    "sensor_latest": "core_sensor_latest",
    "sensor_metadata": "core_sensor_metadata",
    "movement_latest": "core_movement_latest",
}
PATTERN = re.compile(r"\b(" + "|".join(RELATIONS) + r")\b")


def core_reads():
    mode = os.getenv("MEASUREMENT_READ_MODE", "legacy")
    if mode not in {"legacy", "core", "core_current"}:
        raise RuntimeError("MEASUREMENT_READ_MODE must be legacy, core_current or core")
    return mode != "legacy"


def read_sql(statement):
    if not re.match(r"\s*(SELECT|WITH)\b", statement, re.IGNORECASE):
        raise ValueError("Only read statements may select a measurement read model")
    if not core_reads():
        return statement
    def relation(match):
        name = match.group()
        # During the production history transfer, current snapshots use the core
        # while historical queries retain their complete existing database data.
        if name == 'sensor_data' and os.getenv('MEASUREMENT_READ_MODE') == 'core_current':
            return name
        return RELATIONS[name]
    return PATTERN.sub(relation, statement)


async def ensure_core_ready(conn):
    """Reject a read cutover with missing current records rather than showing gaps."""
    if not core_reads():
        return
    cursor = await conn.execute("""SELECT
        EXISTS (SELECT 1 FROM sensor_metadata s LEFT JOIN core_sensor_metadata c ON c.id=s.id
            WHERE c.id IS NULL OR (s.friendly_name,s.latitude,s.longitude,s.is_hidden,s.description)
                IS DISTINCT FROM (c.friendly_name,c.latitude,c.longitude,c.is_hidden,c.description))
        OR EXISTS (SELECT 1 FROM sensor_latest s LEFT JOIN core_sensor_latest c
            ON c.sensor_id=s.sensor_id AND c.metric=s.metric AND c.unit=s.unit
            WHERE c.sensor_id IS NULL OR (s.timestamp,s.value) IS DISTINCT FROM (c.timestamp,c.value))
        OR EXISTS (SELECT 1 FROM movement_latest m LEFT JOIN core_movement_latest c
            ON c.entity_id=m.entity_id AND c.basis=m.basis
            WHERE m.valid_until>NOW() AND (c.entity_id IS NULL OR m.data IS DISTINCT FROM c.data))
        OR EXISTS (SELECT 1 FROM collected_datasets d LEFT JOIN core_statistical_datasets c USING(dataset)
            WHERE d.dataset LIKE 'statistics/%' AND (c.dataset IS NULL OR d.data IS DISTINCT FROM c.data))
        OR EXISTS (SELECT 1 FROM collected_datasets d LEFT JOIN core_charger_datasets c USING(dataset)
            WHERE d.dataset IN ('infrastructure/ev-charging','map/layers/charging')
                AND (c.dataset IS NULL OR d.data IS DISTINCT FROM c.data))
        OR EXISTS (SELECT 1 FROM collected_datasets d LEFT JOIN core_gauge_datasets c USING(dataset)
            WHERE d.dataset IN ('environment/flood/gauges','map/layers/floods')
                AND (c.dataset IS NULL OR d.data IS DISTINCT FROM c.data))
        AS incomplete""")
    row = await cursor.fetchone()
    incomplete = row['incomplete'] if isinstance(row, dict) else row[0]
    if incomplete:
        raise RuntimeError("Core measurement read cutover refused: current-value parity is incomplete")


async def latest_value_join(cur, *, left=False):
    """Join fragment exposing `lr.value` for each `md.id`, safe for core storage.

    In core storage latest_readings is a view joining measurement_heads with the
    whole compressed readings hypertable. Joining that view to many definitions lets
    the planner hash every reading in parallel workers, which exhausts the
    database's shared memory. A lateral key lookup per head avoids that.
    """
    await cur.execute("SELECT to_regclass('measurement_heads') IS NOT NULL AS ready")
    row = await cur.fetchone()
    heads = row["ready"] if isinstance(row, dict) else row[0]
    join = "LEFT JOIN" if left else "JOIN"
    if not heads:
        return f"{join} latest_readings lr ON lr.measurement_id = md.id"
    return (f"{join} measurement_heads h ON h.measurement_id = md.id "
            f"{'LEFT JOIN' if left else 'CROSS JOIN'} LATERAL (SELECT x.value FROM readings x "
            "WHERE x.measurement_id = h.measurement_id AND x.observed_at = h.observed_at "
            f"LIMIT 1) lr{' ON TRUE' if left else ''}")
