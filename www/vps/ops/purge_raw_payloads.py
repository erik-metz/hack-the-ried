"""Retire raw response bodies after deploying metadata-only collectors.

Run from the registry-worker container (its parser dependencies are required).
No measurement, publication, revision, archive or checksum catalogue row is deleted.
The explicit --apply phase preserves served files and parsed input caches first.
"""

import argparse
import asyncio
import hashlib
import json
import os

import psycopg
from psycopg.types.json import Jsonb


async def preserve_products(conn):
    await conn.execute("""INSERT INTO collected_file_assets(sha256,body,content_type)
        SELECT p.sha256,p.body,p.content_type FROM collected_payloads p
        WHERE p.body IS NOT NULL AND (p.content_type='application/x-npz' OR EXISTS (
            SELECT 1 FROM collected_map_tiles t WHERE t.payload_sha256=p.sha256))
        ON CONFLICT DO NOTHING""")
    missing = await (
        await conn.execute("""SELECT count(*) FROM collected_map_tiles t
        LEFT JOIN collected_file_assets f ON f.sha256=t.payload_sha256 WHERE f.sha256 IS NULL""")
    ).fetchone()
    if missing[0]:
        raise ValueError("A served map tile has no preserved file")
    async with conn.cursor(name="served_file_integrity") as cursor:
        await cursor.execute("SELECT sha256,body FROM collected_file_assets")
        async for sha, body in cursor:
            if hashlib.sha256(bytes(body)).hexdigest() != sha:
                raise ValueError("A preserved file product has an invalid checksum")
    from zakb import minimal_address_inventory, parse_ical

    rows = await (
        await conn.execute("""SELECT c.source_id,c.item_key,p.body FROM collection_checkpoints c
        JOIN collected_payloads p ON p.sha256=c.payload_sha256
        WHERE c.parsed_data IS NULL AND p.body IS NOT NULL""")
    ).fetchall()
    for source, key, body in rows:
        raw = bytes(body)
        if raw.lstrip().startswith(b"BEGIN:VCALENDAR"):
            data = parse_ical(raw, {})
        elif key.startswith("address-inventory:"):
            data = minimal_address_inventory(json.loads(raw))
        else:
            continue
        await conn.execute(
            "UPDATE collection_checkpoints SET parsed_data=%s WHERE source_id=%s AND item_key=%s",
            (Jsonb(data), source, key),
        )


async def preserve_gbif_links(conn):
    from inaturalist import inaturalist_id

    region = await (
        await conn.execute(
            "SELECT metadata FROM entities WHERE id='environment:gbif:ried' AND NOT is_hidden"
        )
    ).fetchone()
    if not region or not region[0].get("snapshot_sha256"):
        return
    snapshot = region[0]["snapshot_sha256"]
    current = await (
        await conn.execute(
            """SELECT DISTINCT e.id,e.metadata->>'gbif_id' FROM entities e
        JOIN measurement_definitions d ON d.entity_id=e.id JOIN readings r ON r.measurement_id=d.id
        WHERE NOT e.is_hidden AND d.source_id='environment-gbif' AND d.dimensions->>'snapshot_sha256'=%s""",
            (snapshot,),
        )
    ).fetchall()
    receipts = await (
        await conn.execute("""SELECT payload_sha256 FROM collection_attempts WHERE source_id='environment-gbif'
        AND status='success' AND http_status=200 ORDER BY id DESC LIMIT 10""")
    ).fetchall()
    pages = []
    for length in range(1, len(receipts) + 1):
        candidate = list(reversed(receipts[:length]))
        if (
            hashlib.sha256("".join(r[0] for r in candidate).encode()).hexdigest()
            == snapshot
        ):
            pages = candidate
            break
    records = {}
    for (digest,) in pages:
        row = await (
            await conn.execute(
                "SELECT body FROM collected_payloads WHERE sha256=%s", (digest,)
            )
        ).fetchone()
        if row and row[0] is not None:
            body = bytes(row[0])
            if hashlib.sha256(body).hexdigest() != digest:
                raise ValueError("GBIF receipt checksum mismatch")
            records.update(
                {str(r["key"]): r for r in json.loads(body).get("results", [])}
            )
    for entity, key in current:
        record = records.get(key)
        if record is None:
            continue  # Never invent proof for an unavailable historical origin.
        ids = sorted(
            {
                identifier
                for field in ("occurrenceID", "references", "identifier")
                if (identifier := inaturalist_id(record.get(field))) is not None
            }
        )
        await conn.execute(
            "UPDATE entities SET metadata=metadata || %s WHERE id=%s",
            (
                Jsonb(
                    {
                        "inaturalist_ids": ids,
                        "origin_links_checked": True,
                        "origin_snapshot_sha256": snapshot,
                    }
                ),
                entity,
            ),
        )


