"""Canonical private gateway writes and restartable, bounded hourly maintenance."""

import hashlib
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from gateway_contract import METRICS
from psycopg.types.json import Jsonb

SOURCE = "gateway-host"


def dims(reading, resolution="minute"):
    return dict(reading.dimensions, resolution=resolution, statistic=reading.statistic)


async def write(
    conn, entity, metric, value, dimensions, stamp, now, start=None, end=None
):
    unit, _, _, op = METRICS[metric]
    stat = dimensions["statistic"]
    if stat == "count":
        unit = "count"
    semantics = (
        "interval_statistic"
        if stat != "value"
        else (
            "period_total"
            if op == "total"
            else "counter"
            if op == "counter"
            else "state"
            if op == "state"
            else "instantaneous"
        )
    )
    await conn.execute(
        """SELECT write_measurement(%s,%s,%s,%s,'observed',%s,%s,%s::numeric,%s,'{}',%s,%s,%s,%s)""",
        (
            entity,
            metric,
            unit,
            SOURCE,
            Jsonb(dimensions),
            stamp,
            value,
            now,
            "missing" if value is None else "valid",
            start,
            end,
            semantics,
        ),
    )


async def ingest(conn, gateway, batch):
    now = datetime.now(UTC)
    inserted = 0
    # Lock the device: receipt conflict checks and latest-state updates serialize.
    device = await (
        await conn.execute(
            "SELECT entity_id FROM gateway_devices WHERE id=%s FOR UPDATE", (gateway,)
        )
    ).fetchone()
    entity = device["entity_id"]
    for sample in batch.samples:
        digest = hashlib.sha256(sample.model_dump_json().encode()).hexdigest()
        old = await (
            await conn.execute(
                "SELECT digest FROM gateway_receipts WHERE gateway_id=%s AND sample_id=%s",
                (gateway, sample.sample_id),
            )
        ).fetchone()
        if old:
            if old["digest"] != digest:
                raise HTTPException(
                    409, "Sample identity reused with different content"
                )
            continue
        # Different sample IDs must not overwrite an accepted minute.
        conflict = await (
            await conn.execute(
                "SELECT 1 FROM gateway_receipts WHERE gateway_id=%s AND observed_at=%s",
                (gateway, sample.observed_at),
            )
        ).fetchone()
        if conflict:
            raise HTTPException(409, "Minute already accepted with another identity")
        await conn.execute(
            "INSERT INTO gateway_receipts VALUES(%s,%s,%s,%s)",
            (gateway, sample.sample_id, digest, sample.observed_at),
        )
        hours = {
            sample.observed_at.astimezone(UTC).replace(
                minute=0, second=0, microsecond=0
            )
        }
        for reading in sample.readings:
            interval = METRICS[reading.metric][3] in ("total", "distribution")
            stamp = (
                sample.observed_at - timedelta(minutes=1)
                if interval
                else sample.observed_at
            )
            hours.add(stamp.astimezone(UTC).replace(minute=0, second=0, microsecond=0))
            await write(
                conn,
                entity,
                reading.metric,
                reading.value,
                dims(reading),
                stamp,
                now,
                stamp if interval else None,
                sample.observed_at if interval else None,
            )
        for event in sample.events:
            previous = await (
                await conn.execute(
                    "SELECT observed_at,kind,details FROM gateway_events WHERE gateway_id=%s AND event_id=%s",
                    (gateway, event.event_id),
                )
            ).fetchone()
            if previous and (
                previous["observed_at"],
                previous["kind"],
                previous["details"],
            ) != (event.observed_at, event.kind, event.details):
                raise HTTPException(409, "Event identity conflict")
            await conn.execute(
                "INSERT INTO gateway_events VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (
                    gateway,
                    event.event_id,
                    event.observed_at,
                    event.kind,
                    Jsonb(event.details),
                ),
            )
        for hour in sorted(hours):
            await conn.execute(
                "INSERT INTO gateway_rollup_hours(gateway_id,hour) VALUES(%s,%s) ON CONFLICT(gateway_id,hour) DO UPDATE SET dirty=TRUE",
                (gateway, hour),
            )
        await conn.execute(
            """UPDATE gateway_devices SET latest_at=%s,latest_boot=%s,latest_sequence=%s
            WHERE id=%s AND (latest_at IS NULL OR latest_at<%s)""",
            (
                sample.observed_at,
                sample.boot_id,
                sample.sequence,
                gateway,
                sample.observed_at,
            ),
        )
        inserted += 1
    # Transport contact is separate from the age of the newest measurement.
    await conn.execute(
        "UPDATE gateway_devices SET last_contact=%s WHERE id=%s", (now, gateway)
    )
    return {"accepted": [str(s.sample_id) for s in batch.samples], "inserted": inserted}


