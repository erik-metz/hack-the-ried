"""Stored publications and explicitly labelled mobility display estimates."""

import asyncio
import json
import math
from datetime import UTC, datetime, timedelta
from time import monotonic

from dependencies import get_db_pool
from endpoints.infrastructure import get_emf_sites
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from measurement_reads import core_reads, read_sql
from publication_service import cached_response, read_publication
from ship_motion import display_position
from starlette.responses import StreamingResponse
from traffic_semantics import summarize_corridor

router = APIRouter(tags=["Collected data"])


@router.get("/collected/{dataset:path}")
async def dataset_publication(dataset: str, request: Request, pool=Depends(get_db_pool)):
    return await read_publication(dataset, request, pool)


async def mobility_snapshot(pool):
    async with pool.connection() as conn:
        cursor = await conn.execute(read_sql("""SELECT DISTINCT ON (entity_id) data FROM movement_latest
            WHERE valid_until > NOW() AND NOT EXISTS (
                SELECT 1 FROM movement_trip_updates u WHERE u.cancelled AND u.valid_until>NOW()
                AND movement_latest.entity_id=u.source_id||':'||u.service_date::text||':'||u.trip_id)
            ORDER BY entity_id,
            CASE WHEN basis='observed' THEN 0 ELSE 1 END, timestamp DESC"""))
        positions = [display_position(r["data"], datetime.now(UTC)) for r in await cursor.fetchall()]
        ogn_ready = await (await conn.execute("SELECT to_regclass('ogn_public_positions') IS NOT NULL AS ready")).fetchone()
        ogn = None
        if ogn_ready and ogn_ready['ready']:
            cursor = await conn.execute("""SELECT DISTINCT ON (p.device_key) p.data||d.metadata AS data
                FROM ogn_public_positions p JOIN ogn_permissions d USING(device_key)
                WHERE p.timestamp>NOW()-INTERVAL '60 seconds'
                ORDER BY p.device_key,p.timestamp DESC""")
            # Only the explicit ICAO address type permits matching ADS-B identities.
            icao = {p.get('icao24') for p in positions if p.get('icao24')}
            positions.extend(r['data'] for r in await cursor.fetchall()
                if not r['data'].get('icao24') or r['data']['icao24'] not in icao)
            ogn = await (await conn.execute("""SELECT received_at,status FROM collection_attempts
                WHERE source_id='ogn-ried' ORDER BY received_at DESC,id DESC LIMIT 1""")).fetchone()
        ready = await (await conn.execute("SELECT to_regclass('measurement_definitions') IS NOT NULL AS ready")).fetchone()
        crossings = []
        if ready and ready['ready']:
            cursor = await conn.execute("""SELECT e.id AS entity_id,e.metadata,d.basis,r.observed_at,r.value,r.quality,r.provenance
                FROM entities e JOIN measurement_definitions d ON d.entity_id=e.id
                JOIN latest_readings r ON r.measurement_id=d.id
                WHERE e.entity_type='rail_crossing' AND d.metric='crossing_state'
                    AND d.source_id='rail-barrier-model' AND d.basis='model' AND d.unit='state'
                    AND (r.provenance->>'valid_until')::timestamptz > NOW()""")
            for row in await cursor.fetchall():
                state = row['value'] if row['quality'] == 'valid' else None
                crossings.append({**row['metadata'], 'entity_id': row['entity_id'],
                    'status': {0: 'open', 1: 'closing_soon', 2: 'closed'}.get(state, 'unknown'),
                    'timestamp': row['observed_at'], 'valid_until': row['provenance']['valid_until'],
                    'basis': row['basis'], 'model_version': row['provenance']['model_version']})
        source = await (await conn.execute("""SELECT received_at,status,source_id FROM (
                SELECT DISTINCT ON (source_id) received_at,status,source_id FROM collection_attempts
                WHERE source_id IN ('aisstream-rhein','rhein-map')
                ORDER BY source_id,received_at DESC,id DESC) s
            ORDER BY CASE WHEN status='success' AND received_at > NOW()-
                CASE WHEN source_id='rhein-map' THEN INTERVAL '660 seconds'
                     ELSE INTERVAL '120 seconds' END THEN 0 ELSE 1 END,received_at DESC LIMIT 1""")).fetchone()
        aircraft = await (await conn.execute("""SELECT received_at,status FROM collection_attempts
            WHERE source_id='adsblol-ried' ORDER BY received_at DESC,id DESC LIMIT 1""")).fetchone()
    ogn_source = {'status': 'unavailable', 'last_contact': None}
    if ogn:
        ogn_source = {'status': 'connected' if ogn['status']=='success' and
            ogn['received_at'] > datetime.now(UTC)-timedelta(seconds=60) else 'unavailable',
            'last_contact': ogn['received_at']}
    aircraft_source = {'status': 'unavailable', 'last_contact': None}
    if aircraft:
        aircraft_source = {'status': 'connected' if aircraft['status']=='success' and
            aircraft['received_at'] > datetime.now(UTC)-timedelta(seconds=60) else 'unavailable',
            'last_contact': aircraft['received_at']}
    ship_source = {'status': 'unavailable', 'last_contact': None}
    if source:
        ship_source = {'status': 'connected' if source['status']=='success' and
            source['received_at'] > datetime.now(UTC)-timedelta(seconds=660 if source.get('source_id')=='rhein-map' else 120) else 'unavailable',
            'last_contact': source['received_at']}
    return {'positions': positions, 'crossings': crossings, 'crossings_available': bool(ready and ready['ready']),
            'ship_source': ship_source, 'aircraft_source': aircraft_source, 'ogn_source': ogn_source}


