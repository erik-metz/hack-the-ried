/** Presentation of collected DB infrastructure; no generated coordinates or states. */
export interface BahnObject {
  id: string;
  provider_id: string;
  type: string;
  name: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  quay_type?: string | null;
  parent_ref?: string | null;
  equipment_refs?: string[];
  container_ref?: string | null;
}

export interface BahnStation extends BahnObject {
  eva_number: string | null;
  eva_numbers: string[];
  ds100_codes: string[];
  station_number: string | null;
  components: BahnObject[];
}

export interface BahnFacility extends BahnObject {
  station_id: string;
  eva_number: string | null;
  status: "available" | "notAvailable" | "partiallyAvailable" | "unknown";
  status_basis: "reported" | "not_reported";
  description: string | null;
}

export interface BahnSnapshot<T> {
  data: T;
  sourceUpdatedAt: string;
  fetchedAt: string;
  expiresAt: string;
}

export interface BahnMarker {
  id: string;
  stationId: string;
  stationName: string;
  name: string;
  typeLabel: string;
  latitude: number;
  longitude: number;
  statusLabel: string;
  positionLabel: string;
}

export interface BahnLocation {
  objectId: string;
  coordinates: { latitude: number; longitude: number };
  basis: "own" | "equipment_place";
}

/** Resolve only explicit, station-local equipment references, including during rolling deploys. */
export function objectLocations(station: BahnStation, object: BahnObject): BahnLocation[] {
  if (validCoordinates(object.coordinates)) return [{ objectId: object.id, coordinates: object.coordinates, basis: "own" }];
  if (!object.type.endsWith("Equipment")) return [];
  return station.components.filter(place => place.type === "EquipmentPlace"
    && place.equipment_refs?.includes(object.provider_id) && validCoordinates(place.coordinates))
    .map(place => ({ objectId: place.id, coordinates: place.coordinates!, basis: "equipment_place" }));
}

const TYPE_LABELS: Record<string, string> = {
  StopPlace: "Bahnhof", Quay: "Bahnsteig", AccessSpace: "Zugang / Aufenthaltsbereich",
  Entrance: "Eingang", EquipmentPlace: "Anlagenstandort", LiftEquipment: "Aufzug",
  EscalatorEquipment: "Rolltreppe", TravelatorEquipment: "Fahrsteig",
  StaircaseEquipment: "Treppe", RampEquipment: "Rampe", EntranceEquipment: "Tür / Eingangsanlage",
  AccessVehicleEquipment: "Einstiegshilfe", PassengerInformationEquipment: "Fahrgastinformation",
};

export function objectTypeLabel(object: Pick<BahnObject, "type" | "quay_type">): string {
  if (object.type === "Quay") {
    if (object.quay_type === "railPlatform") return "Bahnsteigkante / Gleis";
    if (object.quay_type === "railPlatformSector") return "Bahnsteigabschnitt";
  }
  return TYPE_LABELS[object.type] ?? "Infrastruktur-Objekt";
}

export function isFresh(snapshot: BahnSnapshot<unknown> | null, now: number): boolean {
  return snapshot !== null && Number.isFinite(Date.parse(snapshot.expiresAt))
    && Date.parse(snapshot.expiresAt) > now;
}