async def catalogue_hash(conn):
    rows = await (
        await conn.execute(
            "SELECT month,generated_at,reading_count,size_bytes,files FROM data_archives ORDER BY month"
        )
    ).fetchall()
    return hashlib.sha256(
        json.dumps(rows, default=str, sort_keys=True).encode()
    ).hexdigest()


async def cleanup(conn, apply=False, vacuum=False):
    before = await catalogue_hash(conn)
    size = (
        await (
            await conn.execute("SELECT pg_total_relation_size('collected_payloads')")
        ).fetchone()
    )[0]
    summary = await (
        await conn.execute(
            "SELECT count(*),COALESCE(sum(octet_length(body)),0) FROM collected_payloads WHERE body IS NOT NULL"
        )
    ).fetchone()
    print(
        json.dumps(
            {
                "stage": "preflight",
                "raw_bodies": summary[0],
                "raw_bytes": summary[1],
                "table_bytes": size,
                "apply": apply,
            }
        ),
        flush=True,
    )
    if not apply:
        return
    # Refuse a concurrent purge; ingestion should already use fingerprints only.
    locked = (
        await (await conn.execute("SELECT pg_try_advisory_lock(72819403)")).fetchone()
    )[0]
    if not locked:
        raise RuntimeError("Another raw-payload cleanup is running")
    async with conn.transaction():
        await preserve_products(conn)
        await preserve_gbif_links(conn)
    count = 0
    while True:
        async with conn.transaction():
            result = await conn.execute("""WITH batch AS (
                SELECT sha256 FROM collected_payloads WHERE body IS NOT NULL LIMIT 2000 FOR UPDATE)
                UPDATE collected_payloads p SET size_bytes=COALESCE(size_bytes,octet_length(body)),body=NULL
                FROM batch WHERE p.sha256=batch.sha256""")
        count += result.rowcount
        if count % 40000 == 0 or not result.rowcount:
            print(json.dumps({"stage": "purge", "cleared_bodies": count}), flush=True)
        if not result.rowcount:
            break
    # A database guard prevents an old or future collector from restoring raw storage.
    exists = await (
        await conn.execute(
            "SELECT 1 FROM pg_constraint WHERE conrelid='collected_payloads'::regclass AND conname='collected_payloads_metadata_only'"
        )
    ).fetchone()
    if not exists:
        await conn.execute(
            "ALTER TABLE collected_payloads ADD CONSTRAINT collected_payloads_metadata_only CHECK(body IS NULL) NOT VALID"
        )
    await conn.execute(
        "ALTER TABLE collected_payloads VALIDATE CONSTRAINT collected_payloads_metadata_only"
    )
    if vacuum:
        await conn.execute("SET lock_timeout='10s'")
        await conn.execute("VACUUM (FULL,ANALYZE) collected_payloads")
    if await catalogue_hash(conn) != before:
        raise ValueError(
            "Archive catalogue changed during maintenance; review concurrent publication"
        )
    after = (
        await (
            await conn.execute("SELECT pg_total_relation_size('collected_payloads')")
        ).fetchone()
    )[0]
    print(
        json.dumps(
            {
                "stage": "complete",
                "cleared_bodies": count,
                "table_bytes_before": size,
                "table_bytes_after": after,
                "archive_catalogue_unchanged": True,
            }
        ),
        flush=True,
    )


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--vacuum", action="store_true")
    args = parser.parse_args()
    config = {
        "host": os.environ.get("DB_HOST", "timescaledb"),
        "port": os.environ.get("DB_PORT", "5432"),
        "dbname": os.environ.get("DB_NAME"),
        "user": os.environ.get("DB_USER"),
        "password": os.environ.get("DB_PASSWORD"),
    }
    if os.environ.get("COLLECTOR_TEST_DATABASE_URL"):
        config = {"conninfo": os.environ["COLLECTOR_TEST_DATABASE_URL"]}
    async with await psycopg.AsyncConnection.connect(**config, autocommit=True) as conn:
        await cleanup(conn, args.apply, args.vacuum)


if __name__ == "__main__":
    asyncio.run(main())
