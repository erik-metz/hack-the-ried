"""Public Mängelmelder map import for the Hessisches Ried.

Only report identifiers, timestamps, category, status and point geometry are
published. Free text, street addresses, reporter names and photographs are
intentionally discarded.
"""

import hashlib
import json
from datetime import UTC, datetime, timedelta
import httpx
from psycopg.types.json import Jsonb


API_URL = "https://www.xn--mngelmelder-l8a.de/api/v1/domain/32/message/geojson"
DATASET = "civic/maengelmelder"
# Four overlapping map requests avoid the provider's 200-feature viewport cap.
# The union covers the same broad Ried extent used by the public map.
BOUNDS = (
    (8.15, 49.45, 8.49, 49.68),
    (8.46, 49.45, 8.80, 49.68),
    (8.15, 49.65, 8.49, 49.90),
    (8.46, 49.65, 8.80, 49.90),
)


def _first(properties, *names):
    for name in names:
        value = properties.get(name)
        if value not in (None, ""):
            return value
    return None


def parse_geojson(payload, bounds):
    """Validate GeoJSON, filter to requested bounds and minimize properties."""
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ValueError("Expected a GeoJSON FeatureCollection")
    features = payload.get("features")
    if not isinstance(features, list) or len(features) > 200:
        raise ValueError("Invalid or unexpectedly large GeoJSON feature list")
    west, south, east, north = bounds
    result = []
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            continue
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") if geometry.get("type") == "Point" else None
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        try:
            lon, lat = float(coords[0]), float(coords[1])
        except (TypeError, ValueError):
            continue
        if not (west <= lon <= east and south <= lat <= north):
            continue
        props = feature.get("properties") or {}
        if not isinstance(props, dict):
            continue
        identifier = _first(props, "id", "messageid", "message_id", "number") or feature.get("id")
        if identifier is None:
            continue
        item = {
            "id": str(identifier),
            "latitude": lat,
            "longitude": lon,
            "reportedAt": _first(props, "created", "created_at", "date", "reported_at"),
            "category": _first(props, "type", "category", "category_name"),
            "status": _first(props, "state", "status", "state_name"),
            "url": f"https://www.xn--mngelmelder-l8a.de/bms/{identifier}",
        }
        result.append(item)
    return result


async def import_maengelmelder(conn, client, source):
    """Fetch bounded map results and publish a sanitized Ried GeoJSON dataset."""
    by_id = {}
    for west, south, east, north in BOUNDS:
        params = {
            "sort": "-created", "rows": 200, "search_visible_map": 1,
            "pageid": 1, "messageid": "", "text": "", "state": "all",
            "order": "desc-id", "address": "", "zoom": 10,
            "left": west, "bottom": south, "right": east, "top": north,
        }
        response = await client.get(API_URL, params=params)
        response.raise_for_status()
        for item in parse_geojson(response.json(), (west, south, east, north)):
            by_id[item["id"]] = item

    records = sorted(by_id.values(), key=lambda item: item["id"], reverse=True)
    data = {
        "type": "FeatureCollection",
        "source": "Mängelmelder.de",
        "license": "CC BY-SA",
        "attribution": "Mängelmelder.de; Inhalte CC BY-SA, siehe jeweilige Meldung",
        "features": [
            {
                "type": "Feature",
                "id": row["id"],
                "geometry": {"type": "Point", "coordinates": [row["longitude"], row["latitude"]]},
                "properties": {k: v for k, v in row.items() if k not in {"id", "latitude", "longitude"}},
            }
            for row in records
        ],
    }
    now = datetime.now(UTC)
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    async with conn.transaction():
        await conn.execute(
            """INSERT INTO collected_dataset_versions(dataset,payload_sha256,source_updated_at,data)
            VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (DATASET, digest, now, Jsonb(data)),
        )
        await conn.execute(
            """INSERT INTO collected_datasets
            (dataset,source_id,source_url,source_updated_at,fetched_at,expires_at,payload_sha256,data)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT(dataset) DO UPDATE SET source_id=EXCLUDED.source_id,
            source_url=EXCLUDED.source_url,source_updated_at=EXCLUDED.source_updated_at,
            fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at,
            payload_sha256=EXCLUDED.payload_sha256,data=EXCLUDED.data""",
            (DATASET, source["id"], API_URL, now, now, now + timedelta(hours=1), digest, Jsonb(data)),
        )
    return f"success ({len(records)} reports)"
