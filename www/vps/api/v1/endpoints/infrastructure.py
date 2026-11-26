"""Infrastructure, Energy & Connectivity endpoints for the Hessian Ried.
Covers Road Conditions (ZAKB Fleet AI), Renewable Energy (ZAKB Biogas & Solar),
Broadband Rollout, EV Charging Stations, and Public Wi-Fi Hotspots.
"""

import json
import math
from datetime import UTC, datetime
from typing import Annotated, Any

import psycopg_pool
from dependencies import get_db_pool
from fastapi import APIRouter, Depends, Query
from measurement_reads import latest_value_join
from pydantic import BaseModel

router = APIRouter(prefix="/infrastructure", tags=["Infrastructure & Energy"])

DbPool = Annotated[psycopg_pool.AsyncConnectionPool, Depends(get_db_pool)]


# --- 1. Road Conditions ---
class RoadSegmentResponse(BaseModel):
    id: str
    road_name: str
    road_class: str
    municipality: str
    district: str | None = None
    condition_grade: float
    condition_category: str
    potholes_count: int
    cracking_severity: str
    surface_type: str
    last_inspected_at: datetime
    inspected_by: str
    coordinates: list[list[float]]


class RoadConditionSummary(BaseModel):
    total_segments: int
    average_condition_grade: float
    good_condition_pct: float
    critical_condition_pct: float


class RoadConditionResponse(BaseModel):
    summary: RoadConditionSummary
    segments: list[RoadSegmentResponse]


# --- 2. Renewable Energy ---
class EnergyFacilityResponse(BaseModel):
    id: str
    name: str
    facility_type: str
    operator: str
    municipality: str
    address: str | None = None
    latitude: float
    longitude: float
    installed_capacity_kw: float
    annual_generation_mwh_est: float | None = None
    commissioned_date: str | None = None
    mastr_id: str | None = None
    description: str | None = None
    current_power_kw: float | None = None
    today_yield_kwh: float | None = None


class EnergyGenerationSummary(BaseModel):
    timestamp: datetime
    total_installed_capacity_kw: float
    current_total_power_kw: float
    current_total_power_mw: float
    today_total_energy_kwh: float
    today_co2_avoided_kg: float
    by_type_kw: dict[str, float]
    facilities: list[EnergyFacilityResponse]


# --- 3. Broadband ---
class BroadbandAreaResponse(BaseModel):
    id: str
    municipality: str
    district: str
    area_name: str
    tech_type: str
    max_download_mbps: int
    max_upload_mbps: int
    rollout_status: str
    contract_quota_pct: float | None = None
    primary_provider: str
    completion_target_date: str | None = None
    coordinates: list[list[float]] | None = None


class BroadbandSummary(BaseModel):
    total_areas: int
    active_fibre_areas: int
    in_construction_areas: int
    areas: list[BroadbandAreaResponse]


# --- 4. EV Charging ---
class EvChargingStationResponse(BaseModel):
    id: str
    bnetza_id: str | None = None
    name: str
    operator: str
    address: str
    municipality: str
    district: str | None = None
    latitude: float
    longitude: float
    total_points: int
    max_power_kw: float
    is_fast_charger: bool
    connector_types: list[str]
    is_public: bool
    available_points: int
    occupied_points: int
    status_source: str


class EvChargingSummary(BaseModel):
    total_stations: int
    total_charge_points: int
    available_charge_points: int
    fast_charging_stations: int
    stations: list[EvChargingStationResponse]


# --- 5. Public Wi-Fi ---
class WifiHotspotResponse(BaseModel):
    id: str
    name: str
    ssid: str
    operator: str
    location_type: str
    address: str
    municipality: str
    latitude: float
    longitude: float
    indoor_outdoor: str
    auth_mode: str
    bandwidth_mbps: int
    is_active: bool


