import { readCollected } from "@/lib/collectedBackend";
import { AUTOBAHN_ROADS } from "@/lib/autobahnChargers";
import { decodeRestAreas } from "@/lib/autobahnRestAreas";

export async function GET() {
  const results = await Promise.all(AUTOBAHN_ROADS.map(async road => {
    try { return { road, areas: decodeRestAreas(await readCollected<unknown>(`infrastructure/autobahn/${road}/rest-areas`, 60), road), available: true }; }
    catch { return { road, areas: [], available: false }; }
  }));
  return Response.json({ areas: results.flatMap(r => r.areas), unavailableRoads: results.filter(r => !r.available).map(r => r.road) }, {
    status: results.every(r => !r.available) ? 503 : 200, headers: { "Cache-Control": "no-store" },
  });
}
