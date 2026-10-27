import type { FeatureCollection, Feature, Point } from "geojson";

export const AUTOBAHN_ROADS = ["A67", "A5", "A6"] as const;
export type AutobahnRoad = typeof AUTOBAHN_ROADS[number];
export interface AutobahnOffer {
  id: string; providerId: string; name: string; road: AutobahnRoad; lat: number; lng: number;
  direction: string | null; totalPoints: number | null; maxPointPowerKw: number | null;
  connectorTypes: string[]; providerBlocked: boolean | null; providerFuture: boolean | null;
  observedAt: string;
}
export interface AutobahnChargerSnapshot {
  offers: AutobahnOffer[]; unavailableRoads: AutobahnRoad[];
}
const MAX_AGE = 72 * 3600_000;
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid inventory");
  return value as Record<string, unknown>;
}
function optionalNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid inventory number");
  return value;
}
export function decodeAutobahnOffers(body: unknown, road: AutobahnRoad, now = Date.now()): AutobahnOffer[] {
  const data = obj(body);
  const observed = typeof data.observedAt === "string" ? Date.parse(data.observedAt) : NaN;
  if (data.road !== road || data.kind !== "electric_charging_station" || data.complete !== true || data.timestampBasis !== "collector_observed" || data.sourceUpdatedAt !== null || !Number.isFinite(observed) || observed > now + 5000 || now - observed >= MAX_AGE || !Array.isArray(data.records) || data.records.length > 1000) throw new Error("Incomplete or expired inventory");
  const seen = new Set<string>();
  return data.records.map(value => {
    const r = obj(value);
    if (typeof r.id !== "string" || !r.id || seen.has(r.id) || typeof r.providerId !== "string" || !r.providerId || r.road !== road || typeof r.name !== "string" || typeof r.lat !== "number" || !Number.isFinite(r.lat) || r.lat < 49.45 || r.lat > 49.9 || typeof r.lng !== "number" || !Number.isFinite(r.lng) || r.lng < 8.25 || r.lng > 8.75 || !Array.isArray(r.connectorTypes) || r.connectorTypes.some(x => typeof x !== "string") || (r.direction !== null && typeof r.direction !== "string") || ![null, true, false].includes(r.providerBlocked as boolean | null) || ![null, true, false].includes(r.providerFuture as boolean | null)) throw new Error("Invalid inventory record");
    seen.add(r.id);
    const totalPoints = optionalNumber(r.totalPoints);
    if (totalPoints !== null && !Number.isInteger(totalPoints)) throw new Error("Invalid point count");
    return { id: r.id, providerId: r.providerId, name: r.name, road, lat: r.lat, lng: r.lng,
      direction: r.direction as string | null, totalPoints, maxPointPowerKw: optionalNumber(r.maxPointPowerKw),
      connectorTypes: r.connectorTypes as string[], providerBlocked: r.providerBlocked as boolean | null,
      providerFuture: r.providerFuture as boolean | null, observedAt: data.observedAt as string };
  });
}
export function freshAutobahnOffers(snapshot: AutobahnChargerSnapshot | null, now: number): AutobahnOffer[] {
  return (snapshot?.offers ?? []).filter(o => { const time = Date.parse(o.observedAt); return Number.isFinite(time) && time <= now + 5000 && now - time < MAX_AGE; });
}
function distance(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const y = Math.sin((a[1] - b[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((a[0] - b[0]) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, y)));
}
/** Proximity is a review candidate, never proof of identity or a reason to sum capacity. */
export function autobahnChargerCollection(offers: AutobahnOffer[], register: FeatureCollection): FeatureCollection {
  const groups = new Map<string, AutobahnOffer[]>();
  for (const offer of offers) {
    const key = JSON.stringify([offer.road, offer.direction, offer.lng, offer.lat]);
    const group = groups.get(key) ?? []; group.push(offer); groups.set(key, group);
  }
  const features: Feature<Point>[] = [];
  for (const group of groups.values()) {
    const o = group[0];
    const candidates = register.features.flatMap(f => {
      if (f.geometry?.type !== "Point" || f.geometry.coordinates.length < 2) return [];
      const [lng, lat] = f.geometry.coordinates;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
      const meters = distance([o.lng, o.lat], [lng, lat]);
      if (meters > 75) return [];
      const p = f.properties ?? {};
      return [{ id: String(p.register_id ?? p.bnetzaId ?? p.id ?? "unbekannt"), name: String(p.name ?? p.Betreiber ?? "Registereintrag"), meters: Math.round(meters) }];
    }).sort((a, b) => a.meters - b.meters || a.id.localeCompare(b.id));
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [o.lng, o.lat] }, properties: {
      name: group.length === 1 ? o.name : `${o.road} · ${group.length} Ladeangebote · Richtung ${o.direction ?? "unbekannt"}`,
      register_source: "autobahn", offers: group, candidates, reconciliation: "proximity_only", road: o.road,
    } });
  }
  return { type: "FeatureCollection", features };
}
export function autobahnChargerRows(properties: Record<string, unknown>): string[] {
  const offers = properties.offers as AutobahnOffer[];
  const candidates = properties.candidates as { id: string; name: string; meters: number }[];
  return ["Autobahn-Anbieterinventar · keine Live-Belegung", ...offers.flatMap(o => [o.name,
    `Richtung: ${o.direction ?? "unbekannt"}`, `Anbieterkennung: ${o.providerId}`,
    `Ladepunkte laut Anbieter: ${o.totalPoints ?? "unbekannt"} · höchste Ladepunktleistung: ${o.maxPointPowerKw ?? "unbekannt"} kW`,
    `Anschlüsse: ${o.connectorTypes.join(", ") || "unbekannt"}`,
    ...(o.providerBlocked === true ? ["Anbieterkennzeichen: gesperrt"] : []), ...(o.providerFuture === true ? ["Anbieterkennzeichen: zukünftig"] : []),
    `Abgerufen: ${new Date(o.observedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} (Europe/Berlin) · Anbieteraktualisierung unbekannt`]),
    "Abgleich: keine gemeinsame Kennung belegt; Kapazitäten werden nicht addiert.",
    ...(candidates.length ? ["Registereinträge innerhalb 75 m · mögliche Zuordnung, unbestätigt:", ...candidates.map(c => `BNetzA ${c.id}: ${c.name} · ${c.meters} m`)] : ["Kein Registereintrag innerhalb 75 m im geladenen Vergleichsbestand; keine Aussage über eine Registrierung."])];
}