async def rollup_hour(conn, gateway, entity, hour, now):
    end = hour + timedelta(hours=1)
    rows = await (
        await conn.execute(
            """SELECT d.metric,d.dimensions,r.value,r.quality FROM readings r
        JOIN measurement_definitions d ON d.id=r.measurement_id
        WHERE d.entity_id=%s AND d.source_id=%s AND d.dimensions->>'resolution'='minute'
          AND r.observed_at>=%s AND r.observed_at<%s""",
            (entity, SOURCE, hour, end),
        )
    ).fetchall()
    groups = {}
    for row in rows:
        dimensions = dict(row["dimensions"])
        key = (row["metric"], json.dumps(dimensions, sort_keys=True))
        groups.setdefault(key, [])
        if row["quality"] == "valid":
            groups[key].append(row["value"])
    for (metric, raw), values in groups.items():
        dimensions = json.loads(raw)
        op = METRICS[metric][3]
        if op in ("total", "distribution"):
            stat = dimensions["statistic"]
            value = (
                (
                    min(values)
                    if stat == "min"
                    else max(values)
                    if stat == "max"
                    else sum(values)
                )
                if values
                else None
            )
            outputs = {stat: value}
        else:
            outputs = {
                "min": min(values) if values else None,
                "max": max(values) if values else None,
                "sum": sum(values) if values else None,
                "count": len(values),
            }
        for stat, value in outputs.items():
            await write(
                conn,
                entity,
                metric,
                value,
                dict(dimensions, resolution="hour", statistic=stat),
                hour,
                now,
                hour,
                end,
            )
    await conn.execute(
        "UPDATE gateway_rollup_hours SET dirty=FALSE,completed_at=%s WHERE gateway_id=%s AND hour=%s",
        (now, gateway, hour),
    )


async def maintain(conn, *, now=None, limit=48, delete=False):
    now = now or datetime.now(UTC)
    processed = deleted = 0
    # Call in a transaction. Row locks coordinate uploads and retries; no long full-history work.
    locked = await (
        await conn.execute("SELECT pg_try_advisory_xact_lock(2026110317) AS locked")
    ).fetchone()
    if not locked["locked"]:
        return {"processed": 0, "deleted": 0, "busy": True}
    hours = await (
        await conn.execute(
            """SELECT h.gateway_id,h.hour,g.entity_id FROM gateway_rollup_hours h
        JOIN gateway_devices g ON g.id=h.gateway_id WHERE h.dirty AND h.hour<%s
        ORDER BY h.hour LIMIT %s FOR UPDATE OF h""",
            (now.replace(minute=0, second=0, microsecond=0), limit),
        )
    ).fetchall()
    for h in hours:
        await rollup_hour(conn, h["gateway_id"], h["entity_id"], h["hour"], now)
        processed += 1
    if delete:
        old = await (
            await conn.execute(
                """SELECT h.gateway_id,h.hour,g.entity_id FROM gateway_rollup_hours h
            JOIN gateway_devices g ON g.id=h.gateway_id WHERE NOT h.dirty AND h.completed_at IS NOT NULL
            AND h.hour + interval '1 hour' < %s ORDER BY h.hour LIMIT %s FOR UPDATE OF h""",
                (now - timedelta(days=90), limit),
            )
        ).fetchall()
        for h in old:
            cur = await conn.execute(
                """DELETE FROM readings r USING measurement_definitions d WHERE r.measurement_id=d.id
                AND d.entity_id=%s AND d.source_id=%s AND d.dimensions->>'resolution'='minute'
                AND r.observed_at>=%s AND r.observed_at<%s""",
                (h["entity_id"], SOURCE, h["hour"], h["hour"] + timedelta(hours=1)),
            )
            deleted += cur.rowcount
            await conn.execute(
                "DELETE FROM gateway_rollup_hours WHERE gateway_id=%s AND hour=%s",
                (h["gateway_id"], h["hour"]),
            )
        await conn.execute(
            "DELETE FROM gateway_receipts WHERE observed_at < %s",
            (now - timedelta(days=40),),
        )
        await conn.execute(
            "DELETE FROM gateway_events WHERE observed_at < %s",
            (now - timedelta(days=1095),),
        )
    return {"processed": processed, "deleted": deleted}


