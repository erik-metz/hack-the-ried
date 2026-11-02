"""Public NASA CMR discovery and opt-in, authenticated ECOSTRESS raster import."""

import asyncio
import hashlib
import json
import os
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from ecostress_raster import BBOX, LAYERS, METHOD, asset_url, download_assets, read_crop
from psycopg.types.json import Jsonb
from publications import acquire, acquisition_error, publish

COLLECTION = "C3998139651-LPCLOUD"
ID = re.compile(r"^ECOv003_L2T_LSTE_\d+_\d+_(\d{2}[C-X][A-Z]{2})_\d{8}T\d{6}_\d+$")


def parse_granules(body, now=None):
    now = now or datetime.now(UTC)
    entries = json.loads(body)["feed"]["entry"]
    if not isinstance(entries, list) or len(entries) > 20:
        raise ValueError("Invalid bounded CMR response")
    scenes = {}
    for entry in entries:
        gid = entry.get("producer_granule_id", "")
        if not ID.fullmatch(gid):
            raise ValueError("Unexpected V003 granule identifier")
        # Dateline tiles can have almost global CMR boxes and match the AOI spuriously.
        if ID.fullmatch(gid)[1] not in {"32UMA", "32UMV"}:
            continue
        stamp = datetime.fromisoformat(entry["time_start"])
        if stamp.tzinfo is None or stamp > now:
            raise ValueError("Invalid ECOSTRESS acquisition time")
        boxes = []
        for box in entry.get("boxes", []):
            south, west, north, east = map(float, box.split())
            if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
                raise ValueError("Invalid CMR bounding box")
            if (
                west < BBOX[2]
                and east > BBOX[0]
                and south < BBOX[3]
                and north > BBOX[1]
            ):
                boxes.append([west, south, east, north])
        if not boxes:
            continue
        assets = {}
        for link in entry.get("links", []):
            if link.get("inherited") or not link.get("rel", "").endswith("/data#"):
                continue
            href = link.get("href", "")
            for layer in LAYERS:
                if href.startswith("https://") and href.endswith(f"_{layer}.tif"):
                    assets[layer] = asset_url(href, gid, layer)
        if set(assets) != set(LAYERS):
            raise ValueError("Required ECOSTRESS assets missing")
        scenes[gid] = {
            "id": "ecostress-" + gid.lower().replace("_", "-"),
            "granule_id": gid,
            "concept_id": entry["id"],
            "acquired_at": stamp.isoformat(),
            "tile": ID.fullmatch(gid)[1],
            "version": "003",
            "bbox": boxes,
            "assets": assets,
            "revision": entry.get("updated", entry.get("revision_id")),
        }
    return sorted(scenes.values(), key=lambda s: s["acquired_at"], reverse=True)


