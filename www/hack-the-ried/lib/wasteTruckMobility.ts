import { interpolatePolyline } from "./railMobility";
import {
  ROUTE_BUERSTADT_ROAD_TRACK,
  ROUTE_LAMPERTHEIM_ROAD_TRACK,
  ROUTE_HOFHEIM_ROAD_TRACK,
  ROUTE_BIBLIS_ROAD_TRACK,
  ROUTE_ROSENGARTEN_ROAD_TRACK,
  ROUTE_NORDHEIM_ROAD_TRACK,
  ROUTE_GROSS_ROHRHEIM_ROAD_TRACK,
  ROUTE_UMWELTMOBIL_ROAD_TRACK,
} from "./roadRoutes";

export type WasteFraction = "restmuell" | "biomuell" | "papier" | "gelber_sack" | "umweltmobil";

export interface WasteFractionMeta {
  id: WasteFraction;
  name: string;
  binColor: string;
  accentColor: string;
  icon: string;
  description: string;
}

export const WASTE_FRACTIONS: Record<WasteFraction, WasteFractionMeta> = {
  restmuell: {
    id: "restmuell",
    name: "Restmüll",
    binColor: "#475569", // Graue Tonne
    accentColor: "#f97316",
    icon: "🗑️",
    description: "Restabfall (Graue Tonne) – ZAKB Tour",
  },
  biomuell: {
    id: "biomuell",
    name: "Biomüll",
    binColor: "#16a34a", // Braune/Grüne Tonne
    accentColor: "#22c55e",
    icon: "🌱",
    description: "Bioguttonne (Braune Tonne) – Verwertung im Biomassezentrum",
  },
  papier: {
    id: "papier",
    name: "Altpapier",
    binColor: "#2563eb", // Blaue Tonne
    accentColor: "#60a5fa",
    icon: "📦",
    description: "Papier, Pappe, Kartonagen (Blaue Tonne)",
  },
  gelber_sack: {
    id: "gelber_sack",
    name: "Gelber Sack",
    binColor: "#eab308", // Gelber Wertstoffsack
    accentColor: "#fef08a",
    icon: "♻️",
    description: "Leichtverpackungen & Wertstoffe (Gelber Sack / Gelbe Tonne)",
  },
  umweltmobil: {
    id: "umweltmobil",
    name: "Umweltmobil",
    binColor: "#9333ea", // Schadstoffmobil
    accentColor: "#c084fc",
    icon: "⚠️",
    description: "ZAKB Schadstoffmobil / Umweltmobil für Problemabfälle",
  },
};

export interface WasteDepot {
  id: string;
  name: string;
  municipality: string;
  address: string;
  lat: number;
  lng: number;
  type: "headquarters_depot" | "recycling_yard";
}

export const ZAKB_DEPOTS: WasteDepot[] = [
  {
    id: "zakb-huettenfeld",
    name: "ZAKB Energiepark Hüttenfeld (Zentrale & Fuhrpark)",
    municipality: "Lampertheim",
    address: "Heidenfahrt 1, 68623 Lampertheim-Hüttenfeld",
    lat: 49.5962,
    lng: 8.5838,
    type: "headquarters_depot",
  },
  {
    id: "zakb-buerstadt",
    name: "ZAKB Wertstoffhof Bürstadt & Umladestation",
    municipality: "Bürstadt",
    address: "Zur Biogasanlage 1, 68642 Bürstadt",
    lat: 49.6382,
    lng: 8.4485,
    type: "recycling_yard",
  },
  {
    id: "zakb-lampertheim",
    name: "ZAKB Wertstoffhof Lampertheim",
    municipality: "Lampertheim",
    address: "Klärwerkstraße 6–8, 68623 Lampertheim",
    lat: 49.6018,
    lng: 8.4524,
    type: "recycling_yard",
  },
  {
    id: "zakb-biblis",
    name: "ZAKB Wertstoffhof Biblis",
    municipality: "Biblis",
    address: "Am Werrtor, 68647 Biblis",
    lat: 49.6912,
    lng: 8.4420,
    type: "recycling_yard",
  },
];

export interface CollectionWaypoint {
  street: string;
  lat: number;
  lng: number;
  stopProg: number; // 0.0 to 1.0 along tour route
  expectedTimeWindow: string; // e.g. "07:30 - 08:30"
  dwellSec: number; // Duration of bin compaction stop in seconds
}

