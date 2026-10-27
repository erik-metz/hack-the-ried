import { readCollected } from "@/lib/collectedBackend";
import { AUTOBAHN_ROADS, decodeAutobahnOffers } from "@/lib/autobahnChargers";

export async function GET() {
  const results = await Promise.all(AUTOBAHN_ROADS.map(async road => {
    try {
      const data = await readCollected<unknown>(`infrastructure/autobahn/${road}/charging`, 60);
      return { road, offers: decodeAutobahnOffers(data, road), available: true };
    } catch { return { road, offers: [], available: false }; }
  }));
  return Response.json({ offers: results.flatMap(r => r.offers), unavailableRoads: results.filter(r => !r.available).map(r => r.road) }, {
    status: results.every(r => !r.available) ? 503 : 200, headers: { "Cache-Control": "no-store" },
  });
}