async def history(conn, entity, gateway, metric, start, days):
    """Merge persisted hours and pending minutes without overlap or truncation."""
    resolution = "minute" if days <= 1 else "day" if days > 90 else "hour"
    operation = METRICS[metric][3]
    rows = await (
        await conn.execute(
            """WITH base AS (
        SELECT r.observed_at,r.value,r.quality,d.dimensions,d.unit
        FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
        WHERE d.entity_id=%s AND d.source_id=%s AND d.metric=%s AND r.observed_at>=%s
        AND ((%s='minute' AND d.dimensions->>'resolution'='minute') OR (%s<>'minute' AND (
          (d.dimensions->>'resolution'='hour' AND NOT EXISTS(
            SELECT 1 FROM gateway_rollup_hours h WHERE h.gateway_id=%s AND h.hour=r.observed_at AND h.dirty))
          OR (d.dimensions->>'resolution'='minute' AND NOT EXISTS(
            SELECT 1 FROM gateway_rollup_hours h WHERE h.gateway_id=%s
              AND h.hour=date_trunc('hour',r.observed_at) AND NOT h.dirty AND h.completed_at IS NOT NULL)))))
        ), expanded AS (
          SELECT date_trunc(%s,observed_at) AS time,
            (dimensions-'resolution'-'statistic') || jsonb_build_object('resolution',%s::text,'statistic',s.stat) AS dimensions,
            CASE WHEN s.stat='count' THEN 'count' ELSE unit END AS unit,
            CASE WHEN s.stat='count' AND dimensions->>'statistic'='value' AND %s AND %s<>'minute'
              THEN CASE WHEN quality='valid' THEN 1 ELSE 0 END ELSE value END AS value
          FROM base CROSS JOIN LATERAL (
            SELECT unnest(CASE WHEN %s AND %s<>'minute' AND dimensions->>'resolution'='minute'
              THEN ARRAY['min','max','sum','count'] ELSE ARRAY[dimensions->>'statistic'] END) AS stat
          ) s
        ) SELECT time,dimensions,unit,
          CASE WHEN dimensions->>'statistic'='min' THEN min(value)
               WHEN dimensions->>'statistic'='max' THEN max(value) ELSE sum(value) END AS value,
          CASE WHEN count(value)>0 THEN 'valid' ELSE 'missing' END AS quality
        FROM expanded GROUP BY time,dimensions,unit ORDER BY time,dimensions LIMIT 10001""",
            (
                entity,
                SOURCE,
                metric,
                start,
                resolution,
                resolution,
                gateway,
                gateway,
                resolution,
                resolution,
                operation not in ("total", "distribution"),
                resolution,
                operation not in ("total", "distribution"),
                resolution,
            ),
        )
    ).fetchall()
    if len(rows) > 10000:
        raise HTTPException(422, "Too many series; select a shorter range")
    return rows, resolution