export interface WasteTourDefinition {
  id: string;
  tourCode: string; // e.g. "BST-R01"
  name: string;
  municipality: "Bürstadt" | "Lampertheim" | "Hofheim (Ried)" | "Biblis" | "Groß-Rohrheim" | "Rosengarten" | "Nordheim" | string;
  fraction: WasteFraction;
  licensePlate: string; // e.g. "HP-ZK 102"
  vehicleModel: string;
  periodSec: number; // Duration of simulated loop in seconds (e.g. 1080s = 18min demo cycle)
  offsetSec: number;
  speedCollectingKmh: number; // Realistic collection speed: 12-18 km/h
  speedTransitKmh: number; // 45-55 km/h
  track: [number, number][];
  waypoints: CollectionWaypoint[];
}

// 1. Realistic Route Polylines in Kreis Bergstraße (Ried) - OSRM Real Road Tracks
export const ROUTE_BUERSTADT: [number, number][] = ROUTE_BUERSTADT_ROAD_TRACK;
export const ROUTE_LAMPERTHEIM: [number, number][] = ROUTE_LAMPERTHEIM_ROAD_TRACK;
export const ROUTE_HOFHEIM: [number, number][] = ROUTE_HOFHEIM_ROAD_TRACK;
export const ROUTE_BIBLIS: [number, number][] = ROUTE_BIBLIS_ROAD_TRACK;
export const ROUTE_ROSENGARTEN: [number, number][] = ROUTE_ROSENGARTEN_ROAD_TRACK;
export const ROUTE_NORDHEIM: [number, number][] = ROUTE_NORDHEIM_ROAD_TRACK;
export const ROUTE_GROSS_ROHRHEIM: [number, number][] = ROUTE_GROSS_ROHRHEIM_ROAD_TRACK;
export const ROUTE_UMWELTMOBIL: [number, number][] = ROUTE_UMWELTMOBIL_ROAD_TRACK;

