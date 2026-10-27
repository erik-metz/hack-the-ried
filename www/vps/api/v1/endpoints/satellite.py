"""Archived Sentinel metadata, real AOI indices and crop-based raster tiles."""

import asyncio
import hashlib
import io
import json
import zipfile
from datetime import date
from typing import Annotated

import psycopg_pool
from dependencies import get_db_pool
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from satellite_raster_tiles import METHOD, render_preview, render_tile

router = APIRouter(prefix="/satellite", tags=["Satellite & Earth Observation"])
DbPool = Annotated[psycopg_pool.AsyncConnectionPool, Depends(get_db_pool)]


def scene_from_entity(row):
    meta = row.get("metadata", {})
    raster = meta.get("raster")
    if not raster or raster.get("method") != METHOD:
        raster = None
    return {
        "id": row["id"],
        "name": row["name"],
        "sceneId": meta.get("scene_id"),
        "date": meta.get("date"),
        "cloudCoverPercent": meta.get("cloud_cover"),
        "vegetationPercent": meta.get("vegetation_cover"),
        "waterPercent": meta.get("water_cover"),
        "assets": meta.get("assets", {}),
        "raster": raster,
        "ndviMean": raster["indices"]["ndvi"]["mean"] if raster else None,
        "droughtStressedAreaHa": None,
    }


@router.get("/scenes")
async def get_satellite_scenes(
    pool: DbPool, limit: int = Query(default=20, ge=1, le=100)
):
    async with pool.connection() as conn:
        rows = await (
            await conn.execute(
                "SELECT id,name,metadata FROM entities WHERE entity_type='satellite_scene' AND NOT is_hidden ORDER BY metadata->>'date' DESC LIMIT %s",
                (limit,),
            )
        ).fetchall()
    scenes = [scene_from_entity(r) for r in rows]
    return {
        "scenes": scenes,
        "count": len(scenes),
        "summary": {"total_scenes": len(scenes)},
    }


@router.get("/latest")
async def get_latest_satellite_scene(pool: DbPool):
    data = await get_satellite_scenes(pool, limit=1)
    if not data["scenes"]:
        raise HTTPException(404, "No archived Sentinel scenes available")
    return {"latest": data["scenes"][0], "summary": data["summary"]}


async def archived_crop(conn, scene_id):
    if scene_id == "latest":
        row = await (
            await conn.execute(
                "SELECT id,name,metadata FROM entities WHERE entity_type='satellite_scene' AND NOT is_hidden AND metadata->'raster'->>'method'=%s ORDER BY metadata->>'date' DESC LIMIT 1",
                (METHOD,),
            )
        ).fetchone()
    else:
        row = await (
            await conn.execute(
                "SELECT id,name,metadata FROM entities WHERE entity_type='satellite_scene' AND NOT is_hidden AND (id=%s OR metadata->>'scene_id'=%s) LIMIT 1",
                (scene_id, scene_id),
            )
        ).fetchone()
    if not row:
        raise HTTPException(404, "No archived scene crop available")
    raster = row["metadata"].get("raster")
    if not raster or raster.get("method") != METHOD:
        raise HTTPException(404, "Raster indices have not been computed for this scene")
    sha = raster["archive_sha256"]
    payload = await (
        await conn.execute(
            "SELECT p.body FROM collected_payloads p JOIN collection_attempts a ON a.payload_sha256=p.sha256 WHERE p.sha256=%s AND p.content_type='application/x-npz' AND a.id=%s AND a.status='success' AND a.source_id='copernicus-sentinel2:raster'",
            (sha, raster["attempt_id"]),
        )
    ).fetchone()
    if not payload or hashlib.sha256(bytes(payload["body"])).hexdigest() != sha:
        raise HTTPException(503, "Archived raster evidence unavailable or invalid")
    return bytes(payload["body"])


@router.get("/tiles/{scene_id}/{z}/{x}/{y}.png")
async def get_satellite_tile(
    scene_id: str,
    z: int,
    x: int,
    y: int,
    pool: DbPool,
    layer: str = Query(default="rgb", pattern="^(rgb|ndvi)$"),
):
    if not 0 <= z <= 19 or not 0 <= x < 2**z or not 0 <= y < 2**z:
        raise HTTPException(400, "Invalid tile coordinates")
    async with pool.connection() as conn:
        body = await archived_crop(conn, scene_id)
    try:
        png = await asyncio.to_thread(render_tile, body, layer, z, x, y)
    except (ValueError, KeyError, OSError):
        raise HTTPException(503, "Cannot render archived raster") from None
    return Response(
        png,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=300"
            if scene_id == "latest"
            else "public, max-age=86400"
        },
    )


