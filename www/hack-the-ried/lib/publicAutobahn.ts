import { AUTOBAHN_ROADS, decodeAutobahnOffers } from "./autobahnChargers";
import { decodeRestAreas } from "./autobahnRestAreas";
import { readPublicResource } from "./publicRequests";
export async function loadPublicChargers(signal: AbortSignal) {
  const results = await Promise.all(AUTOBAHN_ROADS.map(async road => {
    try { return { road, offers: decodeAutobahnOffers((await readPublicResource(`collected/infrastructure/autobahn/${road}/charging`, signal)).data, road), available: true }; }
    catch { return { road, offers: [], available: false }; }
  }));
  if (results.every(r => !r.available)) throw new Error("Charging inventory unavailable");
  return { offers: results.flatMap(r => r.offers), unavailableRoads: results.filter(r => !r.available).map(r => r.road) };
}
export async function loadPublicRestAreas(signal: AbortSignal) {
  const results = await Promise.all(AUTOBAHN_ROADS.map(async road => {
    try { return { road, areas: decodeRestAreas((await readPublicResource(`collected/infrastructure/autobahn/${road}/rest-areas`, signal)).data, road), available: true }; }
    catch { return { road, areas: [], available: false }; }
  }));
  if (results.every(r => !r.available)) throw new Error("Rest area inventory unavailable");
  return { areas: results.flatMap(r => r.areas), unavailableRoads: results.filter(r => !r.available).map(r => r.road) };
}