@router.get("/movements/latest")
async def movements(request: Request, pool=Depends(get_db_pool)):
    return cached_response(await mobility_snapshot(pool), request, 0, {'Cache-Control':'no-store'})


@router.get("/movements/stream")
async def movement_stream(request: Request, pool=Depends(get_db_pool)):
    async def events():
        snapshot = None
        next_refresh = 0.0
        while not await request.is_disconnected():
            if monotonic() >= next_refresh:
                snapshot = await mobility_snapshot(pool)
                next_refresh = monotonic() + 10
            now = datetime.now(UTC)
            snapshot = {**snapshot, "positions": [display_position(p, now) for p in snapshot["positions"]
                                                   if datetime.fromisoformat(p["valid_until"]) > now]}
            yield 'data: ' + json.dumps(jsonable_encoder(snapshot), separators=(',', ':')) + '\n\n'
            # No connection is retained while waiting; cancellation closes the generator.
            await asyncio.sleep(1)
    return StreamingResponse(events(), media_type='text/event-stream',
        headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})


@router.get("/movements/telemetry")
async def movement_telemetry(entity_id: str, request: Request, pool=Depends(get_db_pool)):
    if not entity_id.startswith(('movement:', 'crossing:')) or len(entity_id) > 256:
        raise HTTPException(400, 'Invalid mobility entity')
    end = datetime.now(UTC)
    start = end - timedelta(hours=24)
    if entity_id.startswith('movement:aircraft:ogn:'):
        return await ogn_telemetry(entity_id, request, pool, start, end)
    async with pool.connection() as conn:
        ready = await (await conn.execute("SELECT to_regclass('measurement_definitions') IS NOT NULL AS ready")).fetchone()
        if not ready or not ready['ready']:
            raise HTTPException(503, 'Canonical measurement storage is not installed')
        # Filter definitions before reading history. Prefer observations at the same
        # timestamp, while keeping schedule estimates when no observation exists.
        cursor = await conn.execute("""SELECT DISTINCT ON (d.metric,d.unit) d.metric,d.unit,
            r.value,r.observed_at AS timestamp,d.basis,r.quality
            FROM measurement_definitions d JOIN latest_readings r ON r.measurement_id=d.id
            WHERE d.entity_id=%s AND d.metric IN ('crossing_state','speed','delay','latitude','longitude','course','altitude_baro','altitude_geom','vertical_rate')
            ORDER BY d.metric,d.unit,CASE WHEN r.observed_at+INTERVAL '30 seconds'>NOW() THEN 0 ELSE 1 END,
                CASE WHEN d.basis='observed' THEN 0 ELSE 1 END,r.observed_at DESC""", (entity_id,))
        latest = await cursor.fetchall()
        if entity_id.startswith('crossing:'):
            # Keep both sides of every state change, missing sample and collection gap.
            cursor = await conn.execute("""WITH samples AS (
                SELECT r.observed_at AS bucket,r.value,d.metric,d.unit,
                    LAG(r.value) OVER w AS previous,LEAD(r.value) OVER w AS following,
                    LAG(r.observed_at) OVER w AS previous_time,LEAD(r.observed_at) OVER w AS following_time
                FROM measurement_definitions d JOIN readings r ON r.measurement_id=d.id
                WHERE d.entity_id=%s AND d.metric='crossing_state' AND d.source_id='rail-barrier-model'
                    AND r.observed_at BETWEEN %s AND %s
                WINDOW w AS (ORDER BY r.observed_at)
            ) SELECT metric,unit,bucket,value AS avg_value FROM samples
                WHERE value IS DISTINCT FROM previous OR value IS DISTINCT FROM following
                    OR previous_time IS NULL OR following_time IS NULL
                    OR bucket-previous_time>INTERVAL '30 seconds' OR following_time-bucket>INTERVAL '30 seconds'
                UNION ALL SELECT 'crossing_state','state',following_time-INTERVAL '1 microsecond',NULL FROM samples
                WHERE following_time-bucket>INTERVAL '30 seconds'
                ORDER BY bucket DESC LIMIT 10000""", (entity_id,start,end))
        else:
            cursor = await conn.execute("""WITH samples AS (
                SELECT DISTINCT ON (d.metric,d.unit,r.observed_at) d.metric,d.unit,r.observed_at,r.value
                FROM measurement_definitions d JOIN readings r ON r.measurement_id=d.id
                WHERE d.entity_id=%s AND d.metric IN ('speed','delay','latitude','longitude','altitude_baro','altitude_geom','vertical_rate')
                    AND r.quality='valid' AND r.observed_at BETWEEN %s AND %s
                ORDER BY d.metric,d.unit,r.observed_at,CASE WHEN d.basis='observed' THEN 0 ELSE 1 END
            ) SELECT metric,unit,date_bin(INTERVAL '5 minutes',observed_at,TIMESTAMPTZ '2000-01-01') AS bucket,
                AVG(value) AS avg_value FROM samples GROUP BY metric,unit,bucket ORDER BY bucket DESC LIMIT 5000""", (entity_id,start,end))
        history = await cursor.fetchall()
    # Current values have the same thirty-second lifetime as the streamed batch.
    # Ships have irregular radio updates. Reuse the collector's observation expiry,
    # rather than hiding valid AIS readings after the transit model's 30-second tick.
    expiry = end
    observation_time = None
    if entity_id.startswith(('movement:ais:', 'movement:aircraft:')):
        async with pool.connection() as conn:
            row = await (await conn.execute("SELECT valid_until,timestamp FROM movement_latest WHERE entity_id=%s AND basis='observed'",
                (entity_id.removeprefix('movement:'),))).fetchone()
            expiry = row['valid_until'] if row else end
            observation_time = row['timestamp'] if row else None
    readings = [r for r in latest if r['quality']=='valid' and
        (not entity_id.startswith('movement:aircraft:') or r['timestamp']==observation_time) and
        (expiry > end if entity_id.startswith(('movement:ais:', 'movement:aircraft:')) else r['timestamp']+timedelta(seconds=30)>end)]
    return cached_response({'readings': readings, 'history': history, 'start': start, 'end': end,
        'historyMode': 'states' if entity_id.startswith('crossing:') else 'averages',
        'historyUnavailable': False, 'historyTruncated': len(history)>=10000,
        'basis': 'model' if entity_id.startswith('crossing:') else (latest[0]['basis'] if latest else 'unknown')}, request, 5)