@router.get("/download")
async def download_satellite_data(
    pool: DbPool,
    start: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    layer: str = Query(default="rgb", pattern="^(rgb|ndvi|all)$"),
    format: str = Query(default="zip", pattern="^(zip|json)$"),
):
    try:
        if date.fromisoformat(start) > date.fromisoformat(end):
            raise ValueError
    except ValueError:
        raise HTTPException(400, "Invalid date range") from None
    async with pool.connection() as conn:
        rows = await (
            await conn.execute(
                "SELECT id,name,metadata FROM entities WHERE entity_type='satellite_scene' AND NOT is_hidden AND metadata->>'date'>=%s AND metadata->>'date'<=%s ORDER BY metadata->>'date' ASC LIMIT 101",
                (start, end),
            )
        ).fetchall()
        if len(rows) > 100:
            raise HTTPException(400, "Choose a narrower range; maximum 100 scenes")
        scenes = [scene_from_entity(r) for r in rows]
        if not scenes:
            raise HTTPException(404, "No archived Sentinel scenes in this range")
        manifest = {
            "title": "Copernicus Sentinel-2 Ried-Ausschnitte",
            "time_range": {"start": start, "end": end},
            "layer": layer,
            "scene_count": len(scenes),
            "scenes": scenes,
            "license": "Copernicus Sentinel data terms",
            "resolution_m": 20,
            "drought_interpretation": None,
            "missing_rasters": [],
        }
        if format == "json":
            return Response(
                json.dumps(manifest, ensure_ascii=False).encode(),
                media_type="application/json",
                headers={
                    "Content-Disposition": f'attachment; filename="hack-the-ried-sentinel2-{start}-to-{end}.json"',
                    "Cache-Control": "no-store",
                },
            )
        buf = io.BytesIO()
        total_bytes = 0
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for scene in scenes:
                if not scene["raster"]:
                    manifest["missing_rasters"].append(scene["sceneId"])
                    continue
                raw = await archived_crop(conn, scene["id"])
                total_bytes += len(raw)
                if total_bytes > 100 * 1024 * 1024:
                    raise HTTPException(
                        400,
                        "Choose a narrower range; archive exceeds 100 MiB input budget",
                    )
                # Internal entity IDs are normalized; never use external names as ZIP paths.
                name = hashlib.sha256(scene["id"].encode()).hexdigest()[:16]
                scene["archive_file"] = f"scenes/{name}.npz"
                archive.writestr(scene["archive_file"], raw)
                for mode in ("rgb", "ndvi") if layer == "all" else (layer,):
                    archive.writestr(
                        f"scenes/{name}_{mode}.png",
                        await asyncio.to_thread(render_preview, raw, mode),
                    )
            archive.writestr(
                "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2)
            )
            archive.writestr(
                "README.txt",
                "20-m-Ried-Ausschnitte mit Wolkenmaske. PNGs sind Rastervorschauen ohne eigene Georeferenzierung; NPZ enthält CRS, Transform, Quellbänder, Maske und Indizes. Fehlende Raster sind im Manifest angegeben. NDVI allein belegt keine Dürre.",
            )
    return Response(
        buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="hack-the-ried-sentinel2-{layer}-{start}-to-{end}.zip"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/ecostress/scenes")
async def get_ecostress_scenes(pool: DbPool, limit: int = Query(default=20, ge=1, le=60)):
    """Public catalog metadata can exist before an authenticated raster import."""
    async with pool.connection() as conn:
        rows = await (await conn.execute(
            "SELECT metadata FROM entities WHERE entity_type='ecostress_scene' AND NOT is_hidden ORDER BY metadata->>'acquired_at' DESC LIMIT %s", (limit,)
        )).fetchall()
    scenes = [row["metadata"] for row in rows]
    return {"scenes": scenes, "count": len(scenes), "source": "NASA ECOSTRESS ECO_L2T_LSTE.003",
            "note": "Oberflächentemperatur der gültigen wolkenfreien Landpixel; einzelne Kacheln und Aufnahmezeiten."}


async def ecostress_crop_body(scene_id: str, pool: DbPool):
    async with pool.connection() as conn:
        row = await (await conn.execute(
            "SELECT metadata FROM entities WHERE id=%s AND entity_type='ecostress_scene' AND NOT is_hidden", (scene_id,)
        )).fetchone()
        raster = row["metadata"].get("raster") if row else None
        if not raster or raster.get("method") != "ecostress-v003-clear-land70-v1":
            raise HTTPException(404, "No ECOSTRESS temperature crop available")
        sha = raster["archive_sha256"]
        payload = await (await conn.execute(
            "SELECT p.body FROM collected_payloads p JOIN collection_attempts a ON a.payload_sha256=p.sha256 WHERE p.sha256=%s AND p.content_type='application/x-npz' AND a.id=%s AND a.status='success' AND a.source_id='nasa-ecostress:raster'", (sha, raster["attempt_id"])
        )).fetchone()
    if not payload or hashlib.sha256(bytes(payload["body"])).hexdigest() != sha:
        raise HTTPException(503, "ECOSTRESS archive evidence unavailable")
    return bytes(payload["body"]), sha


@router.get("/ecostress/crop/{scene_id}.npz")
async def download_ecostress_crop(scene_id: str, pool: DbPool):
    body, sha = await ecostress_crop_body(scene_id, pool)
    return Response(body, media_type="application/octet-stream",
                    headers={"ETag": f'"{sha}"', "Content-Disposition": 'attachment; filename="ecostress-crop.npz"',
                             "Cache-Control": "public, max-age=300"})


@router.get("/ecostress/tiles/{scene_id}/{z}/{x}/{y}.png")
async def get_ecostress_tile(scene_id: str, z: int, x: int, y: int, pool: DbPool):
    from ecostress_tiles import render_temperature_tile
    if not 0 <= z <= 19 or not 0 <= x < 2**z or not 0 <= y < 2**z:
        raise HTTPException(400, "Invalid tile coordinates")
    body, sha = await ecostress_crop_body(scene_id, pool)
    try:
        png = await asyncio.to_thread(render_temperature_tile, body, z, x, y)
    except (ValueError, KeyError, zipfile.BadZipFile):
        raise HTTPException(503, "Invalid archived temperature raster") from None
    return Response(png, media_type="image/png", headers={"ETag": f'"{sha}-{z}-{x}-{y}"', "Cache-Control": "public, max-age=300"})


@router.get('/firms')
async def get_firms(pool: DbPool, days: int = Query(3, ge=1, le=3)):
    from firms_publication import firms_data, firms_response
    return firms_response(await firms_data(pool, days))


@router.get('/firms/download')
async def download_firms(pool: DbPool, days: int = Query(3, ge=1, le=3)):
    from firms_publication import firms_data, firms_response
    return firms_response(await firms_data(pool, days), download=True)
