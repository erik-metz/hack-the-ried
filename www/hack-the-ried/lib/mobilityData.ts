import type { StationNode } from "./mapData";
import { aircraftStyle } from "./aircraftPresentation";

export interface Position {
  id: string; kind: "bus" | "train" | "waste" | "ship" | "aircraft"; latitude: number; longitude: number;
  display_latitude?: number; display_longitude?: number; display_timestamp?: string; display_basis?: "course_speed_estimate";
  timestamp: string; valid_until: string; basis: "observed" | "schedule_prediction";
  icao24?: string; registration?: string; aircraft_type?: string; altitude_baro_m?: number; altitude_geom_m?: number; vertical_rate_mps?: number; reception?: string; attribution?: string;
  ogn_category?: number; emitter_category?: string; altitude_ogn_m?: number; vertical_rate_ogn_mps?: number;
  name?: string; mmsi?: string; course_deg?: number; heading_deg?: number; ship_type?: number; length_m?: number; beam_m?: number; source_url?: string; source_id?: string;
  line?: string; destination?: string; speed_kmh?: number; geometry_basis?: string; delay_basis?: string; delay_seconds?: number;
}
export interface Crossing {
  id: string; entity_id: string; name: string; barrier: string; latitude: number; longitude: number;
  status: "open" | "closing_soon" | "closed" | "unknown";
  timestamp?: string; valid_until?: string; basis?: string; members?: string[];
}
export function crossingStatus(crossing: Crossing, now: number): Crossing["status"] {
  return crossing.valid_until && Date.parse(crossing.valid_until) > now &&
    ["open", "closing_soon", "closed"].includes(crossing.status) ? crossing.status : "unknown";
}
export function crossingLabel(status: Crossing["status"]) {
  return { open: "Offen", closing_soon: "Schließt bald", closed: "Geschlossen", unknown: "Status unbekannt" }[status];
}
export function crossingSites(geometry: unknown, live: Crossing[], now: number): Crossing[] {
  const sites: Crossing[] = [];
  const features = (geometry as { features?: { geometry?: { type: string; coordinates: number[] }; properties?: Record<string, unknown> }[] })?.features ?? [];
  for (const feature of features) {
    const p = feature.properties ?? {};
    if (feature.geometry?.type !== "Point" || !["yes", "full", "half", "double_half"].includes(String(p.barrier))) continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) continue;
    const id = String(p.id);
    const current = live.find(c => c.id === id || c.members?.includes(id));
    if (current) {
      if (!sites.some(s => s.id === current.id)) sites.push({ ...current, status: crossingStatus(current, now) });
    } else {
      const name = String(p.name ?? "Bahnübergang");
      // Multiple track nodes for one named barrier should not stack markers.
      const nearby = sites.find(s => s.name === name && s.barrier === p.barrier && Math.hypot(
        (s.latitude-latitude)*111320, (s.longitude-longitude)*111320*Math.cos(latitude*Math.PI/180)) <= 30);
      if (!nearby) sites.push({ id, entity_id: `crossing:${id}`, name, barrier: String(p.barrier), latitude, longitude, status: "unknown" });
    }
  }
  for (const crossing of live) if (!sites.some(s => s.id === crossing.id)) sites.push({ ...crossing, status: crossingStatus(crossing, now) });
  return sites;
}
export function mobilityNodes(positions: Position[], crossings: Crossing[], now: number): StationNode[] {
  return [
    ...crossings.map(c => ({ id: c.entity_id, name: c.name, locationName: "Bahnübergang", address: "Berechneter Schrankenstatus aus Fahrplanpositionen · keine Live-Messung", lat: c.latitude, lng: c.longitude,
      categories: ["traffic"] as StationNode["categories"], readings: crossingStatus(c, now) !== "unknown" && c.timestamp ? [{ metric: "crossing_state", unit: "state", value: { open: 0, closing_soon: 1, closed: 2, unknown: -1 }[c.status], timestamp: c.timestamp }] : [] })),
    ...positions.filter(p => Date.parse(p.valid_until)>now).map(p => ({ id: `movement:${p.id}`, name: `${p.kind === "aircraft" ? aircraftStyle(p).label : { train: "Zug", bus: "Bus", waste: "Abfallsammlung", ship: "Schiff", aircraft: "Flugzeug" }[p.kind]} ${p.name ?? p.registration ?? p.line ?? ""} ${p.destination ?? ""}`.trim(), locationName: "Mobilität", address: p.basis === "observed" ? (p.kind === "aircraft" ? `Empfangene Flugposition · ${p.source_id === "ogn-ried" ? "Open Glider Network" : "adsb.lol"} · ODbL 1.0 · Empfang kann lückenhaft sein` : p.kind === "ship" ? (p.source_id === "rhein-map" ? "AIS-Kartenposition · Empfang kann lückenhaft sein" : "AIS-Position · AISstream · Empfang kann lückenhaft sein") : "Beobachtete Position") : "Fahrplan-/Tourenprognose · berechnete Position und Geschwindigkeit", lat: p.latitude, lng: p.longitude,
      categories: ["traffic"] as StationNode["categories"], readings: [
        ...(typeof p.speed_kmh === "number" ? [{ metric: "speed", unit: "km/h", value: p.speed_kmh, timestamp: p.timestamp }] : []),
        ...(typeof p.altitude_baro_m === "number" ? [{ metric: "altitude_baro", unit: "m", value: p.altitude_baro_m, timestamp: p.timestamp }] : []),
        ...(typeof p.altitude_geom_m === "number" ? [{ metric: "altitude_geom", unit: "m", value: p.altitude_geom_m, timestamp: p.timestamp }] : []),
        ...(typeof p.vertical_rate_mps === "number" ? [{ metric: "vertical_rate", unit: "m/s", value: p.vertical_rate_mps, timestamp: p.timestamp }] : []),
        ...(typeof p.altitude_ogn_m === "number" ? [{ metric: "altitude_ogn", unit: "m", value: p.altitude_ogn_m, timestamp: p.timestamp }] : []),
        ...(typeof p.vertical_rate_ogn_mps === "number" ? [{ metric: "vertical_rate_ogn", unit: "m/s", value: p.vertical_rate_ogn_mps, timestamp: p.timestamp }] : []),
        ...(typeof p.delay_seconds === "number" ? [{ metric: "delay", unit: "s", value: p.delay_seconds, timestamp: p.timestamp }] : []),
        { metric: "latitude", unit: "degrees", value: p.latitude, timestamp: p.timestamp },
        { metric: "longitude", unit: "degrees", value: p.longitude, timestamp: p.timestamp },
      ] })),
  ];
}
