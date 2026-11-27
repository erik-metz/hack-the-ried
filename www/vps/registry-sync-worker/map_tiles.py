"""Bounded, scheduled WMS acquisition. Browser tile misses never call providers."""

import asyncio
import hashlib
import json
import math
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from defusedxml import ElementTree as ET
from publications import acquire, publish

WMS_NS = {"w": "http://www.opengis.net/wms"}


def tile_inventory(bbox, minimum, maximum):
    south, west, north, east = bbox
    if not (
        -85 < south < north < 85
        and -180 <= west < east <= 180
        and 0 <= minimum <= maximum <= 15
    ):
        raise ValueError("Invalid tile collection bounds")
    result = []
    for zoom in range(minimum, maximum + 1):
        scale = 2**zoom

        def point(lat, lon, scale=scale):
            return (
                int((lon + 180) / 360 * scale),
                int(
                    (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * scale
                ),
            )

        left, bottom = point(south, west)
        right, top = point(north, east)
        if (right - left + 1) * (bottom - top + 1) + len(result) > 3000:
            raise ValueError("Tile inventory exceeds configured safety limit")
        result.extend(
            (zoom, x, y) for x in range(left, right + 1) for y in range(top, bottom + 1)
        )
    if len(result) > 3000:
        raise ValueError("Tile inventory exceeds configured safety limit")
    return result


def resolve_layer(body, title_path):
    """Find a WMS layer by its title path; providers may renumber layer names."""
    root = ET.fromstring(body)
    matches = []

    def walk(layer, path):
        title = (layer.findtext("w:Title", namespaces=WMS_NS) or "").strip()
        current = [*path, title]
        name = layer.findtext("w:Name", namespaces=WMS_NS)
        if name and current[-len(title_path):] == list(title_path):
            matches.append(name.strip())
        for child in layer.findall("w:Layer", WMS_NS):
            walk(child, current)

    for layer in root.findall("w:Capability/w:Layer", WMS_NS):
        walk(layer, [])
    if len(matches) != 1:
        raise ValueError(f"WMS layer title path matched {len(matches)} layers")
    return matches[0]


def data_stand(body, pattern):
    """Publication date stated by the provider, e.g. a dated download file name."""
    dates = sorted({m for m in re.findall(pattern, body.decode("utf-8", "replace"))})
    if not dates:
        raise ValueError("Provider data date not found")
    return datetime.strptime(dates[-1], "%Y%m%d").replace(tzinfo=UTC)


def mercator_bbox(z, x, y):
    extent = 20037508.342789244
    width = 2 * extent / 2**z
    return (
        x * width - extent,
        extent - (y + 1) * width,
        (x + 1) * width - extent,
        extent - y * width,
    )


async def import_wms(conn, client, source):

    cutoff = datetime.now(UTC) - timedelta(seconds=source["interval_seconds"])
    cursor = await conn.execute(
        """SELECT t.z,t.x,t.y FROM collected_map_tiles t
        JOIN collected_file_assets f ON f.sha256=t.payload_sha256
        WHERE t.layer=%s AND t.fetched_at>%s""",
        (source["layer"], cutoff),
    )
    fresh = set(await cursor.fetchall())
    await conn.commit()
    inventory = tile_inventory(source["bbox"], source["min_zoom"], source["max_zoom"])
    wms_layer = source.get("wms_layer")
    if source.get("wms_layer_title_path"):
        capabilities, _, _ = await acquire(
            conn, client, source,
            source["url"] + "?" + urlencode({"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetCapabilities"}))
        wms_layer = resolve_layer(capabilities.content, source["wms_layer_title_path"])
    stand = None
    if source.get("data_stand"):
        listing, _, _ = await acquire(conn, client, source, source["data_stand"]["url"])
        stand = data_stand(listing.content, source["data_stand"]["pattern"])
    for z, x, y in inventory:
        if (z, x, y) in fresh:
            continue
        query = urlencode(
            {
                "SERVICE": "WMS",
                "VERSION": "1.1.1",
                "REQUEST": "GetMap",
                "LAYERS": wms_layer,
                "STYLES": "",
                "SRS": "EPSG:3857",
                "BBOX": ",".join(map(str, mercator_bbox(z, x, y))),
                "WIDTH": 256,
                "HEIGHT": 256,
                "FORMAT": "image/png",
                **({"TRANSPARENT": "TRUE"} if source.get("transparent") else {}),
            }
        )
        response, digest, attempt = await acquire(
            conn, client, source, source["url"] + "?" + query
        )
        if not response.content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("WMS returned no PNG image")
        async with conn.transaction():
            # Acquisition retains only a fingerprint. Persist the served image
            # atomically with its tile reference before marking it ready.
            await conn.execute(
                "SELECT store_collected_file(%s,%s,'image/png')",
                (digest, response.content),
            )
            await conn.execute(
                """INSERT INTO collected_map_tiles(layer,z,x,y,payload_sha256,fetched_at)
                VALUES (%s,%s,%s,%s,%s,NOW()) ON CONFLICT(layer,z,x,y)
                DO UPDATE SET payload_sha256=EXCLUDED.payload_sha256,fetched_at=EXCLUDED.fetched_at""",
                (source["layer"], z, x, y, digest),
            )
            await conn.execute(
                "UPDATE collection_attempts SET status='success' WHERE id=%s",
                (attempt,),
            )
        await conn.commit()
        await asyncio.sleep(source.get("request_interval_seconds", 0.25))
    if source.get("publication"):
        # Tile layers have no GeoJSON; their attribution and data date are published
        # separately so the map can state them and expire the layer like any other.
        stamp = stand or datetime.now(UTC)
        meta = {**source["publication"], "layer": source["layer"], "wms_layer": wms_layer,
                "min_zoom": source["min_zoom"], "max_zoom": source["max_zoom"],
                "bbox": source["bbox"], "data_as_of": stamp.date().isoformat(),
                "tiles": len(inventory)}
        if "{year}" in meta.get("attribution", ""):
            # "Jahr des letzten Datenbezugs" as required by BKG source notes.
            meta["attribution"] = meta["attribution"].replace("{year}", str(datetime.now(UTC).year))
        if stand and "{stand}" in meta.get("attribution", ""):
            meta["attribution"] = meta["attribution"].replace("{stand}", stand.strftime("%m.%Y"))
        body = json.dumps(meta, sort_keys=True, ensure_ascii=False).encode()
        digest = hashlib.sha256(body).hexdigest()
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO collected_payloads(sha256,size_bytes,content_type) VALUES (%s,%s,'application/json') ON CONFLICT DO NOTHING",
                (digest, len(body)))
            await publish(conn, source, f"map/tiles/{source['layer']}", meta, digest, stamp)
    await conn.execute(
        "INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'success',%s)",
        (source["id"], f"{len(inventory)} regional tiles ready; {len(set(inventory) & fresh)} reused"),
    )
    await conn.commit()
