#!/usr/bin/env node
/**
 * OSRM Driving Route Generator for Ried Buses and ZAKB Waste Collection.
 * Queries OpenStreetMap driving routes, generates dense [lat, lng] polylines,
 * and calibrates exact stopProg values along each track.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Haversine distance helper
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

// Compute cumulative distances for a polyline
function getCumulativeDistances(points) {
  const dists = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    dists.push(total);
  }
  return { dists, total };
}

// Find closest point on polyline and return its exact progress (0.0 to 1.0)
export function calculateStopProg(points, targetLat, targetLng) {
  const { dists, total } = getCumulativeDistances(points);
  if (total === 0) return 0;

  let bestDist = Infinity;
  let bestProg = 0;

  for (let i = 0; i < points.length; i++) {
    const d = haversineMeters(points[i][0], points[i][1], targetLat, targetLng);
    if (d < bestDist) {
      bestDist = d;
      bestProg = dists[i] / total;
    }
  }

  return Number(bestProg.toFixed(3));
}

// Fetch OSRM route for a list of [lat, lng] waypoints
async function fetchOsrmRoute(waypoints) {
  const coordString = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

  console.log(`Fetching OSRM route for ${waypoints.length} waypoints...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes || !data.routes[0]) {
    throw new Error(`OSRM route failed: ${JSON.stringify(data)}`);
  }

  // GeoJSON coordinates are [lng, lat] -> convert to [lat, lng] with 6 decimal places
  const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [
    Number(lat.toFixed(6)),
    Number(lng.toFixed(6)),
  ]);

  const distanceMeters = Math.round(data.routes[0].distance);
  console.log(`  -> Got ${coords.length} road coordinates (${distanceMeters}m)`);
  return coords;
}

// Chunk waypoints if needed to prevent URL length issues
async function fetchLeggedRoute(waypoints) {
  const allCoords = [];
  const chunkSize = 15; // OSRM safely supports 20-30 waypoints per request

  for (let i = 0; i < waypoints.length - 1; i += chunkSize - 1) {
    const chunk = waypoints.slice(i, i + chunkSize);
    const legCoords = await fetchOsrmRoute(chunk);
    if (allCoords.length > 0) {
      allCoords.push(...legCoords.slice(1));
    } else {
      allCoords.push(...legCoords);
    }
    // Polite delay between requests to be gentle to public demo server
    await new Promise((r) => setTimeout(r, 600));
  }

  return allCoords;
}

// Tour definitions with control waypoints
const BUS_SPECS = {
  route_641: {
    name: "Linie 641: Bürstadt <-> Lampertheim",
    controlPoints: [
      [49.6458, 8.4563], // Bürstadt Bhf
      [49.6425, 8.4542], // Marktplatz
      [49.6480, 8.4565], // Wilhelminenstr
      [49.6520, 8.4550], // Boxheimerhof
      [49.6610, 8.4485], // Bobstadt Frankenstr
      [49.6635, 8.4465], // Bobstadt Altes Rathaus
      [49.6560, 8.4520], // L3411 south
      [49.6380, 8.4600], // B44
      [49.6200, 8.4650], // B44 south
      [49.5980, 8.4760], // Lampertheim Bhf
      [49.5955, 8.4635], // Domkirche
      [49.5932, 8.4715], // Lessing-Gymnasium
      [49.5975, 8.4830], // Alfred-Delp-Schule
      [49.5980, 8.4760], // Lampertheim Bhf
    ],
  },
  route_642: {
    name: "Linie 642: Worms <-> Hofheim <-> Bürstadt",
    controlPoints: [
      [49.6320, 8.3600], // Worms Hbf
      [49.6350, 8.3750], // Rheinbrücke Anfahrt
      [49.6450, 8.3900], // Rheinbrücke B47
      [49.6550, 8.4050], // Hofheim West
      [49.6588, 8.4115], // Hofheim Bhf
      [49.6580, 8.4175], // Schule Hofheim
      [49.6500, 8.4350], // B47
      [49.6432, 8.4515], // Bürstadt Sonneneck
      [49.6425, 8.4542], // Bürstadt Marktplatz
      [49.6465, 8.4552], // BÜ Mainstraße
      [49.6458, 8.4563], // Bürstadt Bhf
      [49.6385, 8.4610], // Bürstadt EKS
    ],
  },
  route_644: {
    name: "Linie 644: Worms <-> Hofheim <-> Biblis",
    controlPoints: [
      [49.6320, 8.3600], // Worms Hbf
      [49.6450, 8.3900], // Rheinbrücke
      [49.6600, 8.4100], // B47 / B44 Nord
      [49.6750, 8.4300], // B44 Nord
      [49.6835, 8.4445], // Schule am Weschnitzdamm
      [49.6885, 8.4460], // Biblis Rathaus
      [49.6886, 8.4485], // Biblis Bhf
    ],
  },
  route_652: {
    name: "Linie 652: Dedizierter Schülerverkehr",
    controlPoints: [
      [49.6635, 8.4465], // Bobstadt Altes Rathaus
      [49.6610, 8.4485], // Bobstadt Frankenstr
      [49.6520, 8.4550], // Bürstadt Boxheimerhof
      [49.6425, 8.4542], // Bürstadt Marktplatz
      [49.6438, 8.4568], // Bürstadt Schillerschule
      [49.6458, 8.4563], // Bürstadt Bhf
      [49.6385, 8.4610], // Bürstadt EKS
      [49.6200, 8.4650], // B44 nach Lampertheim
      [49.5932, 8.4715], // Lessing-Gymnasium
      [49.5975, 8.4830], // Alfred-Delp-Schule
      [49.5980, 8.4760], // Lampertheim Bhf
    ],
  },
};

const TRUCK_SPECS = {
  route_buerstadt: {
    name: "ZAKB Bürstadt (BST-R01 Restmüll)",
    controlPoints: [
      [49.6382, 8.4485], // Wertstoffhof Zur Biogasanlage
      [49.6395, 8.4510],
      [49.6415, 8.4530], // Nibelungenstraße
      [49.6425, 8.4542], // Marktplatz
      [49.6465, 8.4552], // Mainstraße
      [49.6480, 8.4565], // Wilhelminenstraße
      [49.6520, 8.4550], // Boxheimerhofstraße
      [49.6560, 8.4520], // Richtung Bobstadt
      [49.6610, 8.4485], // Bobstadt Frankenstraße
      [49.6635, 8.4465], // Bobstadt St.-Josef-Str
      [49.6600, 8.4450], // Bobstadt Kurpfalzstraße
      [49.6530, 8.4490], // Rückfahrt Bürstadt West
      [49.6440, 8.4510], // Heinrichstraße
      [49.6382, 8.4485], // Wertstoffhof
    ],
  },
  route_lampertheim: {
    name: "ZAKB Lampertheim (LA-B02 Biomüll)",
    controlPoints: [
      [49.6018, 8.4524], // Wertstoffhof Klärwerkstraße
      [49.5985, 8.4580], // Römerstraße
      [49.5955, 8.4635], // Domkirche / Schillerplatz
      [49.5940, 8.4670], // Kaiserstraße
      [49.5952, 8.4720], // Ernst-Ludwig-Straße
      [49.5968, 8.4770], // Bürstädter Straße
      [49.5975, 8.4830], // Neuschloßstraße West
      [49.5985, 8.4950], // Neuschloß Schlossplatz
      [49.5970, 8.4900], // Ulmenweg
      [49.5930, 8.4750], // Wilhelmstraße
      [49.5915, 8.4660], // Biedensandstraße
      [49.5960, 8.4590], // Chemiestraße
      [49.6018, 8.4524], // Wertstoffhof
    ],
  },
  route_hofheim: {
    name: "ZAKB Hofheim (HOF-P03 Altpapier)",
    controlPoints: [
      [49.6382, 8.4485], // Wertstoffhof Bürstadt
      [49.6425, 8.4542], // Auffahrt B47
      [49.6500, 8.4350], // B47
      [49.6550, 8.4180], // Hofheim Ost
      [49.6575, 8.4140], // Bahnhofstraße
      [49.6590, 8.4125], // Lindenstraße
      [49.6615, 8.4135], // Bibliser Weg
      [49.6630, 8.4160], // Backhausstraße
      [49.6580, 8.4175], // Friedrich-Ebert-Straße
      [49.6540, 8.4150], // Wormser Straße
      [49.6480, 8.4320], // Riedstraße / B47
      [49.6382, 8.4485], // Wertstoffhof Bürstadt
    ],
  },
  route_biblis: {
    name: "ZAKB Biblis (BIB-G04 Gelber Sack)",
    controlPoints: [
      [49.6912, 8.4420], // Wertstoffhof Am Werrtor
      [49.6885, 8.4460], // Darmstädter Straße
      [49.6850, 8.4475], // Bahnhofstraße
      [49.6820, 8.4440], // Kirchstraße
      [49.6860, 8.4410], // Hintergasse
      [49.6890, 8.4380], // L3261
      [49.6940, 8.4280], // Wattenheim Rheinstraße
      [49.6970, 8.4230], // Wattenheim Kirche
      [49.6950, 8.4200], // Rheinuferstraße
      [49.6912, 8.4420], // Wertstoffhof Am Werrtor
    ],
  },
  route_umweltmobil: {
    name: "ZAKB Umweltmobil (UM-S05 Schadstoffmobil)",
    controlPoints: [
      [49.5962, 8.5838], // ZAKB Zentrale Hüttenfeld
      [49.5975, 8.5300], // L3111
      [49.6018, 8.4524], // Halt 1: Lampertheim Klärwerkstraße
      [49.6200, 8.4600], // L3110 nach Bürstadt
      [49.6382, 8.4485], // Halt 2: Bürstadt Wertstoffhof
      [49.6500, 8.4350], // B47
      [49.6580, 8.4120], // Halt 3: Hofheim Sportpark
      [49.6700, 8.4300], // B44
      [49.6912, 8.4420], // Halt 4: Biblis Wertstoffhof
      [49.6450, 8.5100], // B47 / L3111
      [49.5962, 8.5838], // Zurück Hüttenfeld
    ],
  },
};

async function main() {
  const results = {
    buses: {},
    wasteTrucks: {},
  };

  console.log("=== Fetching Bus Routes ===");
  for (const [key, spec] of Object.entries(BUS_SPECS)) {
    console.log(`Processing ${spec.name}...`);
    const track = await fetchLeggedRoute(spec.controlPoints);
    results.buses[key] = {
      name: spec.name,
      track,
    };
  }

  console.log("\n=== Fetching Waste Truck Routes ===");
  for (const [key, spec] of Object.entries(TRUCK_SPECS)) {
    console.log(`Processing ${spec.name}...`);
    const track = await fetchLeggedRoute(spec.controlPoints);
    results.wasteTrucks[key] = {
      name: spec.name,
      track,
    };
  }

  const outputPath = path.join(__dirname, "../lib/roadRoutesData.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nSuccessfully saved all routes to ${outputPath}`);
}

main().catch((err) => {
  console.error("Error generating routes:", err);
  process.exit(1);
});
