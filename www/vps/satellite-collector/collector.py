"""Full satellite catalog acquisition and regional historical positions."""
import argparse
import asyncio
import json
import logging
import os
import random
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import psycopg
from psycopg.types.json import Jsonb
from satellite_orbits import element, regional_position, utc

LOG = logging.getLogger("satellite-collector")
SOURCE = "space-track"
METRICS = {"latitude": "deg", "longitude": "deg", "altitude_km": "km", "speed_km_s": "km/s"}

def identifiers(value):
    if value.strip().lower() == "all":
        return None
    if not re.fullmatch(r"[0-9]+(?:,[0-9]+)*", value):
        raise ValueError("SATELLITE_NORAD_IDS must be comma-separated numeric identifiers")
    ids = sorted({int(part) for part in value.split(",")})
    if len(ids) > 500 or any(not 1 <= n <= 999999999 for n in ids):
        raise ValueError("Select between 1 and 500 satellites")
    return ids

def secret(name):
    filename = os.getenv(name + "_FILE")
    return Path(filename).read_text().strip() if filename else os.getenv(name, "").strip()

def connect():
    return psycopg.connect(host=os.getenv("DB_HOST", "timescaledb"), port=os.getenv("DB_PORT", "5432"),
                          dbname=os.environ["DB_NAME"], user=os.environ["DB_USER"],
                          password=os.environ["DB_PASSWORD"], autocommit=True)

def ingest(conn, records, ids, now=None):
    now = now or datetime.now(UTC)
    accepted = 0
    if not isinstance(records, list) or len(records) > 100000:
        raise ValueError("Invalid OMM collection")
    with conn.transaction():
        for raw in records:
            norad, epoch, _, version = element(raw)
            if ids is not None and norad not in ids:
                continue
            published = utc(raw.get("CREATION_DATE", raw["EPOCH"]))
            if epoch > now + timedelta(days=1) or published > now + timedelta(minutes=5):
                raise ValueError("Future element publication")
            key = f"satellite:{norad}"
            conn.execute("""INSERT INTO entities(id,name,entity_type,metadata)
                VALUES (%s,%s,'satellite',%s) ON CONFLICT(id) DO UPDATE SET
                name=EXCLUDED.name, metadata=entities.metadata||EXCLUDED.metadata, updated_at=NOW()""",
                (key, str(raw.get("OBJECT_NAME") or norad)[:120], Jsonb({"norad_id": norad,
                 "international_designator": raw.get("OBJECT_ID"), "source": SOURCE,
                 "gp_seen_at": now.isoformat(), "object_type": raw.get("OBJECT_TYPE", "PAYLOAD")})))
            # Publication time plus immutable source/version distinguishes same-epoch element sets.
            conn.execute("SELECT write_measurement(%s,'orbital_elements','rev/day',%s,'reported','{}',%s,%s::numeric,%s,%s)",
                         (key, SOURCE, published, float(raw["MEAN_MOTION"]), now,
                          Jsonb({"omm": raw, "element_version": version, "element_epoch": epoch.isoformat()})))
            accepted += 1
    return accepted

def load_elements(conn):
    rows = conn.execute("""SELECT d.entity_id,r.provenance FROM measurement_definitions d
        JOIN entities e ON e.id=d.entity_id JOIN latest_readings r ON r.measurement_id=d.id
        WHERE d.metric='orbital_elements' AND d.source_id='space-track'
        AND COALESCE(e.metadata->>'decayed','false') != 'true'""").fetchall()
    compiled = []
    for key, provenance in rows:
        try:
            compiled.append((key, element(provenance["omm"])))
        except (KeyError, TypeError, ValueError):
            LOG.warning("Invalid stored orbit for %s", key)
    return compiled

def store_positions(conn, now, compiled=None):
    compiled = load_elements(conn) if compiled is None else compiled
    inside = 0
    present = set()
    with conn.transaction():
        for key, orbit in compiled:
            sample = regional_position(orbit, now)
            if sample is None:
                continue
            inside += 1
            present.add(key)
            for metric, unit in METRICS.items():
                conn.execute("SELECT write_measurement(%s,%s,%s,%s,'model','{}',%s,%s::numeric,%s,%s)",
                             (key, metric, unit, SOURCE, now, sample[metric], now,
                              Jsonb({"element_version": sample["element_version"],
                                     "element_epoch": sample["element_epoch"], "propagator": "sgp4-2.25"})))
        previous = {row[0] for row in conn.execute("""SELECT d.entity_id FROM measurement_definitions d
            JOIN latest_readings r ON r.measurement_id=d.id WHERE d.metric='regional_presence'
            AND d.source_id='space-track' AND r.value=1""").fetchall()}
        for key in present ^ previous:
            conn.execute("SELECT write_measurement(%s,'regional_presence','1',%s,'model','{}',%s,%s::numeric,%s,%s)",
                         (key, SOURCE, now, int(key in present), now, Jsonb({"region": "ried", "sampling_seconds": 10})))
    return inside