async def import_ecostress(conn, client, source):
    now = datetime.now(UTC)
    scenes = {}
    receipts = []
    # Bounded recent discovery; a full historical backfill is intentionally separate.
    for page in range(1, 4):
        url = (
            source["url"]
            + "?"
            + urlencode(
                {
                    "collection_concept_id": COLLECTION,
                    "page_size": 20,
                    "page_num": page,
                    "bounding_box": ",".join(map(str, BBOX)),
                    "sort_key": "-start_date",
                    "temporal": f"{(now - timedelta(days=90)).isoformat()},{now.isoformat()}",
                }
            )
        )
        response, digest, attempt = await acquire(conn, client, source, url)
        receipts.append((digest, attempt))
        for scene in parse_granules(response.content, now):
            scene["catalog_sha256"] = digest
            scenes[scene["granule_id"]] = scene
        if len(json.loads(response.content)["feed"]["entry"]) < 20:
            break
    ordered = sorted(scenes.values(), key=lambda s: s["acquired_at"], reverse=True)
    token = os.getenv("EARTHDATA_TOKEN")
    enabled = os.getenv("ECOSTRESS_RASTER_ENABLED", "false").lower() == "true"
    state = "not_configured" if not enabled or not token else "ready"
    archive_bytes = await (await conn.execute(
        "SELECT COALESCE(SUM(octet_length(body)),0) FROM collected_file_assets WHERE sha256 IN (SELECT payload_sha256 FROM collection_attempts WHERE source_id=%s)",
        (source["id"] + ":raster",),
    )).fetchone()
    used = 0
    archive_budget = 500 * 1024 * 1024
    stored_bytes = archive_bytes[0]
    for scene in ordered:
        old = await (
            await conn.execute(
                "SELECT metadata FROM entities WHERE id=%s", (scene["id"],)
            )
        ).fetchone()
        raster = old[0].get("raster") if old else None
        stable = hashlib.sha256(
            json.dumps(
                {
                    "method": METHOD,
                    "assets": scene["assets"],
                    "revision": scene["revision"],
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        if (
            raster
            and raster.get("method") == METHOD
            and raster.get("asset_fingerprint") == stable
        ):
            scene["raster"] = raster
        elif state == "ready" and used < 2 and stored_bytes < archive_budget:
            used += 1
            try:
                files = await download_assets(client, scene, token)
                stats, crop, sha, metadata = await asyncio.to_thread(
                    read_crop, scene, files
                )
                if stored_bytes + len(crop) > archive_budget:
                    raise ValueError("ECOSTRESS archive capacity reached")
                stored_bytes += len(crop)
                async with conn.transaction():
                    await conn.execute(
                        "SELECT store_collected_file(%s,%s,'application/x-npz')",
                        (sha, crop),
                    )
                    attempt = await (
                        await conn.execute(
                            "INSERT INTO collection_attempts(source_id,http_status,payload_sha256,status) VALUES (%s,200,%s,'received') RETURNING id",
                            (source["id"] + ":raster", sha),
                        )
                    ).fetchone()
                await conn.commit()
                scene["raster"] = {
                    "method": METHOD,
                    "stats": stats,
                    "grid": metadata,
                    "archive_sha256": sha,
                    "attempt_id": attempt[0],
                    "asset_fingerprint": stable,
                }
            except Exception as exc:  # noqa: BLE001 - isolate one scene; never log credential-bearing URLs
                await conn.rollback()
                await conn.execute(
                    "INSERT INTO collection_attempts(source_id,status,error,error_stage) VALUES (%s,'failed',%s,'processing')",
                    (source["id"] + ":raster", acquisition_error(exc)),
                )
                await conn.commit()
                scene["raster"] = None
                scene["raster_status"] = "failed"
        else:
            scene["raster"] = None
            scene["raster_status"] = (
                "not_configured" if state == "not_configured" else "pending"
            )
    async with conn.transaction():
        for scene in ordered:
            await conn.execute(
                "INSERT INTO entities(id,name,entity_type,metadata) VALUES (%s,%s,'ecostress_scene',%s) ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,updated_at=NOW()",
                (scene["id"], "ECOSTRESS " + scene["acquired_at"], Jsonb(scene)),
            )
            raster = scene["raster"]
            if raster:
                await conn.execute(
                    "UPDATE collection_attempts SET status='success' WHERE id=%s",
                    (raster["attempt_id"],),
                )
                value = raster["stats"]["mean_celsius"]
                if value is not None:
                    await conn.execute(
                        "SELECT write_measurement(%s,'land_surface_temperature_mean','degC',%s,'model',%s,%s,%s::numeric,%s,%s,'valid',NULL,NULL,'instantaneous')",
                        (
                            scene["id"],
                            source["id"],
                            Jsonb(
                                {
                                    "method": METHOD,
                                    "aoi_bbox": list(BBOX),
                                    "raster_sha256": raster["archive_sha256"],
                                }
                            ),
                            datetime.fromisoformat(scene["acquired_at"]),
                            value,
                            now,
                            Jsonb(raster),
                        ),
                    )
        await publish(
            conn,
            source,
            "environment/ecostress/scenes",
            {
                "scenes": ordered,
                "count": len(ordered),
                "raster_status": state,
                "bbox_lon_lat": list(BBOX),
                "catalog_window_days": 90,
                "catalog_limit": 60,
                "note": "Kacheleinträge, keine unabhängigen Überflüge. Oberflächentemperatur nur für gültige wolkenfreie Landpixel.",
            },
            receipts[-1][0],
            now,
        )
        for _, attempt in receipts:
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
        if state == "not_configured":
            await conn.execute(
                "INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'not_configured','Earthdata raster access not configured')",
                (source["id"] + ":raster",),
            )
    await conn.commit()
    return "failed" if any(s.get("raster_status") == "failed" for s in ordered) else "success"