async def ogn_telemetry(entity_id, request, pool, start, end):
    """Only the permission/24-hour guarded view, never canonical or archived readings."""
    async with pool.connection() as conn:
        ready = await (await conn.execute("SELECT to_regclass('ogn_public_positions') IS NOT NULL AS ready")).fetchone()
        rows = []
        if ready and ready['ready']:
            rows = await (await conn.execute("""SELECT timestamp,data FROM ogn_public_positions
                WHERE device_key=%s ORDER BY timestamp DESC LIMIT 10000""",
                (entity_id.removeprefix('movement:aircraft:ogn:'),))).fetchall()
    metrics = [('speed_kmh','speed','km/h'),('course_deg','course','degrees'),
        ('latitude','latitude','degrees'),('longitude','longitude','degrees'),
        ('altitude_ogn_m','altitude_ogn','m'),('vertical_rate_ogn_mps','vertical_rate_ogn','m/s')]
    latest = []
    if rows and rows[0]['timestamp']+timedelta(seconds=60)>end:
        latest = [{'metric':metric,'unit':unit,'value':rows[0]['data'][field],
            'timestamp':rows[0]['timestamp'],'basis':'observed','quality':'valid'}
            for field,metric,unit in metrics if field in rows[0]['data']]
    buckets = {}
    for row in rows:
        stamp = row['timestamp']
        bucket = stamp.replace(minute=stamp.minute//5*5,second=0,microsecond=0)
        for field,metric,unit in metrics:
            if field in row['data'] and metric!='course':
                values = buckets.setdefault((metric,unit,bucket),[])
                values.append(row['data'][field])
    history = [{'metric':m,'unit':u,'bucket':b,'avg_value':sum(v)/len(v)}
        for (m,u,b),v in buckets.items()]
    return cached_response({'readings':latest,'history':history,'start':start,'end':end,
        'historyMode':'averages','historyUnavailable':False,'historyTruncated':len(rows)>=10000,
        'basis':'observed'},request,0,{'Cache-Control':'no-store'})


@router.get("/map-tiles/{layer}/{z}/{x}/{y}.png")
async def tile(
    layer: str, z: int, x: int, y: int, request: Request, pool=Depends(get_db_pool)
):
    if (
        layer not in {"base", "rain"}
        or not 0 <= z <= 19
        or not (0 <= x < 2**z and 0 <= y < 2**z)
    ):
        raise HTTPException(404)
    async with pool.connection() as conn:
        cursor = await conn.execute(
            """SELECT p.body,p.content_type,p.sha256 FROM collected_map_tiles t
            JOIN collected_payloads p ON p.sha256=t.payload_sha256
            WHERE layer=%s AND z=%s AND x=%s AND y=%s""",
            (layer, z, x, y),
        )
        row = await cursor.fetchone()
    if not row:
        # Deliberately no on-demand external fetch.
        raise HTTPException(404, "Tile not collected")
    headers = {
        "Cache-Control": "public, max-age=86400",
        "ETag": '"' + row["sha256"] + '"',
    }
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    return Response(bytes(row["body"]), media_type=row["content_type"], headers=headers)


RIED_CORRIDORS = [
    {
        "id": "corridor-a67",
        "road_name": "A67",
        "name": "A67 (Darmstadt ↔ Lorsch ↔ Viernheim)",
        "coordinates": [
            [8.5830, 49.8220],
            [8.5730, 49.7950],
            [8.5480, 49.7520],
            [8.5580, 49.6920],
            [8.5660, 49.6540],
            [8.5650, 49.6210],
            [8.5530, 49.5780],
        ],
    },
    {
        "id": "corridor-b47",
        "road_name": "B47",
        "name": "B47 (Worms Rheinbrücke ↔ Bürstadt ↔ Lorsch ↔ Bensheim)",
        "coordinates": [
            [8.3595, 49.6318],
            [8.3780, 49.6350],
            [8.4100, 49.6420],
            [8.4420, 49.6457],
            [8.4650, 49.6450],
            [8.5020, 49.6470],
            [8.5450, 49.6520],
            [8.5660, 49.6540],
            [8.6050, 49.6680],
        ],
    },
    {
        "id": "corridor-b44",
        "road_name": "B44",
        "name": "B44 (Biblis ↔ Bürstadt ↔ Lampertheim ↔ Mannheim)",
        "coordinates": [
            [8.4550, 49.7350],
            [8.4520, 49.6890],
            [8.4510, 49.6580],
            [8.4560, 49.6457],
            [8.4600, 49.6200],
            [8.4680, 49.5960],
            [8.4820, 49.5650],
            [8.4900, 49.5350],
        ],
    },
    {
        "id": "corridor-a5",
        "road_name": "A5",
        "name": "A5 (Darmstadt ↔ Bensheim ↔ Heppenheim ↔ Weinheim)",
        "coordinates": [
            [8.6250, 49.8050],
            [8.6280, 49.7550],
            [8.6220, 49.7020],
            [8.6180, 49.6680],
            [8.6200, 49.6350],
            [8.6250, 49.5850],
            [8.6400, 49.5520],
        ],
    },
    {
        "id": "corridor-a6",
        "road_name": "A6",
        "name": "A6 (Viernheim ↔ Sandhofen ↔ Ludwigshafen)",
        "coordinates": [
            [8.5530, 49.5780],
            [8.5020, 49.5520],
            [8.4350, 49.5380],
        ],
    },
]


@router.get("/map/collected-layers")
async def map_layers(request: Request, pool=Depends(get_db_pool)):
    expected = {
        "crossings",
        "places",
        "nature",
        "crops",
        "floods",
        "charging",
        "energy",
        "road",
        "wifi",
        "broadband",
        "boris",
        "devplans",
        "elections",
        "companies",
        "closures",
        "traffic",
        "stops",
        "lora",
        "emf",
    }
    async with pool.connection() as conn:
        cursor = await conn.execute(
            "SELECT dataset,data,expires_at FROM "
            + ("core_map_datasets" if core_reads() else "collected_datasets")
            + " WHERE (dataset LIKE 'map/layers/%%' OR dataset LIKE 'transport/stops/%%') AND expires_at > NOW()"
        )
        rows = await cursor.fetchall()
        gateway_cursor = await conn.execute(
            """SELECT e.id, e.name, e.metadata,
                      MAX(lr.value) FILTER (WHERE md.metric='latitude') AS latitude,
                      MAX(lr.value) FILTER (WHERE md.metric='longitude') AS longitude,
                      MAX(lr.value) FILTER (WHERE md.metric='online_status') AS online_status
               FROM entities e
               JOIN measurement_definitions md ON md.entity_id=e.id
               JOIN latest_readings lr ON lr.measurement_id=md.id
               WHERE e.entity_type='lora_gateway' AND e.is_hidden=FALSE
               GROUP BY e.id, e.name, e.metadata ORDER BY e.id"""
        )
        gateways = await gateway_cursor.fetchall()
        traffic_cursor = await conn.execute(
            """SELECT id,road_name,direction,location_from,location_to,description,cause_type,
                      delay_seconds,length_meters,severity,coordinates,last_seen_at,
                      delay_kind,source_category,source,provider_id,provider_start_at,provider_end_at,
                      overall_end_date,provider_future,closure_kind,work_length_meters,display_type,title,
                      event_status,is_stale FROM traffic_events
               WHERE event_status IN ('active','planned') AND last_seen_at>NOW()-INTERVAL '2 hours'
                 AND (event_status != 'planned' OR provider_start_at IS NULL
                      OR provider_start_at<=NOW()+INTERVAL '7 days')""")
        incidents = await traffic_cursor.fetchall()
        checks_cursor = await conn.execute("SELECT road_name,MAX(last_success_at) AS last_success_at FROM traffic_source_checks GROUP BY road_name")
        traffic_checks = {r["road_name"]: r["last_success_at"] for r in await checks_cursor.fetchall()}
        try:
            closures_cursor = await conn.execute(
                """SELECT id,municipality,district,street_name,location_from,location_to,
                          closure_type,status,start_time,end_time,reason,description,
                          detour,coordinates,source
                   FROM street_closures
                   WHERE is_active=TRUE"""
            )
            municipal_closures = await closures_cursor.fetchall()
        except Exception:  # noqa: BLE001
            municipal_closures = []
    layers = {
        r["dataset"].removeprefix("map/layers/"): r["data"]
        for r in rows
        if r["dataset"].startswith("map/layers/")
    }
    emf = await get_emf_sites(pool)
    emf_features = [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [site.longitude, site.latitude]},
         "properties": site.model_dump()}
        for site in emf.sites
        if site.latitude is not None and site.longitude is not None
        and math.isfinite(site.latitude) and math.isfinite(site.longitude)
    ]
    if emf_features:
        layers["emf"] = {"type": "FeatureCollection", "features": emf_features}
    gateway_features = []
    for gateway in gateways:
        # Only a confirmed online status represents active infrastructure.
        if gateway["online_status"] != 1:
            continue
        lat, lon = gateway["latitude"], gateway["longitude"]
        if lat is None or lon is None:
            continue
        lat, lon = float(lat), float(lon)
        if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        metadata = gateway["metadata"] or {}
        gateway_features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                **metadata, "id": gateway["id"], "name": gateway["name"],
                "kind": "lora_gateway",
                "online_status": "Online",
            },
        })
    # Do not fall back to a historical map dataset when no gateways are online.
    layers.pop("lora", None)
    if gateway_features:
        layers["lora"] = {"type": "FeatureCollection", "features": gateway_features}
    incident_features = []
    for incident in incidents:
        coordinates = incident["coordinates"]
        if isinstance(coordinates, str):
            coordinates = json.loads(coordinates)
        if not coordinates:
            continue
        # Collector stores [latitude, longitude]; GeoJSON uses the reverse order.
        points = [[p[1], p[0]] for p in coordinates if isinstance(p, list) and len(p) >= 2]
        if not points:
            continue
        properties = {k: v for k, v in incident.items() if k != "coordinates"}
        properties["name"] = incident.get("title") or incident["road_name"]
        properties["delay_minutes"] = round(incident["delay_seconds"] / 60) if incident.get("delay_kind") in ("reported", "estimated") else None
        if properties["delay_minutes"] is None:
            properties["delay_seconds"] = None
        incident_features.append({"type": "Feature", "geometry": {
            "type": "LineString" if len(points) > 1 else "Point",
            "coordinates": points if len(points) > 1 else points[0],
        }, "properties": properties})

    corridor_features = []
    for c in RIED_CORRIDORS:
        road = c["road_name"].upper()
        road_incidents = [i for i in incidents if str(i.get("road_name", "")).upper() == road and i.get("event_status", "active") == "active"]
        summary = summarize_corridor(road_incidents, traffic_checks.get(road))
        corridor_features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": c["coordinates"],
            },
            "properties": {
                "id": c["id"],
                "name": c["name"],
                "road_name": c["road_name"],
                **summary,
                "kind": "corridor",
            },
        })

    municipal_closure_features = []
    for row in municipal_closures:
        coords = row["coordinates"]
        if isinstance(coords, str):
            coords = json.loads(coords)
        if not coords:
            continue
        is_line = isinstance(coords, list) and len(coords) > 0 and isinstance(coords[0], list)
        if is_line:
            points = [[p[1], p[0]] for p in coords if isinstance(p, list) and len(p) >= 2]
            geom = {"type": "LineString", "coordinates": points}
        else:
            geom = {"type": "Point", "coordinates": [coords[1], coords[0]]}
        desc_text = str(row.get("description") or "").lower()
        reason_text = str(row.get("reason") or "").lower()
        closure_type = str(row.get("closure_type") or "full").lower()
        is_baustelle = "teil" in closure_type or "baustelle" in reason_text or "baustelle" in desc_text or "bau" in reason_text or "instandsetzung" in reason_text
        start_val = row.get("start_time")
        end_val = row.get("end_time")
        municipal_closure_features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "id": row["id"],
                "name": f"{row['street_name']} ({row['municipality']})",
                "street_name": row["street_name"],
                "municipality": row["municipality"],
                "district": row.get("district"),
                "location_from": row.get("location_from"),
                "location_to": row.get("location_to"),
                "closure_type": row.get("closure_type", "full"),
                "status": row.get("status", "active"),
                "start_time": start_val.isoformat() if hasattr(start_val, "isoformat") else str(start_val or ""),
                "end_time": end_val.isoformat() if hasattr(end_val, "isoformat") else (str(end_val) if end_val else None),
                "reason": row.get("reason"),
                "description": row.get("description"),
                "detour": row.get("detour"),
                "cause_type": "roadwork" if is_baustelle else "closure",
                "source": row.get("source", "hessen_mobil"),
            },
        })

    traffic_features = incident_features + corridor_features
    closure_features = municipal_closure_features + [
        f for f in incident_features if f["properties"].get("cause_type") in ("closure", "roadwork")
    ]
    if traffic_features:
        layers["traffic"] = {"type": "FeatureCollection", "features": traffic_features}
    if closure_features:
        layers["closures"] = {"type": "FeatureCollection", "features": closure_features}
    stops = [
        {**stop, "source_id": row["dataset"].removeprefix("transport/stops/")}
        for row in rows
        if row["dataset"].startswith("transport/stops/")
        for stop in row["data"]
    ]
    if stops:
        layers["stops"] = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [s["longitude"], s["latitude"]],
                    },
                    "properties": {"name": s["name"], "stop_id": s["id"], "source_id": s["source_id"]},
                }
                for s in stops
            ],
        }
    return cached_response(
        {"layers": layers, "unavailable": sorted(expected - set(layers))},
        request,
        30,
        {"X-Data-Expires-At": min(r["expires_at"] for r in rows).isoformat()}
        if rows
        else {},
    )


