import { toStationNodes, type ApiMapSensor } from "./mapData";

const PUBLIC_MAP_PATHS = {
  sensors: "/api/v1/map/sensors",
  layers: "/api/v1/map/collected-layers",
  maengelmelder: "/api/v1/collected/civic/maengelmelder",
  schaedlingsradar: "/api/v1/collected/civic/schaedlingsradar",
} as const;

/** Only public map publications may be addressed by the browser. */
export function publicMapDataUrl(resource: keyof typeof PUBLIC_MAP_PATHS) {
  return `${process.env.NEXT_PUBLIC_LIVE_API_ORIGIN}${PUBLIC_MAP_PATHS[resource]}`;
}

export function publicMapTileUrl(layer: "base" | "rain") {
  return `${process.env.NEXT_PUBLIC_LIVE_API_ORIGIN}/api/v1/map-tiles/${layer}/{z}/{x}/{y}.png`;
}

/** Use the same station normalization as the server, without proxying the payload. */
export function decodeMapSnapshot(body: unknown) {
  if (!body || typeof body !== "object" || !("sensors" in body) || !Array.isArray(body.sensors)) {
    throw new Error("Invalid map response");
  }
  return { nodes: toStationNodes(body.sensors as ApiMapSensor[]), readingsAvailable: true };
}
