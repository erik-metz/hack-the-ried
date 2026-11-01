"""Database persistence for environment observations."""

import os
from datetime import datetime, timedelta
from math import isfinite

from psycopg.types.json import Jsonb


async def persist_environment_data(
    conn,
    gauges,
    weather_list,
    fetched_at: datetime,
    *,
    payload=None,
    source_url="",
    radar=None,
    forecasts=None,
    lightning=None,
) -> dict[str, int]:
    updated_gauges = 0
    updated_weather = 0
    updated_radar = 0
    updated_forecasts = 0
    updated_lightning = 0
    radar_items = radar if radar is not None else getattr(weather_list, "radar", [])
    forecast_items = forecasts if forecasts is not None else getattr(weather_list, "forecasts", [])
    lightning_item = lightning if lightning is not None else getattr(weather_list, "lightning", None)
    mode = os.getenv('MEASUREMENT_WEATHER_WRITE_MODE', 'legacy')
    if mode not in {'legacy', 'dual'}:
        raise ValueError('MEASUREMENT_WEATHER_WRITE_MODE must be legacy or dual')

    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext('weather-legacy-repair'))")
        if mode == 'dual':
            from weather_measurements import replay_weather_receipt

            if not payload or 'weather_attempt_id' not in payload:
                raise ValueError('Canonical weather writes require an archived source receipt')
            receipt = await (await conn.execute("""SELECT a.id,a.received_at,a.payload_sha256,p.body
                FROM collection_attempts a JOIN collected_payloads p ON p.sha256=a.payload_sha256
                WHERE a.id=%s AND a.source_id='environment-weather' AND a.http_status=200
                    AND a.status IN ('received','success') AND a.payload_sha256=%s""",
                (payload['weather_attempt_id'],payload['weather_sha256']))).fetchone()
            if receipt is None:
                raise ValueError('Weather receipt missing or does not match payload')
            await replay_weather_receipt(conn, *receipt)
        # 1. Update Gauges
        for g in gauges:
            await conn.execute(
                """
                INSERT INTO flood_gauges (id, name, water_body, municipality, latitude, longitude, current_level_m, alarm_level_1_m, alarm_level_2_m, alarm_level_3_m, status, source, source_station_id, updated_at)
                VALUES (%s, %s, %s, 'Worms', %s, %s, %s, NULL, NULL, NULL, %s, 'pegelonline_wsv', %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, current_level_m = EXCLUDED.current_level_m,
                    status = EXCLUDED.status,
                    alarm_level_1_m=NULL, alarm_level_2_m=NULL, alarm_level_3_m=NULL,
                    updated_at = EXCLUDED.updated_at
                WHERE EXCLUDED.updated_at >= flood_gauges.updated_at
                """,
                (
                    g.id,
                    g.name,
                    g.water_body,
                    g.latitude,
                    g.longitude,
                    g.level_m,
                    g.status,
                    g.source_station_id,
                    g.measured_at,
                ),
            )
            updated_gauges += 1

        # 2. Update Weather in sensor_data & sensor_latest
        for w in weather_list:
            await conn.execute(
                """
                INSERT INTO sensor_metadata (id, friendly_name, latitude, longitude, description)
                VALUES (%s, 'DWD ICON Wettermodell Ried', %s, %s, 'DWD ICON / Open-Meteo Modellwerte; keine Stationsmessung')
                ON CONFLICT (id) DO UPDATE SET friendly_name=EXCLUDED.friendly_name,
                    latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, description=EXCLUDED.description
                """,
                (w.sensor_id, w.latitude, w.longitude),
            )
            for metric, unit, value in (
                ("temperature", "°C", w.temperature),
                ("relative_humidity", "%", w.humidity),
                ("precipitation", "mm", w.precipitation),
            ):
                if value is None:
                    continue
                await conn.execute(
                    """INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
                    SELECT %s,%s,%s,%s,%s WHERE NOT EXISTS (SELECT 1 FROM sensor_data
                        WHERE sensor_id=%s AND metric=%s AND unit=%s AND timestamp=%s AND value=%s)""",
                    (w.sensor_id, metric, unit, w.timestamp, value, w.sensor_id, metric, unit, w.timestamp, value),
                )
                latest_value = value
                if mode == 'dual':
                    canonical = await (await conn.execute("""SELECT r.value FROM readings r
                        JOIN measurement_definitions d ON d.id=r.measurement_id
                        WHERE d.entity_id=%s AND d.source_id='environment-weather' AND d.basis='model'
                            AND d.dimensions='{}' AND d.metric=%s AND d.unit=%s
                            AND r.observed_at=%s AND r.quality='valid'""",
                        ('sensor:'+w.sensor_id,metric,unit,w.timestamp))).fetchone()
                    if canonical is None:
                        raise ValueError('Canonical weather reading missing for legacy cache')
                    latest_value = canonical[0]
                    cleaned = await (await conn.execute("SELECT clean_weather_legacy(%s,%s,%s,%s)",
                        (w.sensor_id, metric, unit, w.timestamp))).fetchone()
                    if not cleaned[0]:
                        raise ValueError('Weather legacy history lacks verified correction evidence')
                await conn.execute(
                    """INSERT INTO sensor_latest(sensor_id,metric,unit,timestamp,value)
                    VALUES (%s,%s,%s,%s,%s) ON CONFLICT(sensor_id,metric,unit) DO UPDATE SET
                    timestamp=EXCLUDED.timestamp,value=EXCLUDED.value
                    WHERE EXCLUDED.timestamp >= sensor_latest.timestamp""",
                    (w.sensor_id, metric, unit, w.timestamp, latest_value),
                )
                updated_weather += 1

        # 3. Update RADOLAN Radar
        for r in radar_items:
            provenance = Jsonb({"source": "dwd_radolan", "product": "RW", "lat": r.latitude, "lon": r.longitude})
            if mode == 'dual':
                await conn.execute("""
                    INSERT INTO entities(id, name, entity_type, metadata)
                    VALUES ('sensor:weather-radolan-ried', 'DWD RADOLAN Radar Ried', 'radar_grid_cell',
                            '{"provider":"DWD","product":"RW","resolution":"1km"}')
                    ON CONFLICT(id) DO NOTHING
                """)
                await conn.execute("""
                    SELECT write_measurement(
                        'sensor:weather-radolan-ried', 'precipitation', 'mm', 'environment-radolan',
                        'observed', '{"product":"RW","interval":"60m"}'::jsonb,
                        %s, %s::numeric, %s, %s, 'valid', %s - interval '1 hour', %s, 'period_total'
                    )
                """, (r.timestamp, r.precipitation_mm, fetched_at, provenance, r.timestamp, r.timestamp))
            await conn.execute("""
                INSERT INTO sensor_metadata (id, friendly_name, latitude, longitude, description)
                VALUES (%s, 'DWD RADOLAN Radar Ried', %s, %s, 'DWD RADOLAN RW 1km Stundensumme')
                ON CONFLICT (id) DO UPDATE SET friendly_name=EXCLUDED.friendly_name,
                    latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, description=EXCLUDED.description
            """, (r.sensor_id, r.latitude, r.longitude))
            await conn.execute("""
                INSERT INTO sensor_data(sensor_id, metric, unit, timestamp, value)
                VALUES (%s, 'precipitation_radar', 'mm', %s, %s)
                ON CONFLICT DO NOTHING
            """, (r.sensor_id, r.timestamp, r.precipitation_mm))
            await conn.execute("""
                INSERT INTO sensor_latest(sensor_id, metric, unit, timestamp, value)
                VALUES (%s, 'precipitation_radar', 'mm', %s, %s)
                ON CONFLICT(sensor_id, metric, unit) DO UPDATE SET
                timestamp=EXCLUDED.timestamp, value=EXCLUDED.value
                WHERE EXCLUDED.timestamp >= sensor_latest.timestamp
            """, (r.sensor_id, r.timestamp, r.precipitation_mm))
            updated_radar += 1

        # 4. MOSMIX is model data: always persist in the measurement core.
        # The weather shadow-write switch only controls observed weather.
        # Never count forecast objects without actually storing their values.
        # 4. Update MOSMIX Forecasts
        for f in forecast_items:
            provenance = Jsonb({"source": "dwd_mosmix", "station": f.station_id})
            await conn.execute("""
                INSERT INTO entities(id, name, entity_type, metadata)
                VALUES (%s, 'DWD MOSMIX Station 10729', 'weather_station',
                        '{"provider":"DWD","model":"MOSMIX_L"}')
                ON CONFLICT(id) DO NOTHING
            """, (f"sensor:{f.station_id}",))
            for metric, unit, val in (
                ("temperature", "°C", f.temperature_c),
                ("dew_point", "°C", f.dew_point_c),
                ("wind_speed", "m/s", f.wind_speed_ms),
                ("precipitation_probability", "%", f.precipitation_prob),
                ("precipitation", "mm", f.precipitation_mm),
            ):
                if val is None or not isfinite(val):
                    continue
                period_start = f.timestamp - timedelta(hours=1) if metric == "precipitation" else None
                period_end = f.timestamp if metric == "precipitation" else None
                semantics = "period_total" if metric == "precipitation" else "instantaneous"
                await conn.execute("""
                    SELECT write_measurement(
                        %s, %s, %s, 'environment-mosmix',
                        'model', '{"station":"10729"}'::jsonb,
                        %s, %s::numeric, %s, %s, 'valid', %s, %s, %s
                    )
                """, (f"sensor:{f.station_id}", metric, unit, f.timestamp, val, fetched_at, provenance,
                        period_start, period_end, semantics))
                updated_forecasts += 1

        # 5. Update Blitzortung Lightning Observations
        if lightning_item is not None:
            if lightning_item.source not in {'blitzortung', 'xweather'}:
                raise ValueError('Unknown lightning provider')
            provenance = Jsonb({"source": lightning_item.source, "radius_km": lightning_item.radius_km})
            if mode == 'dual' or lightning_item.source == 'xweather':
                await conn.execute("""
                    INSERT INTO entities(id, name, entity_type, metadata)
                    VALUES (%s, 'Blitzüberwachungszone Ried (25 km Radius Bürstadt)', 'monitoring_area',
                            %s)
                    ON CONFLICT(id) DO UPDATE SET
                        name = EXCLUDED.name,
                        metadata = entities.metadata || EXCLUDED.metadata,
                        updated_at = NOW()
                """, (
                    lightning_item.zone_id,
                    Jsonb({
                        "center_lat": lightning_item.center_lat,
                        "center_lon": lightning_item.center_lon,
                        "radius_km": lightning_item.radius_km,
                        "provider": "Vaisala Xweather" if lightning_item.source == "xweather" else "Blitzortung.org",
                    }),
                ))
                # Pulses counted over the provider request window.
                await conn.execute(f"""
                    SELECT write_measurement(
                        %s, 'lightning_strikes_count', 'count', 'environment-{lightning_item.source}',
                        'observed', '{{"radius_km": {lightning_item.radius_km}, "interval_seconds": {lightning_item.period_seconds}}}'::jsonb,
                        %s, %s::numeric, %s, %s, 'valid', %s - interval '{lightning_item.period_seconds} seconds', %s, 'period_total'
                    )
                """, (
                    lightning_item.zone_id,
                    lightning_item.timestamp,
                    lightning_item.strikes_count,
                    fetched_at,
                    provenance,
                    lightning_item.timestamp,
                    lightning_item.timestamp,
                ))
                # Distance min (km) if strikes occurred
                if lightning_item.distance_min_km is not None:
                    await conn.execute(f"""
                        SELECT write_measurement(
                            %s, 'lightning_distance_min', 'km', 'environment-{lightning_item.source}',
                            'observed', '{{"radius_km": {lightning_item.radius_km}}}'::jsonb,
                            %s, %s::numeric, %s, %s, 'valid', NULL, NULL, 'instantaneous'
                        )
                    """, (
                        lightning_item.zone_id,
                        lightning_item.timestamp,
                        lightning_item.distance_min_km,
                        fetched_at,
                        provenance,
                    ))
                # Peak current max (kA) if available
                if lightning_item.peak_current_max_ka is not None:
                    await conn.execute(f"""
                        SELECT write_measurement(
                            %s, 'lightning_peak_current', 'kA', 'environment-{lightning_item.source}',
                            'observed', '{{"radius_km": {lightning_item.radius_km}}}'::jsonb,
                            %s, %s::numeric, %s, %s, 'valid', NULL, NULL, 'instantaneous'
                        )
                    """, (
                        lightning_item.zone_id,
                        lightning_item.timestamp,
                        lightning_item.peak_current_max_ka,
                        fetched_at,
                        provenance,
                    ))
                # Center coordinates as reference
                await conn.execute(f"""
                    SELECT write_measurement(
                        %s, 'latitude', 'degrees', 'environment-{lightning_item.source}', 'reported',
                        '{{"crs": "EPSG:4326"}}'::jsonb, %s, %s::numeric, %s, %s, 'valid', NULL, NULL, 'reference'
                    )
                """, (lightning_item.zone_id, lightning_item.timestamp, lightning_item.center_lat, fetched_at, provenance))
                await conn.execute(f"""
                    SELECT write_measurement(
                        %s, 'longitude', 'degrees', 'environment-{lightning_item.source}', 'reported',
                        '{{"crs": "EPSG:4326"}}'::jsonb, %s, %s::numeric, %s, %s, 'valid', NULL, NULL, 'reference'
                    )
                """, (lightning_item.zone_id, lightning_item.timestamp, lightning_item.center_lon, fetched_at, provenance))

            await conn.execute("""
                INSERT INTO sensor_metadata (id, friendly_name, latitude, longitude, description)
                VALUES (%s, 'Blitzortung Ried 25km', %s, %s, 'Blitzüberwachung Ried 25 km Bürstadt')
                ON CONFLICT (id) DO UPDATE SET friendly_name=EXCLUDED.friendly_name,
                    latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, description=EXCLUDED.description
            """, (lightning_item.zone_id, lightning_item.center_lat, lightning_item.center_lon))
            await conn.execute("""
                INSERT INTO sensor_data(sensor_id, metric, unit, timestamp, value)
                VALUES (%s, 'lightning_strikes', 'count', %s, %s)
                ON CONFLICT DO NOTHING
            """, (lightning_item.zone_id, lightning_item.timestamp, lightning_item.strikes_count))
            await conn.execute("""
                INSERT INTO sensor_latest(sensor_id, metric, unit, timestamp, value)
                VALUES (%s, 'lightning_strikes', 'count', %s, %s)
                ON CONFLICT(sensor_id, metric, unit) DO UPDATE SET
                timestamp=EXCLUDED.timestamp, value=EXCLUDED.value
                WHERE EXCLUDED.timestamp >= sensor_latest.timestamp
            """, (lightning_item.zone_id, lightning_item.timestamp, lightning_item.strikes_count))
            updated_lightning += 1

        if payload and gauges:
            data = [
                {
                    "id": g.id,
                    "name": g.name,
                    "water_body": g.water_body,
                    "current_level_m": g.level_m,
                    "latitude": g.latitude,
                    "longitude": g.longitude,
                    "source_station_id": g.source_station_id,
                    "updated_at": g.measured_at.isoformat(),
                }
                for g in gauges
            ]
            source_time = min(g.measured_at for g in gauges)
            digest = payload["pegel_sha256"]
            await conn.execute(
                """INSERT INTO collected_dataset_versions(dataset,payload_sha256,source_updated_at,data)
                VALUES ('environment/flood/gauges',%s,%s,%s) ON CONFLICT DO NOTHING""",
                (digest, source_time, Jsonb(data)),
            )
            await conn.execute(
                """INSERT INTO collected_datasets(dataset,source_id,source_url,source_updated_at,fetched_at,expires_at,payload_sha256,data)
                VALUES ('environment/flood/gauges','environment-pegel',%s,%s,%s,%s,%s,%s)
                ON CONFLICT(dataset) DO UPDATE SET source_updated_at=EXCLUDED.source_updated_at,fetched_at=EXCLUDED.fetched_at,
                expires_at=EXCLUDED.expires_at,payload_sha256=EXCLUDED.payload_sha256,data=EXCLUDED.data
                WHERE EXCLUDED.source_updated_at >= collected_datasets.source_updated_at""",
                (
                    source_url.split("?")[0],
                    source_time,
                    fetched_at,
                    source_time + timedelta(hours=1),
                    digest,
                    Jsonb(data),
                ),
            )
            map_data = {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [g.longitude, g.latitude],
                        },
                        "properties": {
                            "name": g.name,
                            "level_m": g.level_m,
                            "measured_at": g.measured_at.isoformat(),
                        },
                    }
                    for g in gauges
                    if g.latitude is not None and g.longitude is not None
                ],
            }
            await conn.execute(
                """INSERT INTO collected_datasets(dataset,source_id,source_url,source_updated_at,fetched_at,expires_at,payload_sha256,data)
                VALUES ('map/layers/floods','environment-pegel',%s,%s,%s,%s,%s,%s)
                ON CONFLICT(dataset) DO UPDATE SET source_updated_at=EXCLUDED.source_updated_at,fetched_at=EXCLUDED.fetched_at,
                expires_at=EXCLUDED.expires_at,payload_sha256=EXCLUDED.payload_sha256,data=EXCLUDED.data
                WHERE EXCLUDED.source_updated_at >= collected_datasets.source_updated_at""",
                (
                    source_url.split("?")[0],
                    source_time,
                    fetched_at,
                    source_time + timedelta(hours=1),
                    digest,
                    Jsonb(map_data),
                ),
            )

        if payload:
            counts = {
                'pegel': (updated_gauges, 'gauges'),
                'weather': (updated_weather, 'metrics'),
                'radolan': (updated_radar, 'metrics'),
                'mosmix': (updated_forecasts, 'metrics'),
                'blitzortung': (updated_lightning if lightning_item and lightning_item.source == 'blitzortung' else 0, 'observations'),
                'xweather': (updated_lightning if lightning_item and lightning_item.source == 'xweather' else 0, 'observations'),
            }
            for name, (count, unit) in counts.items():
                attempt_id = payload.get(name + '_attempt_id')
                if attempt_id is None:
                    continue
                await conn.execute(
                    """UPDATE collection_attempts SET status=%s,item_count=%s,item_count_unit=%s,
                    error=%s,error_stage=%s WHERE id=%s AND source_id=%s AND status='received'""",
                    ('success' if count else 'partial', count, unit,
                     None if count else 'No usable regional observations produced',
                     None if count else 'processing', attempt_id, 'environment-' + name),
                )

    return {
        "gauges": updated_gauges,
        "weather_metrics": updated_weather,
        "radar_metrics": updated_radar,
        "forecast_metrics": updated_forecasts,
        "lightning_metrics": updated_lightning,
    }
