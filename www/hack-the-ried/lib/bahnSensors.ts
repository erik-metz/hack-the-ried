import { objectLocations, objectTypeLabel, type BahnStation } from "./bahnData";

export interface BahnSensor {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  readings: { metric: string; value: number; unit: string; timestamp: string }[];
}
export interface SensorInventory {
  sensors: BahnSensor[];
  generatedAt: string;
  unlocated: number;
}
export interface SensorCandidate {
  sensor: BahnSensor;
  distanceMeters: number;
  referenceObjectId: string;
  referenceName: string;
  stationIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validPosition = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon)
  && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

export async function fetchSensorInventory(signal?: AbortSignal): Promise<SensorInventory> {
  const response = await fetch("/api/bahn/sensors", { signal });
  if (!response.ok) throw new Error("Sensorstandorte sind momentan nicht erreichbar.");
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.generated_at !== "string" || !Array.isArray(body.sensors)
    || !Number.isFinite(Date.parse(body.generated_at)) || Math.abs(Date.now() - Date.parse(body.generated_at)) > 300000) {
    throw new Error("Die Aktualität der Sensorstandorte konnte nicht bestätigt werden.");
  }
  const sensors: BahnSensor[] = [];
  const seen = new Set<string>();
  let unlocated = 0;
  for (const item of body.sensors) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || seen.has(item.id)
      || typeof item.friendly_name !== "string" || !Array.isArray(item.readings)) {
      throw new Error("Sensorstandorte sind unvollständig.");
    }
    seen.add(item.id);
    if (!validPosition(item.latitude, item.longitude)) { unlocated++; continue; }
    const readings: BahnSensor["readings"] = [];
    for (const reading of item.readings) {
      if (isRecord(reading) && typeof reading.metric === "string" && typeof reading.unit === "string"
        && typeof reading.value === "number" && Number.isFinite(reading.value)
        && typeof reading.timestamp === "string" && Number.isFinite(Date.parse(reading.timestamp))) {
        readings.push({ metric: reading.metric, unit: reading.unit, value: reading.value, timestamp: reading.timestamp });
      }
    }
    sensors.push({ id: item.id, name: item.friendly_name, latitude: item.latitude as number,
      longitude: item.longitude as number, readings });
  }
  return { sensors, generatedAt: body.generated_at, unlocated };
}

/** Great-circle distance; rounded only for display, never for the radius comparison. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2
    + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lon2 - lon1) * radians / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function sensorCandidates(stations: BahnStation[], stationId: string, sensors: BahnSensor[], radius: number): SensorCandidate[] {
  if (!Number.isFinite(radius) || radius <= 0 || radius > 1000) return [];
  const references = stations.map(station => ({ stationId: station.id,
    positions: [station, ...station.components].flatMap(object => objectLocations(station, object)
      .map(location => {
        const reference = [station, ...station.components].find(item => item.id === location.objectId) ?? object;
        return { ...location, name: reference.name ?? objectTypeLabel(reference) };
      })),
  }));
  const result: SensorCandidate[] = [];
  for (const sensor of sensors) {
    if (!validPosition(sensor.latitude, sensor.longitude)) continue;
    const matches = references.flatMap(station => {
      const nearest = station.positions.map(position => ({ ...position,
        distance: distanceMeters(sensor.latitude, sensor.longitude, position.coordinates.latitude, position.coordinates.longitude),
      })).sort((a, b) => a.distance - b.distance)[0];
      return nearest && nearest.distance <= radius ? [{ stationId: station.stationId, nearest }] : [];
    });
    const selected = matches.find(match => match.stationId === stationId);
    if (selected) result.push({ sensor, distanceMeters: selected.nearest.distance,
      referenceObjectId: selected.nearest.objectId, referenceName: selected.nearest.name,
      stationIds: matches.map(match => match.stationId) });
  }
  return result.sort((a, b) => a.distanceMeters - b.distanceMeters || a.sensor.id.localeCompare(b.sensor.id));
}
