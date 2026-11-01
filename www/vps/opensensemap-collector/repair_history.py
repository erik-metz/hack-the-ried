"""Recover physical sensor identities from exact receipts; default is read only."""

import argparse
import asyncio
import hashlib
import json
from datetime import UTC, datetime, timedelta

import psycopg
from config import Settings
from normalize import map_phenomenon, parse_timestamp
from psycopg.types.json import Jsonb


def receipt_channels(body, digest, sensor, metric, unit, stamp):
    if hashlib.sha256(body).hexdigest() != digest:
        raise ValueError("openSenseMap receipt checksum mismatch")
    payload = json.loads(body)
    boxes = payload if isinstance(payload, list) else payload.get("boxes", [])
    boxes = [b for b in boxes if "osem-" + b.get("_id", "") == sensor]
    if len(boxes) != 1:
        raise ValueError("A unique source box is required")
    channels = []
    for raw in boxes[0].get("sensors", []):
        sample = raw.get("lastMeasurement") or {}
        if parse_timestamp(sample.get("createdAt")) != stamp:
            continue
        mapped = map_phenomenon(raw.get("title", ""), raw.get("unit", ""),
                                float(str(sample["value"]).replace(",", ".")))
        if mapped is None or (mapped[0], mapped[2]) != (metric, unit):
            continue
        if not raw.get("_id"):
            raise ValueError("Physical sensor identity is missing")
        channels.append({"sensor_id": raw["_id"], "value": mapped[1],
                         "sensor_title": raw.get("title"), "sensor_type": raw.get("sensorType"),
                         "model": boxes[0].get("model")})
    if not channels or len({c["sensor_id"] for c in channels}) != len(channels):
        raise ValueError("Missing or duplicate physical sensor identities")
    return channels


async def state(cur, sensor, metric, unit, stamp):
    params = ("sensor:" + sensor, "legacy-sensor:" + sensor, metric, unit, stamp)
    scope = """d.entity_id=%s AND d.source_id=%s AND d.metric=%s AND d.unit=%s
        AND d.dimensions='{}' AND d.basis IN ('observed','unknown') AND r.observed_at=%s"""
    await cur.execute(f"""SELECT d.id,d.basis,to_jsonb(r)::text FROM readings r
        JOIN measurement_definitions d ON d.id=r.measurement_id WHERE {scope} ORDER BY d.id""", params)
    native = await cur.fetchall()
    await cur.execute(f"""SELECT to_jsonb(r)::text FROM reading_revisions r
        JOIN measurement_definitions d ON d.id=r.measurement_id WHERE {scope}
        ORDER BY d.id,r.revision""", params)
    revisions = await cur.fetchall()
    await cur.execute("""SELECT value FROM sensor_data WHERE sensor_id=%s AND metric=%s
        AND unit=%s AND timestamp=%s ORDER BY value""", (sensor, metric, unit, stamp))
    legacy = await cur.fetchall()
    return native, revisions, legacy