def ingest_catalog(conn, records, now):
    if not isinstance(records, list) or not records or len(records) > 100000:
        raise ValueError("Invalid satellite catalog")
    validated = []
    for raw in records:
        norad = int(raw["NORAD_CAT_ID"])
        if not 1 <= norad <= 999999999 or raw.get("OBJECT_TYPE") != "PAYLOAD":
            raise ValueError("Invalid catalog satellite")
        validated.append((norad, raw))
    with conn.transaction():
        for norad, raw in validated:
            decayed = bool(raw.get("DECAY"))
            key = f"satellite:{norad}"
            conn.execute("""INSERT INTO entities(id,name,entity_type,metadata)
                VALUES (%s,%s,'satellite',%s) ON CONFLICT(id) DO UPDATE SET
                name=EXCLUDED.name,metadata=entities.metadata||EXCLUDED.metadata,updated_at=NOW()""",
                (key, str(raw.get("SATNAME") or raw.get("OBJECT_NAME") or norad)[:120],
                 Jsonb({"norad_id": norad, "source": SOURCE, "decayed": decayed,
                        "catalog_seen_at": now.isoformat(), "catalog": raw})))
            # Only changed catalog records create a new historical reading.
            previous = conn.execute("""SELECT r.provenance->'catalog' FROM latest_readings r
                JOIN measurement_definitions d ON d.id=r.measurement_id
                WHERE d.entity_id=%s AND d.metric='catalog_status' AND d.source_id=%s""", (key, SOURCE)).fetchone()
            if previous is None or previous[0] != raw:
                conn.execute("SELECT write_measurement(%s,'catalog_status','1',%s,'reported','{}',%s,%s::numeric,%s,%s)",
                             (key, SOURCE, now, 0 if decayed else 1, now, Jsonb({"catalog": raw})))
    return len(validated)

def reserve_request(conn, field, due, now):
    with conn.transaction():
        row = conn.execute("SELECT metadata FROM entities WHERE id='satellite:feed' FOR UPDATE").fetchone()
        metadata = row[0] if row else {}
        if metadata.get(field) and utc(metadata[field]) > now:
            return False
        conn.execute("""INSERT INTO entities(id,name,entity_type,metadata)
            VALUES ('satellite:feed','Space-Track collector','data_source',%s)
            ON CONFLICT(id) DO UPDATE SET metadata=entities.metadata||EXCLUDED.metadata""",
            (Jsonb({field: due.isoformat()}),))
    return True

def next_catalog_time(now):
    candidate = now.replace(hour=17, minute=5, second=0, microsecond=0)
    return candidate if candidate > now else candidate + timedelta(days=1)

async def refresh(conn, ids, identity, password):
    now = datetime.now(UTC)
    # Persistent cooldown survives restarts and failed requests. One collector owns acquisition.
    gp_due = reserve_request(conn, "next_attempt", now + timedelta(seconds=3600+random.randint(1, 120)), now)
    catalog_due = (now.hour, now.minute) >= (17, 5) and reserve_request(conn, "next_catalog_attempt", next_catalog_time(now), now)
    if not gp_due and not catalog_due:
        return False
    async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
        login = await client.post("https://www.space-track.org/ajaxauth/login",
                                  data={"identity": identity, "password": password})
        login.raise_for_status()
        if gp_due:
            selection = "OBJECT_TYPE/PAYLOAD" if ids is None else "NORAD_CAT_ID/" + ",".join(map(str, ids))
            query = "https://www.space-track.org/basicspacedata/query/class/gp/" + selection + "/DECAY_DATE/null-val/EPOCH/%3Enow-10/format/json"
            response = await client.get(query)
            response.raise_for_status()
            count = ingest(conn, response.json(), ids, now)
            conn.execute("UPDATE entities SET metadata=metadata||%s,updated_at=NOW() WHERE id='satellite:feed'",
                         (Jsonb({"last_success": now.isoformat(), "count": count, "scope": "all" if ids is None else "selection"}),))
            LOG.info("Imported %s orbital element sets", count)
        if catalog_due:
            response = await client.get("https://www.space-track.org/basicspacedata/query/class/satcat/OBJECT_TYPE/PAYLOAD/format/json")
            response.raise_for_status()
            count = ingest_catalog(conn, response.json(), now)
            conn.execute("UPDATE entities SET metadata=metadata||%s WHERE id='satellite:feed'",
                         (Jsonb({"last_catalog_success": now.isoformat(), "catalog_count": count}),))
            LOG.info("Reconciled %s catalog satellites", count)
    return True

async def run(args):
    ids = identifiers(os.getenv("SATELLITE_NORAD_IDS", "all"))
    identity, password = secret("SPACE_TRACK_IDENTITY"), secret("SPACE_TRACK_PASSWORD")
    if not args.history_file and (not identity or not password):
        raise ValueError("Configure Space-Track server secrets before enabling the collector")
    with connect() as conn:
        locked = conn.execute("SELECT pg_try_advisory_lock(20261007,1)").fetchone()[0]
        if not locked:
            raise RuntimeError("A satellite collector is already running")
        if args.history_file:
            records = json.loads(Path(args.history_file).read_text())
            # Historical imports are ordered; latest_readings cannot regress.
            records.sort(key=lambda r: utc(r.get("CREATION_DATE", r["EPOCH"])))
            LOG.info("Imported %s historical elements", ingest(conn, records, ids))
            return
        compiled = load_elements(conn)
        loaded_at = datetime.now(UTC)
        while True:
            try:
                if await refresh(conn, ids, identity, password):
                    compiled = load_elements(conn)
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                LOG.warning("Space-Track import failed; retaining previous elements, retry after cooldown")
            now = datetime.now(UTC).replace(microsecond=0)
            if now - loaded_at >= timedelta(seconds=60):
                compiled = load_elements(conn)
                loaded_at = now
            inside = store_positions(conn, now, compiled)
            Path("/tmp/satellite-heartbeat").touch()
            LOG.info("Regional sample: %s satellites inside Ried, %s orbits loaded", inside, len(compiled))
            await asyncio.sleep(10)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--history-file", help="Import locally downloaded Space-Track GP_HISTORY OMM JSON")
    asyncio.run(run(parser.parse_args()))