export const ZAKB_TOURS: WasteTourDefinition[] = [
  {
    id: "tour-bst-restmuell",
    tourCode: "BST-R01",
    name: "Tour B1: Bürstadt Kernstadt & Bobstadt",
    municipality: "Bürstadt",
    fraction: "restmuell",
    licensePlate: "HP-ZK 102",
    vehicleModel: "Mercedes-Benz Econic 2630 (Faun Rotopress)",
    periodSec: 1080,
    offsetSec: 60,
    speedCollectingKmh: 14,
    speedTransitKmh: 48,
    track: ROUTE_BUERSTADT,
    waypoints: [
      { street: "Nibelungenstraße", lat: 49.6415, lng: 8.4530, stopProg: 0.316, expectedTimeWindow: "07:30 – 08:30 Uhr", dwellSec: 40 },
      { street: "Mainstraße", lat: 49.6465, lng: 8.4552, stopProg: 0.376, expectedTimeWindow: "08:30 – 09:30 Uhr", dwellSec: 45 },
      { street: "Wilhelminenstraße / Gartenstadt", lat: 49.6480, lng: 8.4565, stopProg: 0.400, expectedTimeWindow: "09:30 – 10:30 Uhr", dwellSec: 35 },
      { street: "Bobstadt Frankenstraße", lat: 49.6610, lng: 8.4485, stopProg: 0.561, expectedTimeWindow: "10:30 – 11:30 Uhr", dwellSec: 40 },
      { street: "Bobstadt Kurpfalzstraße", lat: 49.6600, lng: 8.4450, stopProg: 0.640, expectedTimeWindow: "11:30 – 12:15 Uhr", dwellSec: 35 },
    ],
  },
  {
    id: "tour-la-biomuell",
    tourCode: "LA-B02",
    name: "Tour L2: Lampertheim Mitte & Neuschloß",
    municipality: "Lampertheim",
    fraction: "biomuell",
    licensePlate: "HP-ZK 214",
    vehicleModel: "MAN TGM 26.320 (Zöller Medium X4)",
    periodSec: 1140,
    offsetSec: 340,
    speedCollectingKmh: 15,
    speedTransitKmh: 45,
    track: ROUTE_LAMPERTHEIM,
    waypoints: [
      { street: "Schillerplatz / Domkirche", lat: 49.5955, lng: 8.4635, stopProg: 0.099, expectedTimeWindow: "07:15 – 08:15 Uhr", dwellSec: 35 },
      { street: "Kaiserstraße / Fußgängerzone", lat: 49.5940, lng: 8.4670, stopProg: 0.124, expectedTimeWindow: "08:15 – 09:15 Uhr", dwellSec: 45 },
      { street: "Ernst-Ludwig-Straße", lat: 49.5952, lng: 8.4720, stopProg: 0.173, expectedTimeWindow: "09:15 – 10:15 Uhr", dwellSec: 40 },
      { street: "Neuschloß Schlossplatz", lat: 49.5985, lng: 8.4950, stopProg: 0.490, expectedTimeWindow: "10:15 – 11:15 Uhr", dwellSec: 50 },
      { street: "Biedensandstraße", lat: 49.5915, lng: 8.4660, stopProg: 0.830, expectedTimeWindow: "11:15 – 12:00 Uhr", dwellSec: 35 },
    ],
  },
  {
    id: "tour-hof-gelbersack",
    tourCode: "HOF-G01",
    name: "Tour H1: Hofheim (Ried)",
    municipality: "Hofheim (Ried)",
    fraction: "gelber_sack",
    licensePlate: "HP-ZK 308",
    vehicleModel: "Scania L280 (Variopress 524)",
    periodSec: 960,
    offsetSec: 180,
    speedCollectingKmh: 16,
    speedTransitKmh: 50,
    track: ROUTE_HOFHEIM,
    waypoints: [
      { street: "Bahnhofstraße", lat: 49.6575, lng: 8.4140, stopProg: 0.517, expectedTimeWindow: "07:45 – 08:45 Uhr", dwellSec: 40 },
      { street: "Lindenstraße", lat: 49.6590, lng: 8.4125, stopProg: 0.532, expectedTimeWindow: "08:45 – 09:45 Uhr", dwellSec: 35 },
      { street: "Bibliser Weg", lat: 49.6615, lng: 8.4135, stopProg: 0.546, expectedTimeWindow: "09:45 – 10:45 Uhr", dwellSec: 45 },
      { street: "Friedrich-Ebert-Straße", lat: 49.6580, lng: 8.4175, stopProg: 0.625, expectedTimeWindow: "10:45 – 11:30 Uhr", dwellSec: 35 },
    ],
  },
  {
    id: "tour-bib-papier",
    tourCode: "BIB-P01",
    name: "Tour BI1: Biblis & Wattenheim",
    municipality: "Biblis",
    fraction: "papier",
    licensePlate: "HP-ZK 419",
    vehicleModel: "Volvo FE Electric (Faun Variopress)",
    periodSec: 1020,
    offsetSec: 520,
    speedCollectingKmh: 15,
    speedTransitKmh: 52,
    track: ROUTE_BIBLIS,
    waypoints: [
      { street: "Darmstädter Straße", lat: 49.6885, lng: 8.4460, stopProg: 0.020, expectedTimeWindow: "08:00 – 09:00 Uhr", dwellSec: 45 },
      { street: "Kirchstraße / Seepromenade", lat: 49.6820, lng: 8.4440, stopProg: 0.146, expectedTimeWindow: "09:00 – 10:00 Uhr", dwellSec: 40 },
      { street: "Wattenheim Rheinstraße", lat: 49.6940, lng: 8.4280, stopProg: 0.344, expectedTimeWindow: "10:00 – 11:00 Uhr", dwellSec: 45 },
      { street: "Wattenheim Ortsmitte", lat: 49.6970, lng: 8.4230, stopProg: 0.365, expectedTimeWindow: "11:00 – 11:45 Uhr", dwellSec: 35 },
    ],
  },
  {
    id: "tour-ried-umweltmobil",
    tourCode: "UMW-01",
    name: "ZAKB Umweltmobil / Schadstofftour Ried",
    municipality: "Bürstadt",
    fraction: "umweltmobil",
    licensePlate: "HP-UM 1",
    vehicleModel: "Sonder-LKW Schadstofferfassung Kreis Bergstraße",
    periodSec: 1500,
    offsetSec: 0,
    speedCollectingKmh: 38,
    speedTransitKmh: 55,
    track: ROUTE_UMWELTMOBIL,
    waypoints: [
      { street: "Halt: Wertstoffhof Lampertheim (Klärwerkstr.)", lat: 49.6018, lng: 8.4524, stopProg: 0.183, expectedTimeWindow: "09:30 – 13:00 Uhr", dwellSec: 75 },
      { street: "Halt: Wertstoffhof Bürstadt (Zur Biogasanlage)", lat: 49.6382, lng: 8.4485, stopProg: 0.282, expectedTimeWindow: "09:30 – 12:30 Uhr", dwellSec: 70 },
      { street: "Halt: Hofheim Sportpark", lat: 49.6580, lng: 8.4120, stopProg: 0.416, expectedTimeWindow: "13:30 – 15:30 Uhr", dwellSec: 60 },
      { street: "Halt: Wertstoffhof Biblis (Am Werrtor)", lat: 49.6912, lng: 8.4420, stopProg: 0.662, expectedTimeWindow: "15:45 – 17:00 Uhr", dwellSec: 65 },
    ],
  },
  {
    id: "tour-ros-biomuell",
    tourCode: "ROS-B01",
    name: "Tour RO1: Rosengarten & Wehrzollhaus",
    municipality: "Rosengarten",
    fraction: "biomuell",
    licensePlate: "HP-ZK 218",
    vehicleModel: "MAN TGM 26.320 (Zöller Medium X4)",
    periodSec: 1020,
    offsetSec: 220,
    speedCollectingKmh: 14,
    speedTransitKmh: 48,
    track: ROUTE_ROSENGARTEN,
    waypoints: [
      { street: "Nibelungenstraße (B47)", lat: 49.6322, lng: 8.3861, stopProg: 0.455, expectedTimeWindow: "07:30 – 08:30 Uhr", dwellSec: 40 },
      { street: "Rheingoldstraße", lat: 49.6318, lng: 8.3835, stopProg: 0.469, expectedTimeWindow: "08:30 – 09:30 Uhr", dwellSec: 35 },
      { street: "Wehrzollhaus / Rheinbrücke", lat: 49.6315, lng: 8.3824, stopProg: 0.475, expectedTimeWindow: "09:30 – 10:15 Uhr", dwellSec: 40 },
      { street: "Rheingewann / In den Binden", lat: 49.6295, lng: 8.3768, stopProg: 0.508, expectedTimeWindow: "10:15 – 11:00 Uhr", dwellSec: 35 },
    ],
  },
  {
    id: "tour-nor-restmuell",
    tourCode: "NOR-R01",
    name: "Tour NO1: Nordheim & Burg Stein",
    municipality: "Nordheim",
    fraction: "restmuell",
    licensePlate: "HP-ZK 415",
    vehicleModel: "Mercedes-Benz Econic 2630 (Faun Rotopress)",
    periodSec: 1080,
    offsetSec: 400,
    speedCollectingKmh: 14,
    speedTransitKmh: 48,
    track: ROUTE_NORDHEIM,
    waypoints: [
      { street: "Friedhof / Zum alten Wasserwerk", lat: 49.6845, lng: 8.3925, stopProg: 0.408, expectedTimeWindow: "07:45 – 08:45 Uhr", dwellSec: 40 },
      { street: "Rathausstraße / Burg Stein", lat: 49.6830, lng: 8.3880, stopProg: 0.443, expectedTimeWindow: "08:45 – 09:45 Uhr", dwellSec: 35 },
      { street: "Steinstraße / Ortskern", lat: 49.6788, lng: 8.3876, stopProg: 0.504, expectedTimeWindow: "09:45 – 10:45 Uhr", dwellSec: 40 },
    ],
  },
  {
    id: "tour-gr-gelbersack",
    tourCode: "GR-G01",
    name: "Tour GR1: Groß-Rohrheim Wertstoffe",
    municipality: "Groß-Rohrheim",
    fraction: "gelber_sack",
    licensePlate: "HP-ZK 502",
    vehicleModel: "Scania L280 (Variopress 524)",
    periodSec: 1140,
    offsetSec: 150,
    speedCollectingKmh: 15,
    speedTransitKmh: 50,
    track: ROUTE_GROSS_ROHRHEIM,
    waypoints: [
      { street: "Bahnhofstraße", lat: 49.7134, lng: 8.4767, stopProg: 0.380, expectedTimeWindow: "07:30 – 08:30 Uhr", dwellSec: 40 },
      { street: "Rathaus / Kirchstraße", lat: 49.7174, lng: 8.4784, stopProg: 0.428, expectedTimeWindow: "08:30 – 09:30 Uhr", dwellSec: 35 },
      { street: "Bürgerhalle", lat: 49.7184, lng: 8.4794, stopProg: 0.442, expectedTimeWindow: "09:30 – 10:30 Uhr", dwellSec: 45 },
      { street: "Friedhof / Kornstraße", lat: 49.7209, lng: 8.4814, stopProg: 0.475, expectedTimeWindow: "10:30 – 11:30 Uhr", dwellSec: 40 },
    ],
  },
];

