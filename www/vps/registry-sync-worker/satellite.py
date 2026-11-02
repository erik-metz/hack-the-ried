"""Real Sentinel-2 metadata and archived AOI raster indices; no cover-derived proxies."""

import asyncio
import hashlib
import json
import logging
import math
from datetime import UTC, datetime

from psycopg.types.json import Jsonb
from rasterio.errors import RasterioError
from satellite_raster import BBOX, METHOD, asset_manifest, read_scene

LOG = logging.getLogger(__name__)


def parse_satellite_scenes(body, max_cloud_cover=30.0, bbox=None):
    data = json.loads(body)
    now = datetime.now(UTC)
    scenes = []
    features = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        try:
            cloud = float(props["eo:cloud_cover"])
            stamp = datetime.fromisoformat(props["datetime"])
            if (
                not math.isfinite(cloud)
                or not 0 <= cloud <= max_cloud_cover
                or stamp.tzinfo is None
                or stamp > now
            ):
                continue
            sid = feat["id"]
        except (KeyError, TypeError, ValueError):
            continue
        assets = feat.get("assets", {})

        def percentage(key, properties=props):
            value = properties.get(key)
            return (
                float(value)
                if value is not None
                and math.isfinite(float(value))
                and 0 <= float(value) <= 100
                else None
            )

        scene = {
            "id": "satellite-scene-" + sid.lower().replace("_", "-"),
            "sceneId": sid,
            "name": "Sentinel-2 Szene " + stamp.date().isoformat(),
            "date": stamp.date().isoformat(),
            "datetime": stamp.isoformat(),
            "platform": props.get("platform"),
            "gridSquare": props.get("mgrs:grid_square"),
            "cloudCoverPercent": cloud,
            "vegetationPercent": percentage("s2:vegetation_percentage"),
            "waterPercent": percentage("s2:water_percentage"),
            "ndviMean": None,
            "droughtStressedAreaHa": None,
            "raster": None,
            "assets": {
                name + "Cog": assets.get(key, {}).get("href")
                for name, key in [
                    ("visual", "visual"),
                    ("red", "red"),
                    ("green", "green"),
                    ("blue", "blue"),
                    ("nir", "nir"),
                    ("swir", "swir16"),
                ]
            },
            "source": "Copernicus Sentinel-2",
            "sourceUpdatedAt": now.isoformat(),
        }
        scene["assets"]["thumbnailUrl"] = assets.get(
            "thumbnail", assets.get("preview", {})
        ).get("href")
        scene["assets"]["sclCog"] = assets.get("scl", {}).get("href")
        scenes.append(scene)
        features.append(
            {
                "type": "Feature",
                "geometry": feat.get("geometry"),
                "properties": {"id": scene["id"], "sceneId": sid},
            }
        )
    scenes.sort(key=lambda s: s["datetime"], reverse=True)
    summary = {
        "total_scenes": len(scenes),
        "latest_scene_date": scenes[0]["date"] if scenes else None,
        "latest_scene_cloud_cover": scenes[0]["cloudCoverPercent"] if scenes else None,
        "latest_scene_vegetation": scenes[0]["vegetationPercent"] if scenes else None,
        "latest_scene_ndvi_mean": None,
        "latest_scene_drought_area_ha": None,
    }
    return now, scenes, {"type": "FeatureCollection", "features": features}, summary


async def enrich_rasters(conn, source, body, scenes, stac_digest):
    features = {f["id"]: f for f in json.loads(body).get("features", [])}
    budget = min(2, max(0, int(source.get("raster_max_scenes", 2))))
    used = 0
    for scene in scenes:
        feat = features[scene["sceneId"]]
        try:
            manifest = asset_manifest(feat)
            fingerprint = hashlib.sha256(
                json.dumps(
                    {"method": METHOD, "bbox": BBOX, "assets": manifest}, sort_keys=True
                ).encode()
            ).hexdigest()
            previous = await (
                await conn.execute(
                    "SELECT metadata FROM entities WHERE id=%s", (scene["id"],)
                )
            ).fetchone()
            old = previous[0].get("raster") if previous else None
            if old and old.get("fingerprint") == fingerprint:
                scene["raster"] = old
                scene["ndviMean"] = old["indices"]["ndvi"]["mean"]
                continue
            if used >= budget:
                continue
            used += 1
            stats, raw, sha, metadata = await asyncio.to_thread(read_scene, feat)
            async with conn.transaction():
                await conn.execute(
                    "SELECT store_collected_file(%s,%s,'application/x-npz')",
                    (sha, raw),
                )
                attempt = await (
                    await conn.execute(
                        "INSERT INTO collection_attempts(source_id,http_status,payload_sha256,status) VALUES (%s,200,%s,'received') RETURNING id",
                        (source["id"] + ":raster", sha),
                    )
                ).fetchone()
            await conn.commit()
            scene["raster"] = {
                **stats,
                "fingerprint": fingerprint,
                "archive_sha256": sha,
                "stac_sha256": stac_digest,
                "attempt_id": attempt[0],
                "grid": {
                    k: metadata[k] for k in ("crs", "transform", "shape", "resampling")
                },
                "assets": manifest,
                "computed_at": datetime.now(UTC).isoformat(),
            }
            scene["ndviMean"] = stats["indices"]["ndvi"]["mean"]
        except (OSError, ValueError, KeyError, RasterioError) as exc:
            LOG.warning(
                "Sentinel raster unavailable for %s (%s)",
                scene["sceneId"],
                type(exc).__name__,
            )
            await conn.execute(
                "INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'failed',%s)",
                (source["id"] + ":raster", type(exc).__name__),
            )
            await conn.commit()


