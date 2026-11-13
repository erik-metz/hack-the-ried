"""Bounded, scheduled WMS acquisition. Browser tile misses never call providers."""

import asyncio
import math
from datetime import UTC, datetime, timedelta

from publications import acquire


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
    from urllib.parse import urlencode

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
    for z, x, y in inventory:
        if (z, x, y) in fresh:
            continue
        query = urlencode(
            {
                "SERVICE": "WMS",
                "VERSION": "1.1.1",
                "REQUEST": "GetMap",
                "LAYERS": source["wms_layer"],
                "STYLES": "",
                "SRS": "EPSG:3857",
                "BBOX": ",".join(map(str, mercator_bbox(z, x, y))),
                "WIDTH": 256,
                "HEIGHT": 256,
                "FORMAT": "image/png",
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
    await conn.execute(
        "INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'success',%s)",
        (source["id"], f"{len(inventory)} regional tiles ready; {len(set(inventory) & fresh)} reused"),
    )
    await conn.commit()