@router.get("/road-conditions", response_model=RoadConditionResponse)
async def get_road_conditions(
    pool: DbPool,
    municipality: str | None = Query(None, description="Filter by municipality (e.g. Bürstadt, Lampertheim)"),
):
    """Retrieve road condition segments evaluated by ZAKB waste collection fleet camera AI."""
    query = """
        SELECT id, road_name, road_class, municipality, district, condition_grade,
               condition_category, potholes_count, cracking_severity, surface_type,
               last_inspected_at, inspected_by, coordinates
        FROM road_condition_segments
    """
    params: list[Any] = []
    if municipality:
        query += " WHERE municipality ILIKE %s"
        params.append(municipality)
    query += " ORDER BY condition_grade DESC"

    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    segments: list[RoadSegmentResponse] = []
    for r in rows:
        coords = r[12] if isinstance(r[12], list) else (json.loads(r[12]) if r[12] else [])
        segments.append(
            RoadSegmentResponse(
                id=r[0],
                road_name=r[1],
                road_class=r[2],
                municipality=r[3],
                district=r[4],
                condition_grade=float(r[5]),
                condition_category=r[6],
                potholes_count=r[7],
                cracking_severity=r[8],
                surface_type=r[9],
                last_inspected_at=r[10],
                inspected_by=r[11],
                coordinates=coords,
            )
        )

    total = len(segments)
    avg_grade = sum(s.condition_grade for s in segments) / total if total > 0 else 2.0
    good_pct = (sum(1 for s in segments if s.condition_grade <= 2.5) / total * 100.0) if total > 0 else 0.0
    crit_pct = (sum(1 for s in segments if s.condition_grade >= 4.0) / total * 100.0) if total > 0 else 0.0

    return RoadConditionResponse(
        summary=RoadConditionSummary(
            total_segments=total,
            average_condition_grade=round(avg_grade, 2),
            good_condition_pct=round(good_pct, 1),
            critical_condition_pct=round(crit_pct, 1),
        ),
        segments=segments,
    )


@router.get("/energy/summary", response_model=EnergyGenerationSummary)
async def get_energy_summary(pool: DbPool):
    """Retrieve real-time renewable energy production estimates for ZAKB and regional plants."""
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            SELECT id, name, facility_type, operator, municipality, address,
                   latitude, longitude, installed_capacity_kw, annual_generation_mwh_est,
                   commissioned_date::text, mastr_id, description
            FROM energy_facilities
            ORDER BY installed_capacity_kw DESC
            """
        )
        rows = await cur.fetchall()

    now = datetime.now(UTC)
    hour = now.hour + now.minute / 60.0

    # Solar diurnal factor (peaking around 13:00 UTC)
    if 6.0 <= hour <= 20.0:
        sun_angle = math.sin((hour - 6.0) / 14.0 * math.pi)
        solar_factor = max(0.0, sun_angle) * 0.78  # ~78% of peak on a clear afternoon
    else:
        solar_factor = 0.0

    total_cap = 0.0
    total_power = 0.0
    by_type: dict[str, float] = {}
    facilities: list[EnergyFacilityResponse] = []

    for r in rows:
        fac_type = r[2]
        cap_kw = float(r[8])
        total_cap += cap_kw

        # Biogas and landfill gas run continuous baseload (85-95%)
        if fac_type in ("biogas", "landfill_gas", "biomass"):
            curr_kw = round(cap_kw * 0.90, 1)
        elif fac_type == "solar_pv":
            curr_kw = round(cap_kw * solar_factor, 1)
        else:
            curr_kw = round(cap_kw * 0.50, 1)

        # Estimate daily yield
        if fac_type in ("biogas", "landfill_gas"):
            today_kwh = round(curr_kw * hour, 1)
        else:
            today_kwh = round(cap_kw * 4.2 * min(1.0, max(0.1, hour / 18.0)), 1)

        total_power += curr_kw
        by_type[fac_type] = round(by_type.get(fac_type, 0.0) + curr_kw, 1)

        facilities.append(
            EnergyFacilityResponse(
                id=r[0],
                name=r[1],
                facility_type=r[2],
                operator=r[3],
                municipality=r[4],
                address=r[5],
                latitude=float(r[6]),
                longitude=float(r[7]),
                installed_capacity_kw=cap_kw,
                annual_generation_mwh_est=float(r[9]) if r[9] else None,
                commissioned_date=r[10],
                mastr_id=r[11],
                description=r[12],
                current_power_kw=curr_kw,
                today_yield_kwh=today_kwh,
            )
        )

    today_energy = sum(f.today_yield_kwh or 0.0 for f in facilities)
    # 0.40 kg CO2 saved per kWh green electricity in Germany
    today_co2 = round(today_energy * 0.40, 1)

    return EnergyGenerationSummary(
        timestamp=now,
        total_installed_capacity_kw=round(total_cap, 1),
        current_total_power_kw=round(total_power, 1),
        current_total_power_mw=round(total_power / 1000.0, 2),
        today_total_energy_kwh=round(today_energy, 1),
        today_co2_avoided_kg=today_co2,
        by_type_kw=by_type,
        facilities=facilities,
    )


@router.get("/broadband", response_model=BroadbandSummary)
async def get_broadband_coverage(pool: DbPool):
    """Retrieve broadband and fibre rollout coverage status across the Ried."""
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            SELECT id, municipality, district, area_name, tech_type, max_download_mbps,
                   max_upload_mbps, rollout_status, contract_quota_pct, primary_provider,
                   completion_target_date::text, coordinates
            FROM broadband_coverage
            ORDER BY municipality, area_name
            """
        )
        rows = await cur.fetchall()

    areas: list[BroadbandAreaResponse] = []
    for r in rows:
        coords = r[11] if isinstance(r[11], list) else (json.loads(r[11]) if r[11] else None)
        areas.append(
            BroadbandAreaResponse(
                id=r[0],
                municipality=r[1],
                district=r[2],
                area_name=r[3],
                tech_type=r[4],
                max_download_mbps=r[5],
                max_upload_mbps=r[6],
                rollout_status=r[7],
                contract_quota_pct=float(r[8]) if r[8] else None,
                primary_provider=r[9],
                completion_target_date=r[10],
                coordinates=coords,
            )
        )

    active_fibre = sum(1 for a in areas if a.tech_type == "ftth_fibre" and a.rollout_status == "active_available")
    in_construction = sum(1 for a in areas if a.rollout_status == "under_construction")

    return BroadbandSummary(
        total_areas=len(areas),
        active_fibre_areas=active_fibre,
        in_construction_areas=in_construction,
        areas=areas,
    )


