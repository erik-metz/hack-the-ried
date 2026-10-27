export type Fuel = "e5" | "e10" | "diesel";
export const FUEL_LABELS: Record<Fuel, string> = { e5: "Super E5", e10: "Super E10", diesel: "Diesel" };
export interface FuelStation {
  id: string; name: string; brand: string; street: string; houseNumber: string; postCode: string; place: string;
  latitude: number; longitude: number; is_open: boolean; e5: number | null; e10: number | null; diesel: number | null;
}
export interface FuelSnapshot {
  fetched_at: string | null; stations: FuelStation[]; center: [number, number]; radius_km: number;
}
export function decodeFuel(value: unknown): FuelSnapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid fuel snapshot");
  const data = value as FuelSnapshot;
  if (!Array.isArray(data.stations) || data.stations.length > 1000 ||
      !Array.isArray(data.center) || data.center.length !== 2 || !data.center.every(Number.isFinite) ||
      !Number.isFinite(data.radius_km) || data.radius_km <= 0 || data.radius_km > 25 ||
      (data.fetched_at !== null && (typeof data.fetched_at !== "string" || !Number.isFinite(Date.parse(data.fetched_at)))) ||
      (data.stations.length > 0 && data.fetched_at === null)) throw new Error("Invalid fuel snapshot");
  const ids = new Set<string>();
  for (const station of data.stations) {
    if (!station || typeof station.id !== "string" || ids.has(station.id) ||
        !Number.isFinite(station.latitude) || Math.abs(station.latitude) > 90 ||
        !Number.isFinite(station.longitude) || Math.abs(station.longitude) > 180 || typeof station.is_open !== "boolean" ||
        ![station.name, station.brand, station.street, station.houseNumber, station.postCode, station.place].every(v => typeof v === "string") ||
        ![station.e5, station.e10, station.diesel].every(v => v === null || (Number.isInteger(v) && v > 0 && v < 10000))) throw new Error("Invalid fuel station");
    ids.add(station.id);
  }
  return data;
}
export function fuelFresh(snapshot: FuelSnapshot | null, now: number): boolean {
  const age = snapshot?.fetched_at ? now - Date.parse(snapshot.fetched_at) : Infinity;
  return age >= 0 && age <= 900_000;
}
export function formatFuelPrice(value: number | null): string {
  return value === null ? "Nicht verfügbar" : `${(value / 1000).toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/l`;
}
export function fuelDistance(station: FuelStation, center: [number, number]): number {
  const rad = Math.PI / 180;
  const a = Math.sin((station.latitude-center[0])*rad/2)**2 + Math.cos(center[0]*rad)*Math.cos(station.latitude*rad)*Math.sin((station.longitude-center[1])*rad/2)**2;
  return 6371*2*Math.asin(Math.min(1, Math.sqrt(a)));
}
export function compareFuel(stations: FuelStation[], fuel: Fuel, sort: "price" | "distance", center: [number, number]) {
  return [...stations].sort((a, b) => sort === "distance" ? fuelDistance(a, center)-fuelDistance(b, center) :
    (a[fuel] ?? Infinity)-(b[fuel] ?? Infinity) || a.name.localeCompare(b.name, "de"));
}
