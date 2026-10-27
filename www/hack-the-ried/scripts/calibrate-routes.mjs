import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../lib/roadRoutesData.json"), "utf8"));

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCumulativeDistances(points) {
  const dists = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    dists.push(total);
  }
  return { dists, total };
}

function findBestProgress(points, targetLat, targetLng, minProg = 0) {
  const { dists, total } = getCumulativeDistances(points);
  let bestDist = Infinity;
  let bestProg = minProg;

  for (let i = 0; i < points.length; i++) {
    const prog = dists[i] / total;
    if (prog < minProg - 0.02) continue; // enforce forward monotonic progression along route
    const d = haversineMeters(points[i][0], points[i][1], targetLat, targetLng);
    if (d < bestDist) {
      bestDist = d;
      bestProg = prog;
    }
  }
  return Number(bestProg.toFixed(3));
}

console.log("--- Calibrating Bus Tours ---");

// Tour 641 South
const track641 = data.buses.route_641.track;
const bus641Wp = [
  { id: "stop-bst-bahnhof", lat: 49.6458, lng: 8.4563 },
  { id: "stop-bst-marktplatz", lat: 49.6425, lng: 8.4542 },
  { id: "stop-bst-boxheimerhof", lat: 49.6520, lng: 8.4550 },
  { id: "stop-bob-altes-rathaus", lat: 49.6635, lng: 8.4465 },
  { id: "stop-la-bahnhof", lat: 49.5980, lng: 8.4760 },
  { id: "stop-la-domkirche", lat: 49.5955, lng: 8.4635 },
  { id: "stop-la-lessing-gymnasium", lat: 49.5932, lng: 8.4715 },
];
let prog = 0;
console.log("641 South Waypoints:");
for (const wp of bus641Wp) {
  prog = findBestProgress(track641, wp.lat, wp.lng, prog);
  console.log(`  { stopId: "${wp.id}", stopProg: ${prog} },`);
}

// Tour 641 North
const track641North = [...track641].reverse();
const bus641NorthWp = [
  { id: "stop-la-bahnhof", lat: 49.5980, lng: 8.4760 },
  { id: "stop-la-domkirche", lat: 49.5955, lng: 8.4635 },
  { id: "stop-bob-altes-rathaus", lat: 49.6635, lng: 8.4465 },
  { id: "stop-bst-boxheimerhof", lat: 49.6520, lng: 8.4550 },
  { id: "stop-bst-marktplatz", lat: 49.6425, lng: 8.4542 },
  { id: "stop-bst-bahnhof", lat: 49.6458, lng: 8.4563 },
];
prog = 0;
console.log("\n641 North Waypoints:");
for (const wp of bus641NorthWp) {
  prog = findBestProgress(track641North, wp.lat, wp.lng, prog);
  console.log(`  { stopId: "${wp.id}", stopProg: ${prog} },`);
}

// Tour 642 East
const track642 = data.buses.route_642.track;
const bus642EastWp = [
  { id: "stop-hof-bahnhof", lat: 49.6588, lng: 8.4115 },
  { id: "stop-hof-schule", lat: 49.6580, lng: 8.4175 },
  { id: "stop-bst-sonneneck", lat: 49.6432, lng: 8.4515 },
  { id: "stop-bst-marktplatz", lat: 49.6425, lng: 8.4542 },
  { id: "stop-bst-bahnhof", lat: 49.6458, lng: 8.4563 },
  { id: "stop-bst-eks", lat: 49.6385, lng: 8.4610 },
];
prog = 0;
console.log("\n642 East Waypoints:");
for (const wp of bus642EastWp) {
  prog = findBestProgress(track642, wp.lat, wp.lng, prog);
  console.log(`  { stopId: "${wp.id}", stopProg: ${prog} },`);
}

// Tour 642 West
const track642West = [...track642].reverse();
const bus642WestWp = [
  { id: "stop-bst-eks", lat: 49.6385, lng: 8.4610 },
  { id: "stop-bst-bahnhof", lat: 49.6458, lng: 8.4563 },
  { id: "stop-bst-marktplatz", lat: 49.6425, lng: 8.4542 },
  { id: "stop-bst-sonneneck", lat: 49.6432, lng: 8.4515 },
  { id: "stop-hof-schule", lat: 49.6580, lng: 8.4175 },
  { id: "stop-hof-bahnhof", lat: 49.6588, lng: 8.4115 },
];
prog = 0;
console.log("\n642 West Waypoints:");
for (const wp of bus642WestWp) {
  prog = findBestProgress(track642West, wp.lat, wp.lng, prog);
  console.log(`  { stopId: "${wp.id}", stopProg: ${prog} },`);
}

// Tour 644 North
const track644 = data.buses.route_644.track;
const bus644Wp = [
  { id: "stop-bib-schule", lat: 49.6835, lng: 8.4445 },
  { id: "stop-bib-rathaus", lat: 49.6885, lng: 8.4460 },
  { id: "stop-bib-bahnhof", lat: 49.6886, lng: 8.4485 },
];
prog = 0;
console.log("\n644 North Waypoints:");
for (const wp of bus644Wp) {
  prog = findBestProgress(track644, wp.lat, wp.lng, prog);
  console.log(`  { stopId: "${wp.id}", stopProg: ${prog} },`);
}

