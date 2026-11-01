"""Audit UBA index corrections against saved receipts; apply only explicitly.

Only the compatibility projection is repaired. Original native revisions,
timestamps and source receipts remain untouched. Every replaced legacy row,
including duplicate multiplicity, is saved in uba_legacy_repairs atomically.
"""

import argparse
import asyncio
import hashlib
import json
from datetime import UTC, datetime, timedelta

import psycopg
from config import Settings
from normalize import parse_uba_timestamp
from storage import write_legacy


def receipt_value(body, digest, sensor, stamp):
    if hashlib.sha256(body).hexdigest() != digest:
        raise ValueError("UBA source receipt checksum mismatch")
    payload = json.loads(body)
    code_index = payload["stations"]["indices"].index("station code")
    station_ids = [key for key, row in payload["stations"]["data"].items()
                   if "uba-" + row[code_index].strip().lower() == sensor]
    values = [slot[1] for key in station_ids
              for time, slot in payload["airquality"]["data"].get(key, {}).items()
              if parse_uba_timestamp(time) == stamp and isinstance(slot, list) and len(slot) >= 2]
    if len(values) != 1 or not isinstance(values[0], (int, float)) or values[0] <= 0:
        raise ValueError("UBA receipt does not identify one positive air-quality index")
    return values[0]


async def repair(conn, start, end, apply=False):
    async with conn.cursor() as cur:
        await cur.execute("SET statement_timeout='300s'")
        await cur.execute("SET max_parallel_workers_per_gather=0")
        await cur.execute(
            """SELECT sensor_id,metric,unit,timestamp,array_agg(value ORDER BY value)
            FROM sensor_data WHERE sensor_id LIKE 'uba-%%' AND timestamp >= %s AND timestamp < %s
            GROUP BY sensor_id,metric,unit,timestamp HAVING count(DISTINCT value)>1
            ORDER BY timestamp,sensor_id,metric,unit""", (start, end),
        )
        conflicts = await cur.fetchall()
        plan = []
        for sensor, metric, unit, stamp, originals in conflicts:
            if (metric, unit) != ("air_quality_index", "index"):
                raise ValueError("Unexplained UBA conflict: only receipt-backed index corrections are supported")
            await cur.execute(
                """SELECT r.measurement_id,r.value,r.collected_at,r.provenance FROM readings r
                JOIN measurement_definitions d ON d.id=r.measurement_id
                WHERE d.entity_id=%s AND d.source_id=%s AND d.basis='observed' AND d.dimensions='{}'
                AND d.metric=%s AND d.unit=%s AND r.observed_at=%s""",
                ("sensor:" + sensor, "legacy-sensor:" + sensor, metric, unit, stamp),
            )
            records = await cur.fetchall()
            if len(records) != 1:
                raise ValueError("A unique native UBA reading is required")
            measurement_id, chosen, collected, provenance = records[0]
            await cur.execute(
                "SELECT previous_record FROM reading_revisions WHERE measurement_id=%s AND observed_at=%s",
                (measurement_id, stamp),
            )
            versions = [row[0] for row in await cur.fetchall()]
            versions.append({"value": str(chosen), "collected_at": collected.isoformat(), "provenance": provenance})
            verified = set()
            chosen_attempt = None
            for version in versions:
                if version["provenance"].get("source") != "uba":
                    raise ValueError("Native UBA revision has no source attribution")
                received = datetime.fromisoformat(version["collected_at"])
                await cur.execute(
                    """SELECT a.id,p.sha256,p.body FROM collection_attempts a
                    JOIN collected_payloads p ON p.sha256=a.payload_sha256
                    WHERE a.source_id='uba' AND a.status='success' AND a.http_status=200
                    AND a.received_at >= %s AND a.received_at < %s ORDER BY a.id""",
                    (received - timedelta(seconds=1), received + timedelta(seconds=1)),
                )
                evidence = await cur.fetchall()
                if len(evidence) != 1:
                    raise ValueError("A unique original UBA receipt is required for every revision")
                attempt, digest, body = evidence[0]
                value = receipt_value(body, digest, sensor, stamp)
                if float(version["value"]) != value:
                    raise ValueError("UBA receipt disagrees with native revision")
                verified.add(value)
                if version is versions[-1]:
                    chosen_attempt = attempt
            if not set(originals) <= verified or float(chosen) not in verified:
                raise ValueError("Unexplained legacy values; no repair was applied")
            plan.append((sensor, metric, unit, stamp, originals, float(chosen), chosen_attempt))
        if apply:
            async with conn.transaction():
                await cur.execute("SELECT pg_advisory_xact_lock(734225,1)")
                for sensor, metric, unit, stamp, originals, chosen, attempt in plan:
                    await cur.execute(
                        """SELECT value FROM sensor_data WHERE sensor_id=%s AND metric=%s AND unit=%s
                        AND timestamp=%s ORDER BY value FOR UPDATE""", (sensor, metric, unit, stamp),
                    )
                    if [r[0] for r in await cur.fetchall()] != originals:
                        raise ValueError("UBA legacy rows changed; re-run the receipt audit")
                    # Refuse a concurrent native correction after the audit.
                    await cur.execute(
                        """SELECT r.value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
                        WHERE d.entity_id=%s AND d.source_id=%s AND d.basis='observed' AND d.dimensions='{}'
                        AND d.metric=%s AND d.unit=%s AND r.observed_at=%s FOR SHARE OF r""",
                        ("sensor:" + sensor, "legacy-sensor:" + sensor, metric, unit, stamp),
                    )
                    if await cur.fetchall() != [(chosen,)]:
                        raise ValueError("Native UBA reading changed; re-run the receipt audit")
                    await write_legacy(cur, sensor, metric, unit, stamp, chosen, attempt)
                    await cur.execute(
                        """UPDATE sensor_latest SET value=%s WHERE sensor_id=%s AND metric=%s
                        AND unit=%s AND timestamp=%s""", (chosen, sensor, metric, unit, stamp),
                    )
        return {"verified_keys": len(plan), "original_rows": sum(len(p[4]) for p in plan), "applied": apply}


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    start = datetime.strptime(args.month, "%Y-%m").replace(tzinfo=UTC)
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    async with await psycopg.AsyncConnection.connect(**Settings.from_env().db, autocommit=True) as conn:
        print(json.dumps(await repair(conn, start, end, args.apply)))


if __name__ == "__main__":
    asyncio.run(main())
