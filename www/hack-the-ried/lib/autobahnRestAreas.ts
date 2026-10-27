import type { AutobahnRoad } from "./autobahnChargers";
import type { StationNode } from "./mapData";

export interface AutobahnRestArea {
  id: string; providerId: string; road: AutobahnRoad; name: string; lat: number; lng: number;
  direction: string | null; carCapacity: number | null; lorryCapacity: number | null;
  observedAt: string; providerBlocked: boolean | null; providerFuture: boolean | null;
}
const MAX_AGE = 72 * 3600_000;
export function restAreaFresh(area: AutobahnRestArea, now: number) {
  const time = Date.parse(area.observedAt);
  return Number.isFinite(time) && time <= now + 5000 && now - time < MAX_AGE;
}
export function decodeRestAreas(body: unknown, road: AutobahnRoad, now = Date.now()): AutobahnRestArea[] {
  const b = body as Record<string, unknown> | null;
  if (!b || b.road !== road || b.kind !== "parking_lorry" || b.complete !== true || b.timestampBasis !== "collector_observed" || b.sourceUpdatedAt !== null || typeof b.observedAt !== "string" || !restAreaFresh({ observedAt: b.observedAt } as AutobahnRestArea, now) || !Array.isArray(b.records) || b.records.length > 1000) throw new Error("Invalid rest area snapshot");
  const ids = new Set<string>();
  return b.records.map(value => {
    const r = value as AutobahnRestArea;
    if (!r || typeof r.id !== "string" || !r.id || typeof r.providerId !== "string" || !r.providerId || ids.has(r.providerId.toLowerCase()) || r.road !== road || typeof r.name !== "string" || typeof r.lat !== "number" || !Number.isFinite(r.lat) || r.lat < 49.45 || r.lat > 49.9 || typeof r.lng !== "number" || !Number.isFinite(r.lng) || r.lng < 8.25 || r.lng > 8.75 || (r.direction !== null && typeof r.direction !== "string") || [r.carCapacity, r.lorryCapacity].some(n => n !== null && (!Number.isSafeInteger(n) || n < 0)) || [r.providerBlocked,r.providerFuture].some(v => ![null,true,false].includes(v))) throw new Error("Invalid rest area record");
    ids.add(r.providerId.toLowerCase());
    return { id:r.id, providerId:r.providerId, road, name:r.name, lat:r.lat, lng:r.lng, direction:r.direction, carCapacity:r.carCapacity, lorryCapacity:r.lorryCapacity, providerBlocked:r.providerBlocked, providerFuture:r.providerFuture, observedAt:b.observedAt as string };
  });
}
/** Exact DATEX identity only. Nearby or similarly named opposite carriageways never match. */
export function restAreaMatch(area: AutobahnRestArea, nodes: StationNode[]) {
  const matches = nodes.filter(n => n.id.toLowerCase() === `rast-${area.providerId.toLowerCase()}`);
  if (matches.length !== 1) return undefined;
  const n = matches[0];
  // Reject inconsistent geometry rather than silently joining a reused/misconfigured ID.
  if (n.lat === null || n.lng === null || !Number.isFinite(n.lat) || !Number.isFinite(n.lng) || Math.abs(n.lat-area.lat) > .005 || Math.abs(n.lng-area.lng) > .008) return undefined;
  return n;
}
export function restAreaRows(area: AutobahnRestArea, nodes: StationNode[], now: number): string[] {
  const node = restAreaMatch(area, nodes);
  const count = (metric: string) => node?.readings.find(r => r.metric === metric && Number.isSafeInteger(r.value) && r.value >= 0 && Number.isFinite(Date.parse(r.timestamp)) && Date.parse(r.timestamp) <= now + 5000 && now-Date.parse(r.timestamp) < 30*60_000);
  const free = count("parking_free"), capacity = count("parking_capacity");
  return [`Autobahn-Kennung: ${area.providerId}`, `Fahrtrichtung laut Inventar: ${area.direction ?? "unbekannt"}`,
    `Autobahn-Inventar: ${area.carCapacity ?? "unbekannt"} PKW · ${area.lorryCapacity ?? "unbekannt"} LKW`,
    `Inventar abgerufen: ${new Date(area.observedAt).toLocaleString("de-DE", {timeZone:"Europe/Berlin"})} (Europe/Berlin) · Anbieteraktualisierung unbekannt`,
    ...(area.providerBlocked ? ["Anbieterkennzeichen: gesperrt"] : []), ...(area.providerFuture ? ["Anbieterkennzeichen: zukünftig"] : []),
    ...(node ? [`Zuordnung über identische DATEX-Kennung: ${node.name}`, ...(node.address ? [node.address] : []),
      free ? `rast-monitor: ${free.value} freie LKW-Plätze · Datenzeit ${new Date(free.timestamp).toLocaleString("de-DE", {timeZone:"Europe/Berlin"})} (Europe/Berlin)` : "Keine aktuelle LKW-Belegung verfügbar (Grenze: 30 Minuten).",
      ...(capacity ? [`rast-monitor-Kapazität: ${capacity.value} LKW`, ...(area.lorryCapacity !== null && area.lorryCapacity !== capacity.value ? ["Kapazitätsabweichung zwischen den Quellen; Werte werden nicht verrechnet."] : [])] : []),
      "Belegung kann modellbasiert sein; Datenzeit ist keine bestätigte Messzeit."] : ["Keine eindeutige Zuordnung zu geladenen Belegungsdaten."]),
    "Inventarkapazitäten liefern keine freien Plätze und werden nicht addiert."];
}