export interface LiveWasteTruck {
  id: string;
  tourCode: string;
  name: string;
  municipality: string;
  fraction: WasteFraction;
  fractionLabel: string;
  binColor: string;
  accentColor: string;
  licensePlate: string;
  vehicleModel: string;
  lat: number;
  lng: number;
  heading: number;
  speedKmh: number;
  status: "collecting" | "bin_emptying" | "transit";
  currentStreet: string;
  nextStreet: string;
  expectedTimeWindow: string;
  loadPercent: number;
  emptyCountdownSec?: number;
  emptyProgress?: number;
  predictionBasis: string;
}

export function calculateWasteTruckMobility(timestampMs: number = Date.now()): {
  trucks: LiveWasteTruck[];
  depots: WasteDepot[];
} {
  const trucks: LiveWasteTruck[] = [];

  for (const tour of ZAKB_TOURS) {
    const fractionMeta = WASTE_FRACTIONS[tour.fraction];
    const cycleTimeSec = ((timestampMs / 1000 + tour.offsetSec) % tour.periodSec);
    const totalProg = Math.max(0, Math.min(1, cycleTimeSec / tour.periodSec));

    let isDwelling = false;
    let currentWaypoint: CollectionWaypoint | undefined;
    let nextWaypoint: CollectionWaypoint | undefined;
    let dwellProgress = 0;
    let dwellRemainingSec = 0;

    const dwellWindowProg = 0.05;

    for (let i = 0; i < tour.waypoints.length; i++) {
      const wp = tour.waypoints[i];
      const startProg = wp.stopProg - dwellWindowProg / 2;
      const endProg = wp.stopProg + dwellWindowProg / 2;

      if (totalProg >= startProg && totalProg <= endProg) {
        isDwelling = true;
        currentWaypoint = wp;
        const dwellProgFraction = (totalProg - startProg) / dwellWindowProg;
        dwellProgress = Math.max(0, Math.min(1, 1.0 - dwellProgFraction));
        dwellRemainingSec = Math.round(dwellProgress * wp.dwellSec);
        nextWaypoint = tour.waypoints[(i + 1) % tour.waypoints.length];
        break;
      }

      if (totalProg < wp.stopProg && !nextWaypoint) {
        nextWaypoint = wp;
      }
    }

    if (!nextWaypoint && tour.waypoints.length > 0) {
      nextWaypoint = tour.waypoints[0];
    }

    let lat: number;
    let lng: number;
    let heading: number;
    let speedKmh: number;
    let status: "collecting" | "bin_emptying" | "transit";

    if (isDwelling && currentWaypoint) {
      lat = currentWaypoint.lat;
      lng = currentWaypoint.lng;
      const pos = interpolatePolyline(tour.track, currentWaypoint.stopProg);
      heading = pos.heading;
      speedKmh = 0;
      status = "bin_emptying";
    } else {
      const pos = interpolatePolyline(tour.track, totalProg);
      lat = pos.lat;
      lng = pos.lng;
      heading = pos.heading;

      const isTransitSegment = totalProg < 0.1 || totalProg > 0.9;
      speedKmh = isTransitSegment ? tour.speedTransitKmh : tour.speedCollectingKmh;
      status = isTransitSegment ? "transit" : "collecting";
    }

    let currentStreet = isDwelling && currentWaypoint
      ? currentWaypoint.street
      : nextWaypoint
      ? `Zufahrt ${nextWaypoint.street}`
      : `${tour.municipality} Ortslage`;

    if (status === "transit") {
      currentStreet = totalProg < 0.1 ? "Ausfahrt Depot / Stützpunkt" : "Rückfahrt ZAKB Wertstoffhof / Depot";
    }

    const nextStreet = nextWaypoint ? nextWaypoint.street : "Depot";
    const expectedTimeWindow = nextWaypoint ? nextWaypoint.expectedTimeWindow : "Planmäßig";
    const loadPercent = Math.min(95, Math.round(15 + totalProg * 75));

    trucks.push({
      id: tour.id,
      tourCode: tour.tourCode,
      name: tour.name,
      municipality: tour.municipality,
      fraction: tour.fraction,
      fractionLabel: fractionMeta.name,
      binColor: fractionMeta.binColor,
      accentColor: fractionMeta.accentColor,
      licensePlate: tour.licensePlate,
      vehicleModel: tour.vehicleModel,
      lat,
      lng,
      heading,
      speedKmh,
      status,
      currentStreet,
      nextStreet,
      expectedTimeWindow,
      loadPercent,
      emptyCountdownSec: isDwelling ? dwellRemainingSec : undefined,
      emptyProgress: isDwelling ? dwellProgress : undefined,
      predictionBasis: "Prognose nach ZAKB Abfuhrkalender & Tourenmodell (kein Echtzeit-GPS)",
    });
  }

  return {
    trucks,
    depots: ZAKB_DEPOTS,
  };
}