// Tour 652 School
const track652 = data.buses.route_652.track;
const bus652Wp = [
  { id: "stop-bob-altes-rathaus", lat: 49.6635, lng: 8.4465 },
  { id: "stop-bst-boxheimerhof", lat: 49.6520, lng: 8.4550 },
  { id: "stop-bst-marktplatz", lat: 49.6425, lng: 8.4542 },
  { id: "stop-bst-schillerschule", lat: 49.6438, lng: 8.4568 },
  { id: "stop-bst-bahnhof", lat: 49.6458, lng: 8.4563 },
  { id: "stop-bst-eks", lat: 49.6385, lng: 8.4610 },
  { id: "stop-la-lessing-gymnasium", lat: 49.5932, lng: 8.4715 },
  { id: "stop-la-alfred-delp", lat: 49.5975, lng: 8.4830 },
];
prog = 0;
console.log("\n652 School Waypoints:");
for (const wp of bus652Wp) {
  prog = findBestProgress(track652, wp.lat, wp.lng, prog);
  console.log(`  { stopId: "${wp.id}", stopProg: ${prog} },`);
}

console.log("\n--- Calibrating Waste Truck Tours ---");

// Bürstadt Truck
const trackTruckBst = data.wasteTrucks.route_buerstadt.track;
const truckBstWp = [
  { street: "Nibelungenstraße", lat: 49.6415, lng: 8.4530 },
  { street: "Mainstraße", lat: 49.6465, lng: 8.4552 },
  { street: "Wilhelminenstraße / Gartenstadt", lat: 49.6480, lng: 8.4565 },
  { street: "Bobstadt Frankenstraße", lat: 49.6610, lng: 8.4485 },
  { street: "Bobstadt Kurpfalzstraße", lat: 49.6600, lng: 8.4450 },
];
prog = 0;
console.log("Truck Bürstadt Waypoints:");
for (const wp of truckBstWp) {
  prog = findBestProgress(trackTruckBst, wp.lat, wp.lng, prog);
  console.log(`  { street: "${wp.street}", stopProg: ${prog} },`);
}

// Lampertheim Truck
const trackTruckLa = data.wasteTrucks.route_lampertheim.track;
const truckLaWp = [
  { street: "Schillerplatz / Domkirche", lat: 49.5955, lng: 8.4635 },
  { street: "Kaiserstraße / Fußgängerzone", lat: 49.5940, lng: 8.4670 },
  { street: "Ernst-Ludwig-Straße", lat: 49.5952, lng: 8.4720 },
  { street: "Neuschloß Schlossplatz", lat: 49.5985, lng: 8.4950 },
  { street: "Biedensandstraße", lat: 49.5915, lng: 8.4660 },
];
prog = 0;
console.log("\nTruck Lampertheim Waypoints:");
for (const wp of truckLaWp) {
  prog = findBestProgress(trackTruckLa, wp.lat, wp.lng, prog);
  console.log(`  { street: "${wp.street}", stopProg: ${prog} },`);
}

// Hofheim Truck
const trackTruckHof = data.wasteTrucks.route_hofheim.track;
const truckHofWp = [
  { street: "Bahnhofstraße", lat: 49.6575, lng: 8.4140 },
  { street: "Lindenstraße", lat: 49.6590, lng: 8.4125 },
  { street: "Bibliser Weg", lat: 49.6615, lng: 8.4135 },
  { street: "Friedrich-Ebert-Straße", lat: 49.6580, lng: 8.4175 },
];
prog = 0;
console.log("\nTruck Hofheim Waypoints:");
for (const wp of truckHofWp) {
  prog = findBestProgress(trackTruckHof, wp.lat, wp.lng, prog);
  console.log(`  { street: "${wp.street}", stopProg: ${prog} },`);
}

// Biblis Truck
const trackTruckBib = data.wasteTrucks.route_biblis.track;
const truckBibWp = [
  { street: "Darmstädter Straße", lat: 49.6885, lng: 8.4460 },
  { street: "Kirchstraße / Seepromenade", lat: 49.6820, lng: 8.4440 },
  { street: "Wattenheim Rheinstraße", lat: 49.6940, lng: 8.4280 },
  { street: "Wattenheim Ortsmitte", lat: 49.6970, lng: 8.4230 },
];
prog = 0;
console.log("\nTruck Biblis Waypoints:");
for (const wp of truckBibWp) {
  prog = findBestProgress(trackTruckBib, wp.lat, wp.lng, prog);
  console.log(`  { street: "${wp.street}", stopProg: ${prog} },`);
}

// Umweltmobil
const trackUmwelt = data.wasteTrucks.route_umweltmobil.track;
const umweltWp = [
  { street: "Halt: Wertstoffhof Lampertheim (Klärwerkstr.)", lat: 49.6018, lng: 8.4524 },
  { street: "Halt: Wertstoffhof Bürstadt (Zur Biogasanlage)", lat: 49.6382, lng: 8.4485 },
  { street: "Halt: Hofheim Sportpark", lat: 49.6580, lng: 8.4120 },
  { street: "Halt: Wertstoffhof Biblis (Am Werrtor)", lat: 49.6912, lng: 8.4420 },
];
prog = 0;
console.log("\nTruck Umweltmobil Waypoints:");
for (const wp of umweltWp) {
  prog = findBestProgress(trackUmwelt, wp.lat, wp.lng, prog);
  console.log(`  { street: "${wp.street}", stopProg: ${prog} },`);
}