export function facilityStatus(facility: BahnFacility | undefined, expiresAt: string | undefined, now: number) {
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now)) return { label: "Status veraltet", tone: "stale" };
  if (!facility || !expiresAt || facility.status_basis !== "reported") return { label: "Keine Statusmeldung", tone: "unknown" };
  switch (facility.status) {
    case "available": return { label: "Verfügbar", tone: "available" };
    case "notAvailable": return { label: "Nicht verfügbar", tone: "unavailable" };
    case "partiallyAvailable": return { label: "Teilweise verfügbar", tone: "partial" };
    default: return { label: "Status unbekannt", tone: "unknown" };
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validCoordinates(value: unknown): value is { latitude: number; longitude: number } {
  return record(value) && typeof value.latitude === "number" && typeof value.longitude === "number"
    && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

function validObject(value: unknown): value is BahnObject {
  return record(value) && typeof value.id === "string" && value.id.length > 0
    && typeof value.provider_id === "string" && typeof value.type === "string"
    && (value.name === null || typeof value.name === "string")
    && (value.coordinates === null || validCoordinates(value.coordinates));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

export async function fetchBahn<T extends "stations" | "facilities">(
  kind: T, signal?: AbortSignal,
): Promise<BahnSnapshot<T extends "stations" ? BahnStation[] : BahnFacility[]>> {
  const response = await fetch(`/api/bahn/${kind}`, { signal });
  if (!response.ok) {
    throw new Error(response.headers.get("x-data-expires-at")
      ? "Die gespeicherten Daten sind abgelaufen." : "Die Daten sind momentan nicht erreichbar.");
  }
  const sourceUpdatedAt = response.headers.get("x-source-updated-at");
  const fetchedAt = response.headers.get("x-collected-at");
  const expiresAt = response.headers.get("x-data-expires-at");
  const now = Date.now();
  if (!sourceUpdatedAt || !fetchedAt || !expiresAt
      || ![sourceUpdatedAt, fetchedAt, expiresAt].every(value => Number.isFinite(Date.parse(value)))
      || Date.parse(sourceUpdatedAt) > now + 300000 || Date.parse(fetchedAt) > now + 300000
      || Date.parse(expiresAt) <= now) {
    throw new Error("Die Aktualität der Daten konnte nicht bestätigt werden.");
  }
  const body: unknown = await response.json();
  if (!record(body) || !Array.isArray(body[kind])) throw new Error("Die Bahn-Daten sind unvollständig.");
  const items = body[kind];
  if (!items.every(validObject) || new Set(items.map(item => item.id)).size !== items.length) {
    throw new Error("Die Infrastruktur-Daten sind ungültig.");
  }
  if (kind === "stations") {
    if (!items.every(item => record(item) && stringArray(item.eva_numbers) && stringArray(item.ds100_codes)
      && Array.isArray(item.components) && item.components.every(validObject))) {
      throw new Error("Die Bahnhofsdaten sind unvollständig.");
    }
  } else if (!items.every(item => record(item) && typeof item.station_id === "string"
      && ["available", "notAvailable", "partiallyAvailable", "unknown"].includes(String(item.status))
      && ["reported", "not_reported"].includes(String(item.status_basis)))) {
    throw new Error("Die Anlagenzustände sind ungültig.");
  }
  return { data: items, sourceUpdatedAt, fetchedAt, expiresAt } as BahnSnapshot<T extends "stations" ? BahnStation[] : BahnFacility[]>;
}

export function filterStations(stations: BahnStation[], query: string): BahnStation[] {
  const term = query.trim().toLocaleLowerCase("de-DE");
  return stations.filter(station => [station.name ?? "", ...station.eva_numbers, ...station.ds100_codes]
    .join(" ").toLocaleLowerCase("de-DE").includes(term));
}

export function infrastructureMarkers(stations: BahnStation[], facilities: BahnSnapshot<BahnFacility[]> | null, now: number): BahnMarker[] {
  const states = new Map(facilities?.data.map(facility => [facility.id, facility]) ?? []);
  return stations.flatMap(station => [station, ...station.components]
    .filter(object => object.type !== "EquipmentPlace" || !station.components.some(equipment =>
      equipment.type.endsWith("Equipment") && object.equipment_refs?.includes(equipment.provider_id)
      && !validCoordinates(equipment.coordinates)))
    .flatMap(object => objectLocations(station, object).map(location => ({
      id: object.id, stationId: station.id, stationName: station.name ?? "Bahnhof",
      name: object.name ?? objectTypeLabel(object), typeLabel: objectTypeLabel(object),
      latitude: location.coordinates.latitude, longitude: location.coordinates.longitude,
      statusLabel: facilityStatus(states.get(object.id), facilities?.expiresAt, now).label,
      positionLabel: location.basis === "own" ? "Eigene gemeldete Position" : "Position des referenzierten Anlagenstandorts",
    }))));
}

export function osmLocation(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}