@router.get("/ev-charging", response_model=EvChargingSummary)
async def get_ev_charging_stations(pool: DbPool):
    """Retrieve EV charging stations and live slot availability in the Ried."""
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            SELECT s.id, s.bnetza_id, s.name, s.operator, s.address, s.municipality, s.district,
                   s.latitude, s.longitude, s.total_points, s.max_power_kw, s.is_fast_charger,
                   s.connector_types, s.is_public,
                   COALESCE(st.available_points, s.total_points) as available_points,
                   COALESCE(st.occupied_points, 0) as occupied_points,
                   COALESCE(st.status_source, 'static_register') as status_source
            FROM ev_charging_stations s
            LEFT JOIN ev_charging_status st ON s.id = st.station_id
            ORDER BY s.municipality, s.name
            """
        )
        rows = await cur.fetchall()

    stations: list[EvChargingStationResponse] = []
    tot_points = 0
    tot_avail = 0
    fast_count = 0

    for r in rows:
        c_types = r[12] if isinstance(r[12], list) else (json.loads(r[12]) if r[12] else ["Type2"])
        pts = int(r[9])
        avail = int(r[14])
        tot_points += pts
        tot_avail += avail
        if r[11]:
            fast_count += 1

        stations.append(
            EvChargingStationResponse(
                id=r[0],
                bnetza_id=r[1],
                name=r[2],
                operator=r[3],
                address=r[4],
                municipality=r[5],
                district=r[6],
                latitude=float(r[7]),
                longitude=float(r[8]),
                total_points=pts,
                max_power_kw=float(r[10]),
                is_fast_charger=bool(r[11]),
                connector_types=c_types,
                is_public=bool(r[13]),
                available_points=avail,
                occupied_points=int(r[15]),
                status_source=r[16],
            )
        )

    return EvChargingSummary(
        total_stations=len(stations),
        total_charge_points=tot_points,
        available_charge_points=tot_avail,
        fast_charging_stations=fast_count,
        stations=stations,
    )


@router.get("/wifi-hotspots", response_model=list[WifiHotspotResponse])
async def get_wifi_hotspots(pool: DbPool):
    """Retrieve public Wi-Fi hotspots (Hessen-WLAN, Freifunk) in the Ried."""
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            SELECT id, name, ssid, operator, location_type, address, municipality,
                   latitude, longitude, indoor_outdoor, auth_mode, bandwidth_mbps, is_active
            FROM public_wifi_hotspots
            WHERE is_active = TRUE
            ORDER BY municipality, name
            """
        )
        rows = await cur.fetchall()

    hotspots: list[WifiHotspotResponse] = []
    for r in rows:
        hotspots.append(
            WifiHotspotResponse(
                id=r[0],
                name=r[1],
                ssid=r[2],
                operator=r[3],
                location_type=r[4],
                address=r[5],
                municipality=r[6],
                latitude=float(r[7]),
                longitude=float(r[8]),
                indoor_outdoor=r[9],
                auth_mode=r[10],
                bandwidth_mbps=r[11],
                is_active=bool(r[12]),
            )
        )
    return hotspots