@router.get("/collection/status")
async def collection_status(request: Request, pool=Depends(get_db_pool)):
    async with pool.connection() as conn:
        cursor = await conn.execute("""WITH sources AS (
            SELECT id,source_url,enabled,interval_seconds FROM collection_sources
            UNION ALL SELECT DISTINCT a.source_id,NULL::text,NULL::boolean,NULL::integer FROM collection_attempts a
            WHERE NOT EXISTS(SELECT 1 FROM collection_sources s WHERE s.id=a.source_id))
            SELECT s.id AS source_id,s.source_url,s.enabled,s.interval_seconds,
                a.received_at,COALESCE(a.status,'pending') AS status,a.error,
                a.http_status,a.fetched_at,a.processed_at,a.item_count,a.item_count_unit,a.error_stage,
                COALESCE(a.processed_at IS NOT NULL,FALSE) AS completion_recorded,
                (SELECT COUNT(*) FROM collected_datasets d WHERE d.source_id=s.id) AS published_dataset_count,
                (SELECT MAX(fetched_at) FROM collection_attempts f
                 WHERE f.source_id=s.id AND f.fetched_at IS NOT NULL) AS last_fetch_success_at,
                (SELECT MAX(processed_at) FROM collection_attempts p
                 WHERE p.source_id=s.id AND p.status='success' AND p.processed_at IS NOT NULL) AS last_processed_at,
                (SELECT MAX(received_at) FROM collection_attempts ok
                 WHERE ok.source_id=s.id AND ok.status='success') AS last_success_at
            FROM sources s LEFT JOIN LATERAL (
                SELECT received_at,status,error,http_status,fetched_at,processed_at,item_count,item_count_unit,error_stage FROM collection_attempts
                WHERE source_id=s.id ORDER BY received_at DESC,id DESC LIMIT 1) a ON TRUE ORDER BY s.id""")
        rows = await cursor.fetchall()
    return cached_response({"sources": rows}, request, 30)