async def import_satellite(conn, client, source):
    from publications import acquire, publish

    response, digest, attempt_id = await acquire(conn, client, source)
    source_time, scenes, geojson, summary = parse_satellite_scenes(
        response.content, max_cloud_cover=float(source.get("max_cloud_cover", 30))
    )
    await enrich_rasters(conn, source, response.content, scenes, digest)
    summary["latest_scene_ndvi_mean"] = scenes[0]["ndviMean"] if scenes else None
    summary["computed_raster_scenes"] = sum(s["raster"] is not None for s in scenes)
    async with conn.transaction():
        await publish(
            conn,
            source,
            "environment/satellite/scenes",
            {
                "summary": summary,
                "scenes": scenes,
                "count": len(scenes),
                "raster_contract": METHOD,
            },
            digest,
            source_time,
        )
        await publish(
            conn, source, "map/layers/satellite_latest", geojson, digest, source_time
        )
        for s in scenes:
            metadata = {
                "scene_id": s["sceneId"],
                "platform": s["platform"],
                "grid_square": s["gridSquare"],
                "date": s["date"],
                "cloud_cover": s["cloudCoverPercent"],
                "vegetation_cover": s["vegetationPercent"],
                "water_cover": s["waterPercent"],
                "assets": s["assets"],
                "raster": s["raster"],
                "ndvi_mean": s["ndviMean"],
                "drought_stressed_area_ha": None,
                "source": "Copernicus Sentinel-2",
            }
            await conn.execute(
                "INSERT INTO entities(id,name,entity_type,metadata) VALUES (%s,%s,'satellite_scene',%s) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,metadata=entities.metadata || EXCLUDED.metadata,updated_at=NOW()",
                (s["id"], s["name"], Jsonb(metadata)),
            )
            stamp = datetime.fromisoformat(s["datetime"])
            for metric, value in [
                ("cloud_cover", s["cloudCoverPercent"]),
                ("vegetation_coverage", s["vegetationPercent"]),
            ]:
                if value is not None:
                    await conn.execute(
                        "SELECT write_measurement(%s,%s,'%%',%s,'observed','{}'::jsonb,%s,%s::numeric,%s,%s::jsonb,'valid',NULL,NULL,'instantaneous')",
                        (
                            s["id"],
                            metric,
                            source["id"],
                            stamp,
                            value,
                            source_time,
                            Jsonb({"payload_sha256": digest, "scene_id": s["sceneId"]}),
                        ),
                    )
            if s["raster"]:
                raster = s["raster"]
                # Every correction has its own immutable crop hash; legacy proxies are never selected.
                for metric, stats in raster["indices"].items():
                    if stats["mean"] is None:
                        continue
                    await conn.execute(
                        "SELECT write_measurement(%s,%s,'index',%s,'model',%s,%s,%s::numeric,%s,%s,'valid',NULL,NULL,'instantaneous')",
                        (
                            s["id"],
                            metric + "_mean",
                            source["id"],
                            Jsonb(
                                {
                                    "method": METHOD,
                                    "raster_sha256": raster["archive_sha256"],
                                    "aoi_bbox": list(BBOX),
                                }
                            ),
                            stamp,
                            stats["mean"],
                            source_time,
                            Jsonb(raster),
                        ),
                    )
                await conn.execute(
                    "UPDATE collection_attempts SET status='success' WHERE id=%s",
                    (raster["attempt_id"],),
                )
        await conn.execute(
            "UPDATE collection_attempts SET status='success' WHERE id=%s", (attempt_id,)
        )
    await conn.commit()