# --- 6. BNetzA EMF Funkanlagen & Mobilfunk ---
class EmfSiteResponse(BaseModel):
    id: str
    name: str
    fid: int
    stob_nr: str | None = None
    stob_date: str | None = None
    method_stob: str | None = None
    providers: list[str] = []
    antenna_count: int = 0
    latitude: float | None = None
    longitude: float | None = None
    max_height_m: float | None = None
    max_safety_distance_h_m: float | None = None


class EmfSitesSummary(BaseModel):
    total_sites: int
    providers: dict[str, int]
    sites: list[EmfSiteResponse]


@router.get("/emf", response_model=EmfSitesSummary)
async def get_emf_sites(pool: DbPool):
    """Retrieve certified radio transmission sites (BNetzA EMF) from the entities & measurement core."""
    async with pool.connection() as conn, conn.cursor() as cur:
        readings = await latest_value_join(cur, left=True)
        await cur.execute(
            """
            SELECT e.id, e.name, e.metadata,
                   MAX(CASE WHEN md.metric = 'latitude' THEN lr.value END) AS latitude,
                   MAX(CASE WHEN md.metric = 'longitude' THEN lr.value END) AS longitude,
                   MAX(CASE WHEN md.metric = 'max_antenna_height' THEN lr.value END) AS max_height_m,
                   MAX(CASE WHEN md.metric = 'safety_distance_horizontal' THEN lr.value END) AS max_sa_h_m,
                   MAX(CASE WHEN md.metric = 'antenna_count' THEN lr.value END) AS antenna_count
            FROM entities e
            LEFT JOIN measurement_definitions md ON md.entity_id = e.id
                AND md.metric IN ('latitude', 'longitude', 'max_antenna_height',
                                  'safety_distance_horizontal', 'antenna_count')
            """
            + readings
            + """
            WHERE e.entity_type = 'radio_tower' AND e.is_hidden = FALSE
            GROUP BY e.id, e.name, e.metadata
            ORDER BY e.name
            """
        )
        rows = await cur.fetchall()

    sites: list[EmfSiteResponse] = []
    provider_counts: dict[str, int] = {}

    for r in rows:
        if isinstance(r, dict):
            r = tuple(r[key] for key in (
                "id", "name", "metadata", "latitude", "longitude", "max_height_m", "max_sa_h_m", "antenna_count"
            ))
        meta = r[2] if isinstance(r[2], dict) else json.loads(r[2] or "{}")
        provs = meta.get("providers", [])
        for p in provs:
            provider_counts[p] = provider_counts.get(p, 0) + 1

        lat = float(r[3]) if r[3] is not None else None
        lon = float(r[4]) if r[4] is not None else None
        max_h = float(r[5]) if r[5] is not None else None
        max_sa_h = float(r[6]) if r[6] is not None else None
        ant_cnt = int(r[7]) if r[7] is not None else int(meta.get("antenna_count", 0))

        sites.append(
            EmfSiteResponse(
                id=r[0],
                name=r[1],
                fid=int(meta.get("fid", 0)),
                stob_nr=meta.get("stob_nr"),
                stob_date=meta.get("stob_date"),
                method_stob=meta.get("method_stob"),
                providers=provs,
                antenna_count=ant_cnt,
                latitude=lat,
                longitude=lon,
                max_height_m=max_h,
                max_safety_distance_h_m=max_sa_h,
            )
        )

    return EmfSitesSummary(
        total_sites=len(sites),
        providers=provider_counts,
        sites=sites,
    )