async def repair(conn, start, end, apply=False):
    async with conn.cursor() as cur:
        await cur.execute("SET statement_timeout='300s'")
        await cur.execute("SET lock_timeout='10s'")
        await cur.execute("SET max_parallel_workers_per_gather=0")
        await cur.execute("""SELECT sensor_id,metric,unit,timestamp FROM sensor_data
            WHERE sensor_id LIKE 'osem-%%' AND timestamp >= %s AND timestamp < %s
            GROUP BY sensor_id,metric,unit,timestamp HAVING count(DISTINCT value)>1
            ORDER BY sensor_id,metric,unit,timestamp""", (start, end))
        keys = await cur.fetchall()
        plan = []
        for sensor, metric, unit, stamp in keys:
            baseline = await state(cur, sensor, metric, unit, stamp)
            native, revisions, legacy = baseline
            observed = [json.loads(text) for _, basis, text in native if basis == "observed"]
            if len(observed) != 1:
                raise ValueError("A unique original observed reading is required")
            observed_id = observed[0]["measurement_id"]
            versions = [json.loads(text)["previous_record"] for text, in revisions
                        if json.loads(text)["measurement_id"] == observed_id] + observed
            receipts = {}
            verified = set()
            for version in versions:
                if version["provenance"].get("source") != "opensensemap":
                    raise ValueError("Unattributed native revision")
                collected = datetime.fromisoformat(version["collected_at"])
                await cur.execute("""SELECT a.id,p.sha256,p.body FROM collection_attempts a
                    JOIN collected_payloads p ON p.sha256=a.payload_sha256
                    WHERE a.source_id='opensensemap' AND a.status='success' AND a.http_status=200
                    AND a.received_at >= %s AND a.received_at < %s""",
                    (collected - timedelta(seconds=1), collected + timedelta(seconds=1)))
                evidence = await cur.fetchall()
                if len(evidence) != 1:
                    raise ValueError("A unique original receipt is required for every revision")
                attempt, digest, body = evidence[0]
                channels = receipt_channels(body, digest, sensor, metric, unit, stamp)
                values = {c["value"] for c in channels}
                if float(version["value"]) not in values:
                    raise ValueError("Native value is not explained by its source receipt")
                verified.update(values)
                receipts[(collected, attempt)] = (digest, channels)
            if not {v for v, in legacy} <= verified:
                raise ValueError("Unexplained legacy value; no repair applied")
            if any(float(json.loads(text)["value"]) not in verified for _, _, text in native):
                raise ValueError("Unexplained native compatibility value")
            if len({c["sensor_id"] for _, cs in receipts.values() for c in cs}) < 2:
                raise ValueError("This is not a proven physical-sensor collision")
            plan.append((sensor, metric, unit, stamp, baseline, receipts))
        if apply:
            async with conn.transaction():
                await cur.execute("SELECT pg_advisory_xact_lock(734223,1)")
                for sensor, metric, unit, stamp, baseline, receipts in plan:
                    ids = [row[0] for row in baseline[0]]
                    await cur.execute("SELECT 1 FROM readings WHERE measurement_id=ANY(%s) AND observed_at=%s FOR UPDATE", (ids, stamp))
                    if await state(cur, sensor, metric, unit, stamp) != baseline:
                        raise ValueError("Source rows changed; repeat the receipt audit")
                    await cur.execute("""SELECT 1 FROM readings r JOIN measurement_definitions d
                        ON d.id=r.measurement_id WHERE d.entity_id=%s AND d.metric=%s AND d.unit=%s
                        AND d.source_id=%s AND d.dimensions ? 'sensor_id' AND r.observed_at=%s LIMIT 1""",
                        ("sensor:" + sensor, metric, unit, "legacy-sensor:" + sensor, stamp))
                    if await cur.fetchone():
                        raise ValueError("Identified native history already exists; stop for review")
                    latest = max(receipts)
                    await cur.execute("""INSERT INTO opensensemap_legacy_repairs
                        (sensor_id,metric,unit,observed_at,original_rows,original_native_records,
                         original_native_revisions,collection_attempt_id)
                        SELECT %s,%s,%s,%s,
                        (SELECT jsonb_agg(to_jsonb(t)) FROM sensor_data t
                         WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s),
                        (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM readings r
                         WHERE measurement_id=ANY(%s) AND observed_at=%s),
                        (SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]') FROM reading_revisions v
                         WHERE measurement_id=ANY(%s) AND observed_at=%s),%s""",
                        (sensor, metric, unit, stamp, sensor, metric, unit, stamp, ids, stamp, ids, stamp, latest[1]))
                    await cur.execute("DELETE FROM reading_revisions WHERE measurement_id=ANY(%s) AND observed_at=%s", (ids, stamp))
                    await cur.execute("DELETE FROM readings WHERE measurement_id=ANY(%s) AND observed_at=%s", (ids, stamp))
                    await cur.execute("DELETE FROM sensor_data WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s",
                                      (sensor, metric, unit, stamp))
                    for (collected, attempt), (digest, channels) in sorted(receipts.items()):
                        for channel in channels:
                            provenance = {**channel, "source": "opensensemap", "box_id": sensor[5:],
                                          "collection_attempt_id": attempt, "payload_sha256": digest}
                            provenance.pop("value")
                            await cur.execute("""SELECT write_measurement(%s,%s,%s,%s,'observed',%s,%s,%s::numeric,%s,%s,
                                'valid',NULL,NULL,'instantaneous')""",
                                ("sensor:" + sensor, metric, unit, "legacy-sensor:" + sensor,
                                 Jsonb({"sensor_id": channel["sensor_id"]}), stamp, channel["value"], collected, Jsonb(provenance)))
                    representative = receipts[latest][1][-1]["value"]
                    await cur.execute("INSERT INTO sensor_data(timestamp,sensor_id,metric,value,unit) VALUES (%s,%s,%s,%s,%s)",
                                      (stamp, sensor, metric, representative, unit))
                    await cur.execute("UPDATE sensor_latest SET value=%s WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s",
                                      (representative, sensor, metric, unit, stamp))
        return {"verified_keys": len(plan), "legacy_rows": sum(len(p[4][2]) for p in plan),
                "native_rows": sum(len(p[4][0]) for p in plan),
                "native_revisions": sum(len(p[4][1]) for p in plan), "applied": apply}


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
