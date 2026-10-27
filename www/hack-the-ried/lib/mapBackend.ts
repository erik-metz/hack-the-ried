import { env } from "@/env";
import { toStationNodes, type ApiMapSensor } from "./mapData";

export async function fetchMapData() {
  const response = await fetch(new URL("/api/v1/map/sensors", env.BACKEND_API_URL), {
    next: { revalidate: 5 }, signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) {
    // Rolling deploy: keep the new map usable until the backend is updated.
    const legacy = await fetch(new URL("/api/v1/sensors", env.BACKEND_API_URL), {
      next: { revalidate: 5 }, signal: AbortSignal.timeout(10_000),
    });
    if (!legacy.ok) throw new Error("Map inventory unavailable");
    const sensors: ApiMapSensor[] = await legacy.json();
    return { nodes: toStationNodes(sensors), readingsAvailable: false };
  }
  if (!response.ok) throw new Error("Map data unavailable");
  const body: { sensors: ApiMapSensor[] } = await response.json();
  return { nodes: toStationNodes(body.sensors), readingsAvailable: true };
}

export { readCollected } from "./collectedBackend";
