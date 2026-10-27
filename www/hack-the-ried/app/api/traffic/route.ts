import { env } from "@/env";
import {
  type TrafficCorridor,
  type TrafficIncident,
} from "@/lib/trafficData";

interface DbTrafficIncident {
  id: string;
  road_name: string;
  direction: string;
  location_from: string;
  location_to: string;
  start_time: string;
  end_time?: string | null;
  last_seen_at: string;
  is_active: boolean;
  delay_seconds: number | null;
  delay_minutes: number | null;
  length_meters: number;
  length_km: number;
  severity: "minor" | "moderate" | "major" | "standstill";
  cause_type: "congestion" | "accident" | "roadwork" | "closure";
  description?: string;
  coordinates?: [number, number][];
  source: string;
  delay_kind: TrafficIncident["delayKind"];
  event_status: TrafficIncident["eventStatus"];
  provider_start_at?: string | null;
  provider_end_at?: string | null;
  overall_end_date?: string | null;
  closure_kind?: string;
  work_length_meters?: number | null;
  is_stale?: boolean;
}

interface DbCorridorStatus {
  corridor_id: string;
  road_name: string;
  name: string;
  status: "clear" | "sluggish" | "congestion" | "closure" | "unknown";
  delay_seconds: number | null;
  delay_minutes: number | null;
  active_incidents_count: number;
  description: string;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let incidents: TrafficIncident[] = [];
  let corridors: TrafficCorridor[] = [];
  let sourceMode = "database_timescaledb";

  // Try to query VPS TimescaleDB backend API if configured
  try {
    const backendIncidentsUrl = new URL("/api/v1/traffic/incidents", env.BACKEND_API_URL);
    for (const key of ["event_status", "category", "planned_days"]) {
      const value = params.get(key);
      if (value !== null) backendIncidentsUrl.searchParams.set(key, value);
    }
    const backendCorridorsUrl = new URL("/api/v1/traffic/corridors", env.BACKEND_API_URL);

    const [incidentsRes, corridorsRes] = await Promise.all([
      fetch(backendIncidentsUrl, { cache: "no-store", signal: AbortSignal.timeout(2000) }),
      fetch(backendCorridorsUrl, { cache: "no-store", signal: AbortSignal.timeout(2000) }),
    ]);

    if (incidentsRes.ok && corridorsRes.ok) {
      const dbIncidents = (await incidentsRes.json()) as DbTrafficIncident[];
      const dbCorridors = (await corridorsRes.json()) as DbCorridorStatus[];

      if (Array.isArray(dbIncidents) && Array.isArray(dbCorridors)) {
        incidents = dbIncidents.map((i) => ({
          id: i.id,
          roadName: i.road_name,
          direction: i.direction,
          locationFrom: i.location_from,
          locationTo: i.location_to,
          startTime: i.start_time,
          endTime: i.end_time,
          lastSeenAt: i.last_seen_at,
          isActive: i.is_active,
          delaySeconds: i.delay_seconds,
          delayMinutes: i.delay_minutes,
          lengthMeters: i.length_meters,
          lengthKm: i.length_km,
          severity: i.severity,
          causeType: i.cause_type,
          description: i.description,
          coordinates: i.coordinates,
          source: i.source, delayKind: i.delay_kind, eventStatus: i.event_status,
          providerStartAt: i.provider_start_at, providerEndAt: i.provider_end_at,
          overallEndDate: i.overall_end_date, closureKind: i.closure_kind,
          workLengthMeters: i.work_length_meters, isStale: i.is_stale,
        }));

        // Corridor geometry is collected separately; never merge bundled routes.
        corridors = dbCorridors.map((c) => ({ id: c.corridor_id, roadName: c.road_name,
          name: c.name, status: c.status, delayMinutes: c.delay_minutes,
          activeIncidentsCount: c.active_incidents_count, description: c.description,
          track: [], direction: "", lengthKm: 0 } as unknown as TrafficCorridor));

        sourceMode = "database_timescaledb";
      }
    } else { throw new Error("Unavailable"); }
  } catch {
    return Response.json({ error: "Traffic data unavailable" }, { status: 503 });
  }

  return Response.json(
    {
      generated_at: new Date().toISOString(),
      source_mode: sourceMode,
      network: "Ried Corridors (A67, B47, B44, A5, A6)",
      summary: {
        total_incidents: incidents.length,
        congested_corridors: corridors.filter((c) => c.status !== "clear").length,
      },
      corridors,
      incidents,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