# Compatibility URLs now share the collector publication boundary. Old seeded
# registry endpoint implementations are not mounted by the application.
legacy_router = APIRouter(tags=["Collected registry compatibility"])


@legacy_router.get("/elections")
async def collected_elections(request: Request, pool=Depends(get_db_pool)):
    return await dataset_publication("elections", request, pool)


@legacy_router.get("/{domain}/{resource:path}")
async def collected_legacy(
    domain: str, resource: str, request: Request, pool=Depends(get_db_pool)
):
    if domain not in {
        "demographics",
        "realestate",
        "economy",
        "finance",
        "elections",
        "environment",
        "social",
        "infrastructure",
    }:
        raise HTTPException(404)
    return await dataset_publication(f"{domain}/{resource}", request, pool)


@router.get("/transport/stops/{stop_id}/departures")
async def departures(stop_id: str, request: Request, pool=Depends(get_db_pool)):
    async with pool.connection() as conn:
        cursor = await conn.execute(
            """SELECT s.source_id,s.trip_id,s.metadata->>'line' AS line,
            s.metadata->>'destination' AS destination,t.departure_at AS scheduled_at,
            t.departure_at + make_interval(secs => COALESCE(u.delay_seconds,0)) AS expected_at,
            COALESCE(u.delay_basis,'schedule_only') AS delay_basis
            FROM movement_stop_times t JOIN movement_schedules s USING(source_id,trip_id,service_date)
            LEFT JOIN movement_trip_updates u ON u.source_id=s.source_id AND u.trip_id=s.trip_id
                AND u.service_date=s.service_date AND u.valid_until>NOW()
            WHERE t.stop_id=%s AND (%s::text IS NULL OR t.source_id=%s) AND s.fetched_at>NOW()-INTERVAL '48 hours'
            AND NOT COALESCE(u.cancelled,FALSE)
            AND t.departure_at+make_interval(secs => COALESCE(u.delay_seconds,0))>NOW()
            ORDER BY expected_at LIMIT 12""",
            (stop_id, request.query_params.get("source"), request.query_params.get("source")),
        )
        rows = await cursor.fetchall()
    return cached_response(
        {"departures": rows, "basis": "schedule_prediction"}, request, 10
    )
