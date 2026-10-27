/** Model positions are supplied by the backend; never relocate them into the Ried. */
export interface SatellitePosition {
  id: string; norad_id: number; name: string; latitude: number; longitude: number;
  altitude_km: number; speed_km_s: number; timestamp: string; element_epoch: string;
  element_age_seconds: number; basis: "model"; source: "space-track";
}
export interface SatelliteSnapshot { positions: SatellitePosition[]; timestamp: string; last_import: string | null; available: boolean; catalog_count: number }
export const SATELLITE_FRESH_MS = 5000;
export function satelliteFresh(position: SatellitePosition, now: number) {
  const stamp = Date.parse(position.timestamp);
  return Number.isFinite(stamp) && stamp <= now + SATELLITE_FRESH_MS && stamp + SATELLITE_FRESH_MS > now;
}
export function decodeSatellites(value: unknown, now = Date.now()): SatelliteSnapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid satellite snapshot");
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.positions) || body.positions.length > 500 || typeof body.timestamp !== "string"
    || !Number.isFinite(Date.parse(body.timestamp)) || Math.abs(Date.parse(body.timestamp)-now) > SATELLITE_FRESH_MS) throw new Error("Invalid or stale satellite snapshot");
  const positions = body.positions.filter((value): value is SatellitePosition => {
    if (!value || typeof value !== "object") return false;
    const p = value as SatellitePosition;
    return Number.isInteger(p.norad_id) && p.norad_id > 0 && p.norad_id <= 999999999
      && p.id === `satellite:${p.norad_id}` && typeof p.name === "string"
      && p.source === "space-track" && p.basis === "model"
      && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90
      && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180
      && Number.isFinite(p.altitude_km) && p.altitude_km >= 0
      && Number.isFinite(p.speed_km_s) && p.speed_km_s >= 0
      && Number.isFinite(p.element_age_seconds) && p.element_age_seconds >= 0 && p.element_age_seconds <= 864000
      && typeof p.element_epoch === "string" && Number.isFinite(Date.parse(p.element_epoch)) && satelliteFresh(p, now);
  });
  return { positions, timestamp: body.timestamp,
    available: body.status === "ready" || (body.status === undefined && positions.length > 0),
    catalog_count: Number.isInteger(body.catalog_count) && Number(body.catalog_count) >= 0 ? Number(body.catalog_count) : 0,
    last_import: typeof body.last_import === "string" && Number.isFinite(Date.parse(body.last_import)) ? body.last_import : null };
}
export function satelliteDetails(p: SatellitePosition): string[] {
  return [`NORAD-ID: ${p.norad_id}`, `Höhe: ${p.altitude_km.toFixed(1)} km`,
    `Geschwindigkeit: ${p.speed_km_s.toFixed(2)} km/s`,
    `Bahnelemente: ${(p.element_age_seconds/3600).toFixed(1)} Stunden alt`,
    `Stand: ${new Date(p.timestamp).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
    "Quelle: Space-Track · SGP4 · berechnete Bodenprojektion, keine Live-Messung."];
}
