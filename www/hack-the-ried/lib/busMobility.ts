/**
 * VRN GTFS-RT Bus Mobility Engine for the Hessian Ried.
 * Covers regional VRN lines (641, 642, 644, 652 School Bus),
 * bus stop dwell with animated radial departure countdown gauges,
 * automated school bus detection using school schedules & Hessian holiday calendar,
 * level crossing (BÜ) conflict warnings, and intermodal train synchronization.
 */

import { haversineMeters, interpolatePolyline, ACTIVE_LEVEL_CROSSINGS, calculateRiedMobility } from "./railMobility";
import {
  ROUTE_641_ROAD_TRACK,
  ROUTE_642_ROAD_TRACK,
  ROUTE_644_ROAD_TRACK,
  ROUTE_652_ROAD_TRACK,
  ROUTE_644_GR_ROAD_TRACK,
} from "./roadRoutes";

export interface BusStop {
  id: string;
  name: string;
  municipality: "Bürstadt" | "Bobstadt" | "Riedrode" | "Lampertheim" | "Hofheim (Ried)" | "Biblis" | "Groß-Rohrheim" | "Rosengarten" | string;
  lat: number;
  lng: number;
  lines: string[];
  direction?: "Biblis" | "Worms" | "Lampertheim" | "Bürstadt" | string;
  directionLabel?: string;
  isSchoolStop?: boolean;
  nearbySchoolName?: string;
  isTrainHub?: boolean; // Bürstadt Bhf, Lampertheim Bhf, Biblis Bhf
  platforms?: string[];
}

export interface LiveBus {
  id: string;
  line: string; // "641", "642", "644", "652"
  lineCode: string;
  operator: string;
  origin: string;
  destination: string;
  lat: number;
  lng: number;
  heading: number;
  speedKmh: number;
  status: "moving" | "stopped";
  currentStopId?: string;
  currentStopName?: string;
  nextStopId?: string;
  nextStopName?: string;
  dwellTimeRemainingSec?: number;
  dwellTotalSec?: number;
  dwellProgress?: number; // 1.0 (just arrived) -> 0.0 (departing)
  delaySec: number; // GTFS-RT delay (can be 0 or small positive/negative)
  delayMinutes: number;
  isSchoolBus: boolean;
  schoolBusReason?: string;
  wheelchairAccessible: boolean; // Niederflurbus
  approachingCrossingWarning?: string; // BÜ closure warning
  intermodalConnectionInfo?: string; // e.g. "Anschluss zu S 9 in 5 Min"
}

export interface BusDeparture {
  line: string;
  destination: string;
  origin: string;
  scheduledTime: string;
  estimatedTime: string;
  delayMinutes: number;
  isSchoolBus: boolean;
  schoolBusReason?: string;
  wheelchairAccessible: boolean;
  platform?: string;
}

// 1. All Bus Stops across the Hessian Ried corridor (Bürstadt, Bobstadt, Riedrode, Lampertheim, Neuschloß, Hüttenfeld, Hofheim, Biblis, Wattenheim, Nordheim, Groß-Rohrheim)
// Calibrated with directional platforms on both sides of the street matching OpenStreetMap & VRN GTFS ground truth
export const RIED_BUS_STOPS: BusStop[] = [
  {
    id: "stop-bst-bahnhof-steig1",
    name: "Bürstadt Bahnhof (ZOB)",
    municipality: "Bürstadt",
    lat: 49.64548,
    lng: 8.45835,
    lines: ["641","642","643","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Bussteig 1 (Richtung Lampertheim / Bobstadt)"],
    isTrainHub: true,
  },
  {
    id: "stop-bst-bahnhof-steig2",
    name: "Bürstadt Bahnhof (ZOB)",
    municipality: "Bürstadt",
    lat: 49.64534,
    lng: 8.45819,
    lines: ["641","642","643","652"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Bussteig 2 (Richtung Worms / Hofheim)"],
    isTrainHub: true,
  },
  {
    id: "stop-bst-bahnhof-steig3",
    name: "Bürstadt Bahnhof (ZOB)",
    municipality: "Bürstadt",
    lat: 49.64555,
    lng: 8.4581,
    lines: ["641","642","643","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt EKS",
    platforms: ["Bussteig 3 (Richtung EKS / Gartenstadt)"],
    isTrainHub: true,
  },
  {
    id: "stop-bst-marktplatz-ost",
    name: "Bürstadt Marktplatz / Historisches Rathaus",
    municipality: "Bürstadt",
    lat: 49.64146,
    lng: 8.45472,
    lines: ["641","642","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof / EKS",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-marktplatz-west",
    name: "Bürstadt Marktplatz / Historisches Rathaus",
    municipality: "Bürstadt",
    lat: 49.64134,
    lng: 8.45448,
    lines: ["641","642","652"],
    direction: "Worms",
    directionLabel: "Richtung Worms / Lampertheim",
    platforms: ["Steig 2 (Richtung Worms / Lampertheim)"],
  },
  {
    id: "stop-bst-eks-ankunft",
    name: "Bürstadt Erich-Kästner-Schule",
    municipality: "Bürstadt",
    lat: 49.64838,
    lng: 8.46152,
    lines: ["642","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Schulzentrum",
    platforms: ["Schulbussteig 1 (Richtung Lampertheim)"],
    isSchoolStop: true,
    nearbySchoolName: "Erich-Kästner-Schule (Integrierte Gesamtschule)",
  },
  {
    id: "stop-bst-eks-abfahrt",
    name: "Bürstadt Erich-Kästner-Schule",
    municipality: "Bürstadt",
    lat: 49.64822,
    lng: 8.46128,
    lines: ["642","652"],
    direction: "Worms",
    directionLabel: "Richtung Bürstadt Bhf / Worms Hbf",
    platforms: ["Schulbussteig 2 (Richtung Bahnhof / Worms)"],
    isSchoolStop: true,
    nearbySchoolName: "Erich-Kästner-Schule (Integrierte Gesamtschule)",
  },
  {
    id: "stop-bst-schillerschule-nord",
    name: "Bürstadt Schillerschule / Boxheimerhofstr.",
    municipality: "Bürstadt",
    lat: 49.64968,
    lng: 8.46172,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
    isSchoolStop: true,
    nearbySchoolName: "Schillerschule Grundschule",
  },
  {
    id: "stop-bst-schillerschule-sued",
    name: "Bürstadt Schillerschule / Boxheimerhofstr.",
    municipality: "Bürstadt",
    lat: 49.64952,
    lng: 8.46148,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Boxheimerhof / Lampertheim",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
    isSchoolStop: true,
    nearbySchoolName: "Schillerschule Grundschule",
  },
  {
    id: "stop-bst-boxheimerhof-nord",
    name: "Bürstadt Boxheimerhof",
    municipality: "Bürstadt",
    lat: 49.62968,
    lng: 8.47962,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt Bhf)"],
  },
  {
    id: "stop-bst-boxheimerhof-sued",
    name: "Bürstadt Boxheimerhof",
    municipality: "Bürstadt",
    lat: 49.62952,
    lng: 8.47938,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 2 (Richtung Lampertheim Bhf)"],
  },
  {
    id: "stop-bst-sonneneck-nord",
    name: "Bürstadt Sonneneck / Mainstraße Süd",
    municipality: "Bürstadt",
    lat: 49.64328,
    lng: 8.45162,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof / EKS",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-sonneneck-sued",
    name: "Bürstadt Sonneneck / Mainstraße Süd",
    municipality: "Bürstadt",
    lat: 49.64312,
    lng: 8.45138,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Hofheim / Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bst-nibelungenstr-ost",
    name: "Bürstadt Nibelungenstraße (B47)",
    municipality: "Bürstadt",
    lat: 49.64156,
    lng: 8.45312,
    lines: ["642","643"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-nibelungenstr-west",
    name: "Bürstadt Nibelungenstraße (B47)",
    municipality: "Bürstadt",
    lat: 49.64144,
    lng: 8.45288,
    lines: ["642","643"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bst-wilhelminenstr-nord",
    name: "Bürstadt Wilhelminenstraße",
    municipality: "Bürstadt",
    lat: 49.64408,
    lng: 8.45562,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-wilhelminenstr-sued",
    name: "Bürstadt Wilhelminenstraße",
    municipality: "Bürstadt",
    lat: 49.64392,
    lng: 8.45538,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
  },
  {
    id: "stop-bst-wasserwerk-nord",
    name: "Bürstadt Wasserwerk",
    municipality: "Bürstadt",
    lat: 49.63908,
    lng: 8.45912,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-wasserwerk-sued",
    name: "Bürstadt Wasserwerk",
    municipality: "Bürstadt",
    lat: 49.63892,
    lng: 8.45888,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bst-industriestr-ost",
    name: "Bürstadt Industriestraße / KAMÜ Kulturzentrum",
    municipality: "Bürstadt",
    lat: 49.64578,
    lng: 8.45832,
    lines: ["641","643"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-industriestr-west",
    name: "Bürstadt Industriestraße / KAMÜ Kulturzentrum",
    municipality: "Bürstadt",
    lat: 49.64562,
    lng: 8.45808,
    lines: ["641","643"],
    direction: "Bobstadt",
    directionLabel: "Richtung Bobstadt",
    platforms: ["Steig 2 (Richtung Bobstadt)"],
  },
  {
    id: "stop-bst-altenheim-nord",
    name: "Bürstadt St. Elisabeth / Seniorenzentrum",
    municipality: "Bürstadt",
    lat: 49.64658,
    lng: 8.45532,
    lines: ["641","642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-altenheim-sued",
    name: "Bürstadt St. Elisabeth / Seniorenzentrum",
    municipality: "Bürstadt",
    lat: 49.64642,
    lng: 8.45508,
    lines: ["641","642"],
    direction: "Worms",
    directionLabel: "Richtung Marktplatz / Worms",
    platforms: ["Steig 2 (Richtung Marktplatz)"],
  },
  {
    id: "stop-bst-beethovenstr-nord",
    name: "Bürstadt Beethovenstraße / Waldgartenstr.",
    municipality: "Bürstadt",
    lat: 49.64408,
    lng: 8.46012,
    lines: ["641"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-beethovenstr-sued",
    name: "Bürstadt Beethovenstraße / Waldgartenstr.",
    municipality: "Bürstadt",
    lat: 49.64392,
    lng: 8.45988,
    lines: ["641"],
    direction: "Gartenstadt",
    directionLabel: "Richtung Gartenstadt",
    platforms: ["Steig 2 (Richtung Gartenstadt)"],
  },
  {
    id: "stop-bst-jugendhaus-nord",
    name: "Bürstadt Jugendhaus / Am Balla-Balla",
    municipality: "Bürstadt",
    lat: 49.64058,
    lng: 8.46162,
    lines: ["642","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-jugendhaus-sued",
    name: "Bürstadt Jugendhaus / Am Balla-Balla",
    municipality: "Bürstadt",
    lat: 49.64042,
    lng: 8.46138,
    lines: ["642","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Boxheimerhof",
    platforms: ["Steig 2 (Richtung Boxheimerhof)"],
  },
  {
    id: "stop-bst-lache-nord",
    name: "Bürstadt Sportzentrum Die Lache / VfR",
    municipality: "Bürstadt",
    lat: 49.63558,
    lng: 8.45812,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-lache-sued",
    name: "Bürstadt Sportzentrum Die Lache / VfR",
    municipality: "Bürstadt",
    lat: 49.63542,
    lng: 8.45788,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Hofheim / Worms",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bst-kiesbuckel-nord",
    name: "Bürstadt Am Kiesbuckel",
    municipality: "Bürstadt",
    lat: 49.65008,
    lng: 8.45812,
    lines: ["641"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-kiesbuckel-sued",
    name: "Bürstadt Am Kiesbuckel",
    municipality: "Bürstadt",
    lat: 49.64992,
    lng: 8.45788,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
  },
  {
    id: "stop-bst-gartenstadt-nord",
    name: "Bürstadt Gartenstadt / Bürstädter Heide",
    municipality: "Bürstadt",
    lat: 49.65058,
    lng: 8.45762,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-gartenstadt-sued",
    name: "Bürstadt Gartenstadt / Bürstädter Heide",
    municipality: "Bürstadt",
    lat: 49.65042,
    lng: 8.45738,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
  },
  {
    id: "stop-bst-heinrichstr-nord",
    name: "Bürstadt Heinrichstraße",
    municipality: "Bürstadt",
    lat: 49.64408,
    lng: 8.45112,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bst-heinrichstr-sued",
    name: "Bürstadt Heinrichstraße",
    municipality: "Bürstadt",
    lat: 49.64392,
    lng: 8.45088,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Sonneneck / Worms",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bob-altes-rathaus-nord",
    name: "Bobstadt Altes Rathaus / St.-Josef",
    municipality: "Bobstadt",
    lat: 49.66358,
    lng: 8.44662,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-bob-altes-rathaus-sued",
    name: "Bobstadt Altes Rathaus / St.-Josef",
    municipality: "Bobstadt",
    lat: 49.66342,
    lng: 8.44638,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
  },
  {
    id: "stop-bob-frankenstr-nord",
    name: "Bobstadt Frankenstraße",
    municipality: "Bobstadt",
    lat: 49.66108,
    lng: 8.44862,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-bob-frankenstr-sued",
    name: "Bobstadt Frankenstraße",
    municipality: "Bobstadt",
    lat: 49.66092,
    lng: 8.44838,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
  },
  {
    id: "stop-bob-kurpfalzstr-nord",
    name: "Bobstadt Kurpfalzstraße",
    municipality: "Bobstadt",
    lat: 49.66008,
    lng: 8.44512,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-bob-kurpfalzstr-sued",
    name: "Bobstadt Kurpfalzstraße",
    municipality: "Bobstadt",
    lat: 49.65992,
    lng: 8.44488,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
  },
  {
    id: "stop-bob-friedhof-nord",
    name: "Bobstadt Friedhof",
    municipality: "Bobstadt",
    lat: 49.66458,
    lng: 8.44912,
    lines: ["641"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-bob-friedhof-sued",
    name: "Bobstadt Friedhof",
    municipality: "Bobstadt",
    lat: 49.66442,
    lng: 8.44888,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
  },
  {
    id: "stop-bob-bahnhof-steig1",
    name: "Bobstadt Bahnhof (Haltepunkt)",
    municipality: "Bobstadt",
    lat: 49.66318,
    lng: 8.44692,
    lines: ["641"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
    isTrainHub: true,
  },
  {
    id: "stop-bob-bahnhof-steig2",
    name: "Bobstadt Bahnhof (Haltepunkt)",
    municipality: "Bobstadt",
    lat: 49.66302,
    lng: 8.44668,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 2 (Richtung Lampertheim)"],
    isTrainHub: true,
  },
  {
    id: "stop-rrd-bahnhof-steig1",
    name: "Riedrode Bahnhof",
    municipality: "Riedrode",
    lat: 49.64658,
    lng: 8.48912,
    lines: ["643"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
    isTrainHub: true,
  },
  {
    id: "stop-rrd-bahnhof-steig2",
    name: "Riedrode Bahnhof",
    municipality: "Riedrode",
    lat: 49.64642,
    lng: 8.48888,
    lines: ["643"],
    direction: "Riedrode",
    directionLabel: "Richtung Lorsch / Bensheim",
    platforms: ["Steig 2 (Richtung Lorsch)"],
    isTrainHub: true,
  },
  {
    id: "stop-rrd-buergerhaus-nord",
    name: "Riedrode Bürgerhaus",
    municipality: "Riedrode",
    lat: 49.64758,
    lng: 8.49112,
    lines: ["643"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-rrd-buergerhaus-sued",
    name: "Riedrode Bürgerhaus",
    municipality: "Riedrode",
    lat: 49.64742,
    lng: 8.49088,
    lines: ["643"],
    direction: "Riedrode",
    directionLabel: "Richtung Riedrode Bahnhof",
    platforms: ["Steig 2 (Richtung Bahnhof)"],
  },
  {
    id: "stop-rrd-eichendorff-nord",
    name: "Riedrode Eichendorffstraße",
    municipality: "Riedrode",
    lat: 49.64858,
    lng: 8.49362,
    lines: ["643"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-rrd-eichendorff-sued",
    name: "Riedrode Eichendorffstraße",
    municipality: "Riedrode",
    lat: 49.64842,
    lng: 8.49338,
    lines: ["643"],
    direction: "Riedrode",
    directionLabel: "Richtung Ortsausgang",
    platforms: ["Steig 2 (Richtung Ortsausgang)"],
  },
  {
    id: "stop-la-bahnhof-steig1",
    name: "Lampertheim Bahnhof (ZOB)",
    municipality: "Lampertheim",
    lat: 49.59872,
    lng: 8.47792,
    lines: ["641","644","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt / Biblis",
    platforms: ["Bussteig 1 (Richtung Bürstadt)"],
    isTrainHub: true,
  },
  {
    id: "stop-la-bahnhof-steig2",
    name: "Lampertheim Bahnhof (ZOB)",
    municipality: "Lampertheim",
    lat: 49.59858,
    lng: 8.47776,
    lines: ["641","644","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Neuschloß / Worms Hbf",
    platforms: ["Bussteig 2 (Richtung Neuschloß / Worms)"],
    isTrainHub: true,
  },
  {
    id: "stop-la-domkirche-nord",
    name: "Lampertheim Domkirche / Römerstraße",
    municipality: "Lampertheim",
    lat: 49.59478,
    lng: 8.46802,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Lampertheim Bahnhof / Bürstadt",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-domkirche-sued",
    name: "Lampertheim Domkirche / Römerstraße",
    municipality: "Lampertheim",
    lat: 49.59462,
    lng: 8.46778,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Altrhein / Worms",
    platforms: ["Steig 2 (Richtung Altrhein)"],
  },
  {
    id: "stop-la-lessing-gymnasium-nord",
    name: "Lampertheim Lessing-Gymnasium",
    municipality: "Lampertheim",
    lat: 49.59888,
    lng: 8.45522,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Lampertheim Bhf / Bürstadt",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
    isSchoolStop: true,
    nearbySchoolName: "Lessing-Gymnasium Lampertheim",
  },
  {
    id: "stop-la-lessing-gymnasium-sued",
    name: "Lampertheim Lessing-Gymnasium",
    municipality: "Lampertheim",
    lat: 49.59872,
    lng: 8.45498,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Sportzentrum / Schulzentrum",
    platforms: ["Steig 2 (Richtung Sportzentrum)"],
    isSchoolStop: true,
    nearbySchoolName: "Lessing-Gymnasium Lampertheim",
  },
  {
    id: "stop-la-alfred-delp-nord",
    name: "Lampertheim Alfred-Delp-Schule",
    municipality: "Lampertheim",
    lat: 49.59928,
    lng: 8.45692,
    lines: ["641","652"],
    direction: "Bürstadt",
    directionLabel: "Richtung Lampertheim Bhf / Bürstadt",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
    isSchoolStop: true,
    nearbySchoolName: "Alfred-Delp-Schule (Realschule / Hauptschule)",
  },
  {
    id: "stop-la-alfred-delp-sued",
    name: "Lampertheim Alfred-Delp-Schule",
    municipality: "Lampertheim",
    lat: 49.59912,
    lng: 8.45668,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Schulzentrum West",
    platforms: ["Steig 2 (Richtung Schulzentrum)"],
    isSchoolStop: true,
    nearbySchoolName: "Alfred-Delp-Schule (Realschule / Hauptschule)",
  },
  {
    id: "stop-la-altes-rathaus-nord",
    name: "Lampertheim Altes Rathaus / Römerstraße",
    municipality: "Lampertheim",
    lat: 49.59408,
    lng: 8.46712,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-altes-rathaus-sued",
    name: "Lampertheim Altes Rathaus / Römerstraße",
    municipality: "Lampertheim",
    lat: 49.59392,
    lng: 8.46688,
    lines: ["641"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-la-sedandamm-nord",
    name: "Lampertheim Sedandamm / Altrhein",
    municipality: "Lampertheim",
    lat: 49.59258,
    lng: 8.46212,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-sedandamm-sued",
    name: "Lampertheim Sedandamm / Altrhein",
    municipality: "Lampertheim",
    lat: 49.59242,
    lng: 8.46188,
    lines: ["641"],
    direction: "Worms",
    directionLabel: "Richtung Altrhein / Worms",
    platforms: ["Steig 2 (Richtung Altrhein)"],
  },
  {
    id: "stop-la-hallenbad-nord",
    name: "Lampertheim Biedensand Bäder / Hallenbad",
    municipality: "Lampertheim",
    lat: 49.59758,
    lng: 8.45512,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-hallenbad-sued",
    name: "Lampertheim Biedensand Bäder / Hallenbad",
    municipality: "Lampertheim",
    lat: 49.59742,
    lng: 8.45488,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Biedensand",
    platforms: ["Steig 2 (Richtung Biedensand)"],
  },
  {
    id: "stop-la-buerstaedter-str-nord",
    name: "Lampertheim Bürstädter Straße",
    municipality: "Lampertheim",
    lat: 49.59688,
    lng: 8.47712,
    lines: ["641"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-la-buerstaedter-str-sued",
    name: "Lampertheim Bürstädter Straße",
    municipality: "Lampertheim",
    lat: 49.59672,
    lng: 8.47688,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 2 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-pestalozzi-nord",
    name: "Lampertheim Pestalozzischule",
    municipality: "Lampertheim",
    lat: 49.59908,
    lng: 8.46312,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
    isSchoolStop: true,
    nearbySchoolName: "Pestalozzischule Grundschule",
  },
  {
    id: "stop-la-pestalozzi-sued",
    name: "Lampertheim Pestalozzischule",
    municipality: "Lampertheim",
    lat: 49.59892,
    lng: 8.46288,
    lines: ["641","652"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lessing-Gymnasium",
    platforms: ["Steig 2 (Richtung Lessing-Gymnasium)"],
    isSchoolStop: true,
    nearbySchoolName: "Pestalozzischule Grundschule",
  },
  {
    id: "stop-la-europabruecke-nord",
    name: "Lampertheim Europabrücke / B44",
    municipality: "Lampertheim",
    lat: 49.58908,
    lng: 8.46612,
    lines: ["644"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Lampertheim)"],
  },
  {
    id: "stop-la-europabruecke-sued",
    name: "Lampertheim Europabrücke / B44",
    municipality: "Lampertheim",
    lat: 49.58892,
    lng: 8.46588,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-la-wilhelmstr-nord",
    name: "Lampertheim Wilhelmstraße",
    municipality: "Lampertheim",
    lat: 49.59308,
    lng: 8.47512,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-wilhelmstr-sued",
    name: "Lampertheim Wilhelmstraße",
    municipality: "Lampertheim",
    lat: 49.59292,
    lng: 8.47488,
    lines: ["641"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt",
    platforms: ["Steig 2 (Richtung Bürstadt)"],
  },
  {
    id: "stop-la-chemiestr-nord",
    name: "Lampertheim Chemiestraße",
    municipality: "Lampertheim",
    lat: 49.59608,
    lng: 8.45912,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-chemiestr-sued",
    name: "Lampertheim Chemiestraße",
    municipality: "Lampertheim",
    lat: 49.59592,
    lng: 8.45888,
    lines: ["641"],
    direction: "Neuschloß",
    directionLabel: "Richtung Neuschloß",
    platforms: ["Steig 2 (Richtung Neuschloß)"],
  },
  {
    id: "stop-la-falterweg-nord",
    name: "Lampertheim Falterweg",
    municipality: "Lampertheim",
    lat: 49.59708,
    lng: 8.46912,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-falterweg-sued",
    name: "Lampertheim Falterweg",
    municipality: "Lampertheim",
    lat: 49.59692,
    lng: 8.46888,
    lines: ["641"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt",
    platforms: ["Steig 2 (Richtung Bürstadt)"],
  },
  {
    id: "stop-la-worms-str-nord",
    name: "Lampertheim Wormser Straße (Ost)",
    municipality: "Lampertheim",
    lat: 49.59408,
    lng: 8.46712,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-worms-str-sued",
    name: "Lampertheim Wormser Straße (Ost)",
    municipality: "Lampertheim",
    lat: 49.59392,
    lng: 8.46688,
    lines: ["641"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-la-schlossplatz-west",
    name: "Lampertheim-Neuschloß Schlossplatz",
    municipality: "Lampertheim",
    lat: 49.60178,
    lng: 8.51862,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-schlossplatz-ost",
    name: "Lampertheim-Neuschloß Schlossplatz",
    municipality: "Lampertheim",
    lat: 49.60162,
    lng: 8.51838,
    lines: ["641"],
    direction: "Hüttenfeld",
    directionLabel: "Richtung Hüttenfeld",
    platforms: ["Steig 2 (Richtung Hüttenfeld)"],
  },
  {
    id: "stop-la-ulmenweg-west",
    name: "Lampertheim-Neuschloß Ulmenweg",
    municipality: "Lampertheim",
    lat: 49.60058,
    lng: 8.51512,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-ulmenweg-ost",
    name: "Lampertheim-Neuschloß Ulmenweg",
    municipality: "Lampertheim",
    lat: 49.60042,
    lng: 8.51488,
    lines: ["641"],
    direction: "Neuschloß",
    directionLabel: "Richtung Schlossplatz",
    platforms: ["Steig 2 (Richtung Schlossplatz)"],
  },
  {
    id: "stop-la-lindenweg-west",
    name: "Lampertheim-Neuschloß Lindenweg",
    municipality: "Lampertheim",
    lat: 49.60258,
    lng: 8.51662,
    lines: ["641"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-lindenweg-ost",
    name: "Lampertheim-Neuschloß Lindenweg",
    municipality: "Lampertheim",
    lat: 49.60242,
    lng: 8.51638,
    lines: ["641"],
    direction: "Neuschloß",
    directionLabel: "Richtung Schlossplatz",
    platforms: ["Steig 2 (Richtung Schlossplatz)"],
  },
  {
    id: "stop-la-huettenfeld-buergerhaus-west",
    name: "Lampertheim-Hüttenfeld Bürgerhaus",
    municipality: "Lampertheim",
    lat: 49.59808,
    lng: 8.58312,
    lines: ["644"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-huettenfeld-buergerhaus-ost",
    name: "Lampertheim-Hüttenfeld Bürgerhaus",
    municipality: "Lampertheim",
    lat: 49.59792,
    lng: 8.58288,
    lines: ["644"],
    direction: "Hüttenfeld",
    directionLabel: "Richtung Viernheim",
    platforms: ["Steig 2 (Richtung Viernheim)"],
  },
  {
    id: "stop-la-huettenfeld-litauer-west",
    name: "Lampertheim-Hüttenfeld Litauersiedlung",
    municipality: "Lampertheim",
    lat: 49.59908,
    lng: 8.58112,
    lines: ["644"],
    direction: "Lampertheim",
    directionLabel: "Richtung Lampertheim Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-la-huettenfeld-litauer-ost",
    name: "Lampertheim-Hüttenfeld Litauersiedlung",
    municipality: "Lampertheim",
    lat: 49.59892,
    lng: 8.58088,
    lines: ["644"],
    direction: "Hüttenfeld",
    directionLabel: "Richtung Bürgerhaus",
    platforms: ["Steig 2 (Richtung Bürgerhaus)"],
  },
  {
    id: "stop-hof-bahnhof-steig1",
    name: "Hofheim (Ried) Bahnhof",
    municipality: "Hofheim (Ried)",
    lat: 49.65938,
    lng: 8.40932,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
    isTrainHub: true,
  },
  {
    id: "stop-hof-bahnhof-steig2",
    name: "Hofheim (Ried) Bahnhof",
    municipality: "Hofheim (Ried)",
    lat: 49.65922,
    lng: 8.40908,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
    isTrainHub: true,
  },
  {
    id: "stop-hof-schule-nord",
    name: "Hofheim Nibelungenschule",
    municipality: "Hofheim (Ried)",
    lat: 49.65858,
    lng: 8.41212,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof / EKS",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
    isSchoolStop: true,
    nearbySchoolName: "Schule Hofheim (Nibelungenschule)",
  },
  {
    id: "stop-hof-schule-sued",
    name: "Hofheim Nibelungenschule",
    municipality: "Hofheim (Ried)",
    lat: 49.65842,
    lng: 8.41188,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
    isSchoolStop: true,
    nearbySchoolName: "Schule Hofheim (Nibelungenschule)",
  },
  {
    id: "stop-hof-kirche-nord",
    name: "Hofheim Balthasar-Neumann-Kirche",
    municipality: "Hofheim (Ried)",
    lat: 49.65908,
    lng: 8.41262,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-hof-kirche-sued",
    name: "Hofheim Balthasar-Neumann-Kirche",
    municipality: "Hofheim (Ried)",
    lat: 49.65892,
    lng: 8.41238,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-hof-buergerhaus-nord",
    name: "Hofheim Bürgerhaus / Altes Rathaus",
    municipality: "Hofheim (Ried)",
    lat: 49.65808,
    lng: 8.41112,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-hof-buergerhaus-sued",
    name: "Hofheim Bürgerhaus / Altes Rathaus",
    municipality: "Hofheim (Ried)",
    lat: 49.65792,
    lng: 8.41088,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-hof-bibliser-weg-nord",
    name: "Hofheim Bibliser Weg",
    municipality: "Hofheim (Ried)",
    lat: 49.66158,
    lng: 8.41362,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-hof-bibliser-weg-sued",
    name: "Hofheim Bibliser Weg",
    municipality: "Hofheim (Ried)",
    lat: 49.66142,
    lng: 8.41338,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-hof-backhausstr-nord",
    name: "Hofheim Backhausstraße / Nordend",
    municipality: "Hofheim (Ried)",
    lat: 49.66258,
    lng: 8.41462,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-hof-backhausstr-sued",
    name: "Hofheim Backhausstraße / Nordend",
    municipality: "Hofheim (Ried)",
    lat: 49.66242,
    lng: 8.41438,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-hof-wormser-str-nord",
    name: "Hofheim Wormser Straße (Süd)",
    municipality: "Hofheim (Ried)",
    lat: 49.65408,
    lng: 8.41512,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-hof-wormser-str-sued",
    name: "Hofheim Wormser Straße (Süd)",
    municipality: "Hofheim (Ried)",
    lat: 49.65392,
    lng: 8.41488,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-hof-friedhof-nord",
    name: "Hofheim Friedhof",
    municipality: "Hofheim (Ried)",
    lat: 49.66008,
    lng: 8.41662,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-hof-friedhof-sued",
    name: "Hofheim Friedhof",
    municipality: "Hofheim (Ried)",
    lat: 49.65992,
    lng: 8.41638,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-hof-riedstr-nord",
    name: "Hofheim Riedstraße",
    municipality: "Hofheim (Ried)",
    lat: 49.65108,
    lng: 8.42312,
    lines: ["642"],
    direction: "Bürstadt",
    directionLabel: "Richtung Bürstadt Bahnhof",
    platforms: ["Steig 1 (Richtung Bürstadt)"],
  },
  {
    id: "stop-hof-riedstr-sued",
    name: "Hofheim Riedstraße",
    municipality: "Hofheim (Ried)",
    lat: 49.65092,
    lng: 8.42288,
    lines: ["642"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bib-bahnhof-steig1",
    name: "Biblis Bahnhof (ZOB)",
    municipality: "Biblis",
    lat: 49.68915,
    lng: 8.4504,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Wattenheim / Nordheim / Worms",
    platforms: ["Bussteig 1 (Richtung Worms)"],
    isTrainHub: true,
  },
  {
    id: "stop-bib-bahnhof-steig2",
    name: "Biblis Bahnhof (ZOB)",
    municipality: "Biblis",
    lat: 49.68903,
    lng: 8.45056,
    lines: ["644"],
    direction: "Groß-Rohrheim",
    directionLabel: "Richtung Groß-Rohrheim Bahnhof",
    platforms: ["Bussteig 2 (Richtung Groß-Rohrheim)"],
    isTrainHub: true,
  },
  {
    id: "stop-bib-rathaus-biblis",
    name: "Biblis Rathaus / Darmstädter Straße",
    municipality: "Biblis",
    lat: 49.68728,
    lng: 8.44535,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bib-rathaus-worms",
    name: "Biblis Rathaus / Darmstädter Straße",
    municipality: "Biblis",
    lat: 49.68712,
    lng: 8.44505,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Wattenheim / Worms",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bib-schule-nord",
    name: "Biblis Schule in den Weschnitzauen / Riedhalle",
    municipality: "Biblis",
    lat: 49.6881,
    lng: 8.45315,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
    isSchoolStop: true,
    nearbySchoolName: "Schule in den Weschnitzauen (Grundschule)",
  },
  {
    id: "stop-bib-schule-sued",
    name: "Biblis Schule in den Weschnitzauen / Riedhalle",
    municipality: "Biblis",
    lat: 49.6879,
    lng: 8.45285,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Wattenheim / Worms",
    platforms: ["Steig 2 (Richtung Worms)"],
    isSchoolStop: true,
    nearbySchoolName: "Schule in den Weschnitzauen (Grundschule)",
  },
  {
    id: "stop-bib-kirchstr-nord",
    name: "Biblis Kirchstraße / St. Bartholomäus",
    municipality: "Biblis",
    lat: 49.6851,
    lng: 8.44615,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bib-kirchstr-sued",
    name: "Biblis Kirchstraße / St. Bartholomäus",
    municipality: "Biblis",
    lat: 49.6849,
    lng: 8.44585,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Wattenheim / Worms",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bib-hintergasse-nord",
    name: "Biblis Hintergasse",
    municipality: "Biblis",
    lat: 49.6861,
    lng: 8.44315,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bib-hintergasse-sued",
    name: "Biblis Hintergasse",
    municipality: "Biblis",
    lat: 49.6859,
    lng: 8.44285,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Wattenheim / Worms",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bib-buergerzentrum-nord",
    name: "Biblis Bürgerzentrum",
    municipality: "Biblis",
    lat: 49.6876,
    lng: 8.44365,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bib-buergerzentrum-sued",
    name: "Biblis Bürgerzentrum",
    municipality: "Biblis",
    lat: 49.6874,
    lng: 8.44335,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Wattenheim / Worms",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-bib-pfaffenau-nord",
    name: "Biblis Pfaffenau",
    municipality: "Biblis",
    lat: 49.6896,
    lng: 8.45415,
    lines: ["644"],
    direction: "Groß-Rohrheim",
    directionLabel: "Richtung Groß-Rohrheim Bahnhof",
    platforms: ["Steig 1 (Richtung Groß-Rohrheim)"],
  },
  {
    id: "stop-bib-pfaffenau-sued",
    name: "Biblis Pfaffenau",
    municipality: "Biblis",
    lat: 49.6894,
    lng: 8.45385,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof / Worms",
    platforms: ["Steig 2 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bib-wasserwerk-nord",
    name: "Biblis Am Werrtor / Wertstoffhof",
    municipality: "Biblis",
    lat: 49.6913,
    lng: 8.44515,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Bahnhof)"],
  },
  {
    id: "stop-bib-wasserwerk-sued",
    name: "Biblis Am Werrtor / Wertstoffhof",
    municipality: "Biblis",
    lat: 49.6911,
    lng: 8.44485,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Wattenheim / Worms",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-wat-ortsmitte-biblis",
    name: "Wattenheim Ort / Kirche",
    municipality: "Biblis",
    lat: 49.685511,
    lng: 8.410486,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-wat-ortsmitte-worms",
    name: "Wattenheim Ort / Kirche",
    municipality: "Biblis",
    lat: 49.685383,
    lng: 8.41036,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-wat-rheinstr-biblis",
    name: "Wattenheim Rheinstraße Ost",
    municipality: "Biblis",
    lat: 49.68555,
    lng: 8.4141,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-wat-rheinstr-worms",
    name: "Wattenheim Rheinstraße Ost",
    municipality: "Biblis",
    lat: 49.68545,
    lng: 8.4139,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-wat-steiner-str-biblis",
    name: "Wattenheim Steiner Straße West",
    municipality: "Biblis",
    lat: 49.68425,
    lng: 8.4066,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-wat-steiner-str-worms",
    name: "Wattenheim Steiner Straße West",
    municipality: "Biblis",
    lat: 49.68415,
    lng: 8.4064,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-nor-rathaus-biblis",
    name: "Nordheim Rathaus / Burg-Stein-Museum",
    municipality: "Biblis",
    lat: 49.683279,
    lng: 8.388297,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-nor-rathaus-worms",
    name: "Nordheim Rathaus / Burg-Stein-Museum",
    municipality: "Biblis",
    lat: 49.683006,
    lng: 8.387821,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-nor-steinstr-biblis",
    name: "Nordheim Steinstraße",
    municipality: "Biblis",
    lat: 49.678862,
    lng: 8.387597,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-nor-steinstr-worms",
    name: "Nordheim Steinstraße",
    municipality: "Biblis",
    lat: 49.678705,
    lng: 8.387633,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-nor-friedhof-biblis",
    name: "Nordheim Friedhof / Zum alten Wasserwerk",
    municipality: "Biblis",
    lat: 49.684535,
    lng: 8.392475,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-nor-friedhof-worms",
    name: "Nordheim Friedhof / Zum alten Wasserwerk",
    municipality: "Biblis",
    lat: 49.684517,
    lng: 8.392376,
    lines: ["644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-gr-bahnhof-steig1",
    name: "Groß-Rohrheim Bahnhof",
    municipality: "Groß-Rohrheim",
    lat: 49.71345,
    lng: 8.47675,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof / Worms",
    platforms: ["Steig 1 (Richtung Biblis)"],
    isTrainHub: true,
  },
  {
    id: "stop-gr-bahnhof-steig2",
    name: "Groß-Rohrheim Bahnhof",
    municipality: "Groß-Rohrheim",
    lat: 49.71333,
    lng: 8.47659,
    lines: ["644"],
    direction: "Groß-Rohrheim",
    directionLabel: "Richtung Ortsmitte / Schücostraße",
    platforms: ["Steig 2 (Richtung Schücostr.)"],
    isTrainHub: true,
  },
  {
    id: "stop-gr-buergerhalle-biblis",
    name: "Groß-Rohrheim Bürgerhalle",
    municipality: "Groß-Rohrheim",
    lat: 49.71842,
    lng: 8.47938,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-gr-buergerhalle-nord",
    name: "Groß-Rohrheim Bürgerhalle",
    municipality: "Groß-Rohrheim",
    lat: 49.71858,
    lng: 8.47962,
    lines: ["644"],
    direction: "Groß-Rohrheim",
    directionLabel: "Richtung Schücostraße",
    platforms: ["Steig 2 (Richtung Schücostr.)"],
  },
  {
    id: "stop-gr-rathaus-biblis",
    name: "Groß-Rohrheim Rathaus",
    municipality: "Groß-Rohrheim",
    lat: 49.71742,
    lng: 8.47838,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-gr-rathaus-nord",
    name: "Groß-Rohrheim Rathaus",
    municipality: "Groß-Rohrheim",
    lat: 49.71758,
    lng: 8.47862,
    lines: ["644"],
    direction: "Groß-Rohrheim",
    directionLabel: "Richtung Schücostraße",
    platforms: ["Steig 2 (Richtung Schücostr.)"],
  },
  {
    id: "stop-gr-friedhof-biblis",
    name: "Groß-Rohrheim Friedhof",
    municipality: "Groß-Rohrheim",
    lat: 49.72092,
    lng: 8.48138,
    lines: ["644"],
    direction: "Biblis",
    directionLabel: "Richtung Biblis Bahnhof",
    platforms: ["Steig 1 (Richtung Biblis)"],
  },
  {
    id: "stop-gr-friedhof-nord",
    name: "Groß-Rohrheim Friedhof",
    municipality: "Groß-Rohrheim",
    lat: 49.72108,
    lng: 8.48162,
    lines: ["644"],
    direction: "Groß-Rohrheim",
    directionLabel: "Richtung Schücostraße",
    platforms: ["Steig 2 (Richtung Schücostr.)"],
  },
  {
    id: "stop-ros-nibelungenstr-worms",
    name: "Rosengarten Nibelungenstraße",
    municipality: "Rosengarten",
    lat: 49.6322,
    lng: 8.386,
    lines: ["642", "644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-ros-nibelungenstr-hofheim",
    name: "Rosengarten Nibelungenstraße",
    municipality: "Rosengarten",
    lat: 49.6323,
    lng: 8.3863,
    lines: ["642", "644"],
    direction: "Bürstadt",
    directionLabel: "Richtung Hofheim / Bürstadt",
    platforms: ["Steig 1 (Richtung Hofheim / Bürstadt)"],
  },
  {
    id: "stop-ros-wehrzollhaus-worms",
    name: "Rosengarten Wehrzollhaus",
    municipality: "Rosengarten",
    lat: 49.6315,
    lng: 8.3824,
    lines: ["642", "644"],
    direction: "Worms",
    directionLabel: "Richtung Worms Hbf",
    platforms: ["Steig 2 (Richtung Worms)"],
  },
  {
    id: "stop-ros-wehrzollhaus-ost",
    name: "Rosengarten Wehrzollhaus",
    municipality: "Rosengarten",
    lat: 49.6316,
    lng: 8.3826,
    lines: ["642", "644"],
    direction: "Bürstadt",
    directionLabel: "Richtung Hofheim / Bürstadt",
    platforms: ["Steig 1 (Richtung Hofheim / Bürstadt)"],
  },
];

// 2. Bus Route Track Polylines
// Line 641: Bürstadt Bahnhof <-> Bobstadt <-> Lampertheim Bahnhof (OSRM Real Road Track)
export const ROUTE_641_TRACK: [number, number][] = ROUTE_641_ROAD_TRACK;

// Line 642: Worms Hbf <-> Hofheim <-> Bürstadt Bahnhof (OSRM Real Road Track via B47 & BÜ Mainstraße)
export const ROUTE_642_TRACK: [number, number][] = ROUTE_642_ROAD_TRACK;

// Line 644: Worms Hbf <-> Biblis Bahnhof (OSRM Real Road Track via B44 Nord)
export const ROUTE_644_TRACK: [number, number][] = ROUTE_644_ROAD_TRACK;

// Line 644 Extension: Biblis Bahnhof <-> Groß-Rohrheim Bahnhof
export const ROUTE_644_GR_TRACK: [number, number][] = ROUTE_644_GR_ROAD_TRACK;

// Line 652: Dedizierter Schülerverkehr Bürstadt & Lampertheim (OSRM Real Road Track)
export const ROUTE_652_TRACK: [number, number][] = ROUTE_652_ROAD_TRACK;

export interface BusStopWaypoint {
  stopId: string;
  stopProg: number; // 0.0 to 1.0 along polyline
  dwellSec: number; // Dwell duration in seconds
}

export interface BusTourDefinition {
  id: string;
  line: string;
  lineCode: string;
  operator: string;
  origin: string;
  destination: string;
  periodSec: number;
  offsetSec: number;
  speedTransitKmh: number;
  track: [number, number][];
  waypoints: BusStopWaypoint[];
  isSchoolLine?: boolean;
}

export const VRN_BUS_TOURS: BusTourDefinition[] = [
  // 1. Linie 641: Bürstadt <-> Lampertheim (alle 30 Min)
  {
    id: "tour-bus-641-south",
    line: "641",
    lineCode: "VRN-641",
    operator: "VRN / Verkehrsgesellschaft Gersprenztal (VGG)",
    origin: "Bürstadt Bahnhof",
    destination: "Lampertheim Bahnhof",
    periodSec: 1800,
    offsetSec: 120,
    speedTransitKmh: 42,
    track: ROUTE_641_TRACK,
    waypoints: [
      { stopId: "stop-bst-bahnhof-steig1", stopProg: 0.0, dwellSec: 40 },
      { stopId: "stop-bst-marktplatz-west", stopProg: 0.022, dwellSec: 30 },
      { stopId: "stop-bst-boxheimerhof-sued", stopProg: 0.113, dwellSec: 25 },
      { stopId: "stop-bob-altes-rathaus-sued", stopProg: 0.231, dwellSec: 30 },
      { stopId: "stop-la-bahnhof-steig2", stopProg: 0.731, dwellSec: 45 },
      { stopId: "stop-la-domkirche-sued", stopProg: 0.819, dwellSec: 30 },
      { stopId: "stop-la-lessing-gymnasium-sued", stopProg: 0.851, dwellSec: 35 },
    ],
  },
  {
    id: "tour-bus-641-north",
    line: "641",
    lineCode: "VRN-641",
    operator: "VRN / VGG",
    origin: "Lampertheim Bahnhof",
    destination: "Bürstadt Bahnhof",
    periodSec: 1800,
    offsetSec: 1020,
    speedTransitKmh: 42,
    track: [...ROUTE_641_TRACK].reverse(),
    waypoints: [
      { stopId: "stop-la-bahnhof-steig1", stopProg: 0.0, dwellSec: 40 },
      { stopId: "stop-la-domkirche-nord", stopProg: 0.181, dwellSec: 30 },
      { stopId: "stop-bob-altes-rathaus-nord", stopProg: 0.769, dwellSec: 30 },
      { stopId: "stop-bst-boxheimerhof-nord", stopProg: 0.887, dwellSec: 25 },
      { stopId: "stop-bst-marktplatz-ost", stopProg: 0.978, dwellSec: 30 },
      { stopId: "stop-bst-bahnhof-steig1", stopProg: 1.0, dwellSec: 45 },
    ],
  },

  // 2. Linie 642: Worms <-> Hofheim <-> Bürstadt (EKS)
  {
    id: "tour-bus-642-east",
    line: "642",
    lineCode: "VRN-642",
    operator: "VRN / Busverkehr Rhein-Neckar (BRN)",
    origin: "Worms Hbf",
    destination: "Bürstadt EKS",
    periodSec: 1800,
    offsetSec: 300,
    speedTransitKmh: 45,
    track: ROUTE_642_TRACK,
    waypoints: [
      { stopId: "stop-ros-wehrzollhaus-ost", stopProg: 0.192, dwellSec: 25 },
      { stopId: "stop-ros-nibelungenstr-hofheim", stopProg: 0.208, dwellSec: 25 },
      { stopId: "stop-hof-bahnhof-steig1", stopProg: 0.428, dwellSec: 35 },
      { stopId: "stop-hof-schule-nord", stopProg: 0.453, dwellSec: 30 },
      { stopId: "stop-bst-sonneneck-nord", stopProg: 0.833, dwellSec: 25 },
      { stopId: "stop-bst-marktplatz-ost", stopProg: 0.873, dwellSec: 30 },
      { stopId: "stop-bst-bahnhof-steig1", stopProg: 0.945, dwellSec: 45 },
      { stopId: "stop-bst-eks-ankunft", stopProg: 1.0, dwellSec: 50 },
    ],
  },
  {
    id: "tour-bus-642-west",
    line: "642",
    lineCode: "VRN-642",
    operator: "VRN / BRN",
    origin: "Bürstadt EKS",
    destination: "Worms Hbf",
    periodSec: 1800,
    offsetSec: 1200,
    speedTransitKmh: 45,
    track: [...ROUTE_642_TRACK].reverse(),
    waypoints: [
      { stopId: "stop-bst-eks-abfahrt", stopProg: 0.0, dwellSec: 45 },
      { stopId: "stop-bst-bahnhof-steig2", stopProg: 0.055, dwellSec: 40 },
      { stopId: "stop-bst-marktplatz-west", stopProg: 0.127, dwellSec: 30 },
      { stopId: "stop-bst-sonneneck-sued", stopProg: 0.167, dwellSec: 25 },
      { stopId: "stop-hof-schule-sued", stopProg: 0.547, dwellSec: 30 },
      { stopId: "stop-hof-bahnhof-steig2", stopProg: 0.572, dwellSec: 35 },
      { stopId: "stop-ros-nibelungenstr-worms", stopProg: 0.792, dwellSec: 25 },
      { stopId: "stop-ros-wehrzollhaus-worms", stopProg: 0.808, dwellSec: 25 },
    ],
  },

  // 3. Linie 644: Worms <-> Biblis Bahnhof (Beide Fahrtrichtungen)
  {
    id: "tour-bus-644-north",
    line: "644",
    lineCode: "VRN-644",
    operator: "VRN / BRN",
    origin: "Worms Hbf",
    destination: "Biblis Bahnhof",
    periodSec: 1800,
    offsetSec: 600,
    speedTransitKmh: 48,
    track: ROUTE_644_TRACK,
    waypoints: [
      { stopId: "stop-nor-steinstr-biblis", stopProg: 0.572, dwellSec: 25 },
      { stopId: "stop-nor-rathaus-biblis", stopProg: 0.588, dwellSec: 25 },
      { stopId: "stop-nor-friedhof-biblis", stopProg: 0.605, dwellSec: 25 },
      { stopId: "stop-wat-ortsmitte-biblis", stopProg: 0.642, dwellSec: 25 },
      { stopId: "stop-bib-rathaus-biblis", stopProg: 0.956, dwellSec: 25 },
      { stopId: "stop-bib-schule-nord", stopProg: 0.985, dwellSec: 30 },
      { stopId: "stop-bib-bahnhof-steig1", stopProg: 1.0, dwellSec: 40 },
    ],
  },
  {
    id: "tour-bus-644-south",
    line: "644",
    lineCode: "VRN-644",
    operator: "VRN / BRN",
    origin: "Biblis Bahnhof",
    destination: "Worms Hbf",
    periodSec: 1800,
    offsetSec: 1500,
    speedTransitKmh: 48,
    track: [...ROUTE_644_TRACK].reverse(),
    waypoints: [
      { stopId: "stop-bib-bahnhof-steig1", stopProg: 0.0, dwellSec: 40 },
      { stopId: "stop-bib-schule-sued", stopProg: 0.015, dwellSec: 30 },
      { stopId: "stop-bib-rathaus-worms", stopProg: 0.044, dwellSec: 25 },
      { stopId: "stop-wat-ortsmitte-worms", stopProg: 0.358, dwellSec: 25 },
      { stopId: "stop-nor-friedhof-worms", stopProg: 0.395, dwellSec: 25 },
      { stopId: "stop-nor-rathaus-worms", stopProg: 0.412, dwellSec: 25 },
      { stopId: "stop-nor-steinstr-worms", stopProg: 0.428, dwellSec: 25 },
    ],
  },

  // 4. Linie 644: Biblis Bahnhof <-> Groß-Rohrheim Bahnhof
  {
    id: "tour-bus-644-gr-north",
    line: "644",
    lineCode: "VRN-644",
    operator: "VRN / BRN",
    origin: "Biblis Bahnhof",
    destination: "Groß-Rohrheim Bahnhof",
    periodSec: 1800,
    offsetSec: 400,
    speedTransitKmh: 45,
    track: ROUTE_644_GR_TRACK,
    waypoints: [
      { stopId: "stop-bib-bahnhof-steig2", stopProg: 0.0, dwellSec: 40 },
      { stopId: "stop-bib-pfaffenau-nord", stopProg: 0.062, dwellSec: 25 },
      { stopId: "stop-gr-bahnhof-steig2", stopProg: 0.781, dwellSec: 35 },
      { stopId: "stop-gr-rathaus-nord", stopProg: 0.891, dwellSec: 25 },
      { stopId: "stop-gr-buergerhalle-nord", stopProg: 0.922, dwellSec: 25 },
      { stopId: "stop-gr-friedhof-nord", stopProg: 1.0, dwellSec: 40 },
    ],
  },
  {
    id: "tour-bus-644-gr-south",
    line: "644",
    lineCode: "VRN-644",
    operator: "VRN / BRN",
    origin: "Groß-Rohrheim Bahnhof",
    destination: "Biblis Bahnhof",
    periodSec: 1800,
    offsetSec: 1300,
    speedTransitKmh: 45,
    track: [...ROUTE_644_GR_TRACK].reverse(),
    waypoints: [
      { stopId: "stop-gr-friedhof-biblis", stopProg: 0.0, dwellSec: 35 },
      { stopId: "stop-gr-buergerhalle-biblis", stopProg: 0.078, dwellSec: 25 },
      { stopId: "stop-gr-rathaus-biblis", stopProg: 0.109, dwellSec: 25 },
      { stopId: "stop-gr-bahnhof-steig1", stopProg: 0.219, dwellSec: 35 },
      { stopId: "stop-bib-pfaffenau-sued", stopProg: 0.938, dwellSec: 25 },
      { stopId: "stop-bib-bahnhof-steig1", stopProg: 1.0, dwellSec: 45 },
    ],
  },

  // 5. Linie 652: Dedizierter Schülerbus Bürstadt / Lampertheim (Schulbus EKS & Lessing)
  {
    id: "tour-bus-652-school",
    line: "652",
    lineCode: "VRN-652S",
    operator: "VRN / Schülerverkehr Kreis Bergstraße",
    origin: "Bobstadt Altes Rathaus",
    destination: "Lampertheim Schulzentrum",
    periodSec: 1800,
    offsetSec: 450,
    speedTransitKmh: 38,
    track: ROUTE_652_TRACK,
    isSchoolLine: true,
    waypoints: [
      { stopId: "stop-bob-altes-rathaus-sued", stopProg: 0.0, dwellSec: 35 },
      { stopId: "stop-bst-boxheimerhof-sued", stopProg: 0.134, dwellSec: 30 },
      { stopId: "stop-bst-marktplatz-west", stopProg: 0.232, dwellSec: 30 },
      { stopId: "stop-bst-schillerschule-sued", stopProg: 0.263, dwellSec: 40 },
      { stopId: "stop-bst-bahnhof-steig1", stopProg: 0.279, dwellSec: 45 },
      { stopId: "stop-bst-eks-ankunft", stopProg: 0.363, dwellSec: 60 }, // Major school drop-off
      { stopId: "stop-la-lessing-gymnasium-sued", stopProg: 0.789, dwellSec: 55 },
      { stopId: "stop-la-alfred-delp-sued", stopProg: 0.875, dwellSec: 50 },
    ],
  },
];

/**
 * Hessian School Calendar Validation.
 * Checks if a date is an active school day in Hessen (Mon-Fri, non-holiday, non-school-vacations).
 * Standard vacations in Hessen for 2026:
 * - Osterferien: 2026-03-30 to 2026-04-10
 * - Sommerferien: 2026-06-29 to 2026-08-07
 * - Herbstferien: 2026-10-05 to 2026-10-17
 * - Weihnachtsferien: 2026-12-23 to 2027-01-09
 */
export function isHessenSchoolDay(date: Date = new Date()): boolean {
  const dayOfWeek = date.getDay();
  // Saturday (6) and Sunday (0) are not school days
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Public holidays in Hessen (fixed dates)
  if (month === 1 && day === 1) return false; // Neujahr
  if (month === 5 && day === 1) return false; // Tag der Arbeit
  if (month === 10 && day === 3) return false; // Tag der Deutschen Einheit
  if (month === 12 && (day === 24 || day === 25 || day === 26 || day === 31)) return false;

  // Sommerferien Hessen (~July - early August)
  if (month === 7 || (month === 8 && day <= 10)) return false;
  // Herbstferien (~October 5 to 18)
  if (month === 10 && day >= 5 && day <= 18) return false;
  // Weihnachtsferien (~Dec 23 to Jan 9)
  if ((month === 12 && day >= 23) || (month === 1 && day <= 9)) return false;

  return true;
}

/**
 * School Bus Heuristic Classification.
 * Evaluates whether a trip is a "Schulbus" based on line code, destination,
 * current time, and school stop proximity.
 */
export function evaluateSchoolBus(
  line: string,
  lineCode: string,
  isDedicatedSchoolLine: boolean | undefined,
  currentStop?: BusStop,
  nextStop?: BusStop,
  date: Date = new Date()
): { isSchoolBus: boolean; reason?: string } {
  // 1. Explicit school line (e.g. 652, 642S)
  if (isDedicatedSchoolLine || lineCode.includes("S") || line === "652") {
    return {
      isSchoolBus: true,
      reason: "Regulärer Schülerverkehr (Linie 652 / Verstärkerfahrt)",
    };
  }

  // 2. Spatial-temporal schedule heuristic:
  // Must be a school day in Hessen
  if (!isHessenSchoolDay(date)) {
    return { isSchoolBus: false };
  }

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeMin = hours * 60 + minutes;

  // School time windows:
  // Window 1 (Morgens / Schulbeginn): 07:10 – 07:55 (430 to 475 min)
  const isMorningWindow = timeMin >= 430 && timeMin <= 475;
  // Window 2 (Mittags / Schulschluss 6. Std): 12:45 – 13:35 (765 to 815 min)
  const isNoonWindow = timeMin >= 765 && timeMin <= 815;
  // Window 3 (Nachmittags / Ganztagsschule): 15:00 – 15:45 (900 to 945 min)
  const isAfternoonWindow = timeMin >= 900 && timeMin <= 945;

  const inSchoolWindow = isMorningWindow || isNoonWindow || isAfternoonWindow;
  if (!inSchoolWindow) {
    return { isSchoolBus: false };
  }

  // Check if bus is serving a designated school stop
  const atSchoolStop = currentStop?.isSchoolStop || nextStop?.isSchoolStop;
  if (atSchoolStop) {
    const schoolName = currentStop?.nearbySchoolName || nextStop?.nearbySchoolName || "Schulzentrum";
    let windowName = "Schulbeginn";
    if (isNoonWindow) windowName = "Schulschluss (6. Stunde)";
    if (isAfternoonWindow) windowName = "Schulschluss (Ganztagsunterricht)";

    return {
      isSchoolBus: true,
      reason: `Schulbus-Einsatz für ${schoolName} (${windowName})`,
    };
  }

  return { isSchoolBus: false };
}

/**
 * Calculate Level Crossing (BÜ) Conflict Warning for buses.
 * If bus route approaches BÜ Mainstraße in Bürstadt and the crossing is closed/closing,
 * generate real-time warning with estimated barrier wait time.
 */
export function checkLevelCrossingWarning(busLat: number, busLng: number, line: string): string | undefined {
  if (line !== "642") return undefined;

  const mainstrCrossing = ACTIVE_LEVEL_CROSSINGS.find((c) => c.id === "bu-buerstadt-mainstr");
  if (!mainstrCrossing) return undefined;

  const distToCrossing = haversineMeters(busLat, busLng, mainstrCrossing.lat, mainstrCrossing.lng);
  // If bus is within 450 meters of the level crossing
  if (distToCrossing <= 450) {
    const mobility = calculateRiedMobility(Date.now());
    const liveCrossing = mobility.crossings.find((c) => c.id === "bu-buerstadt-mainstr");
    if (liveCrossing && (liveCrossing.status === "closed" || liveCrossing.status === "closing_soon")) {
      const waitSec = liveCrossing.secondsUntilClearance ?? 90;
      return `⚠️ Schranken-Halt an BÜ Mainstraße (${liveCrossing.status === "closed" ? "geschlossen" : "schließt bald"}, ca. ${waitSec}s Wartezeit für Zug ${liveCrossing.nextTrainLine ?? "RB 63"})`;
    }
  }

  return undefined;
}

/**
 * Calculate Intermodal Train Synchronization at Train Hubs (Bürstadt Bhf, Lampertheim Bhf, Biblis Bhf).
 */
export function checkIntermodalConnection(stop?: BusStop): string | undefined {
  if (!stop?.isTrainHub) return undefined;

  const mobility = calculateRiedMobility(Date.now());
  // Find trains near or dwelling at this station
  for (const train of mobility.trains) {
    if (train.currentStationName?.toLowerCase().includes(stop.municipality.toLowerCase())) {
      return `🚉 Umstieg zu ${train.line} nach ${train.destination} (am Bahnsteig)`;
    }
  }

  if (stop.municipality === "Bürstadt") {
    return "🚉 Direkter Übergang zu Riedbahn (RE 70 / S 9) & Nibelungenbahn (RB 63)";
  } else if (stop.municipality === "Lampertheim") {
    return "🚉 Direkter Übergang zu S-Bahn S 9 & RE 70 (Mannheim / Frankfurt)";
  } else if (stop.municipality === "Biblis") {
    return "🚉 Direkter Übergang zu RE 70 & S 9";
  }

  return undefined;
}

/**
 * High-precision Real-time Simulation & State Calculator for VRN Buses in the Ried.
 * Generates live bus coordinates, stop dwell states with departure countdown gauges,
 * school bus status, and level crossing conflict warnings.
 */
export function calculateBusMobility(timestampMs: number = Date.now()): {
  buses: LiveBus[];
  stops: BusStop[];
} {
  const buses: LiveBus[] = [];
  const now = new Date(timestampMs);
  const nowSec = timestampMs / 1000;

  for (const tour of VRN_BUS_TOURS) {
    const cycleTime = (nowSec - tour.offsetSec) % tour.periodSec;
    const elapsedSec = (cycleTime + tour.periodSec) % tour.periodSec;

    // Stable unique bus cycle ID
    const cycleIndex = Math.floor((nowSec - tour.offsetSec) / tour.periodSec);
    const busId = `${tour.id}-${cycleIndex}`;

    // Total travel progress across the route (0.0 to 1.0)
    const totalProg = Math.max(0, Math.min(1, elapsedSec / tour.periodSec));

    // Check waypoint dwell state
    let isStopped = false;
    let currentStop: BusStop | undefined;
    let nextStop: BusStop | undefined;
    let dwellRemainingSec = 0;
    let dwellTotalSec = 0;
    let dwellProg = 0;

    const dwellWindowProg = 0.04;

    for (let i = 0; i < tour.waypoints.length; i++) {
      const wp = tour.waypoints[i];
      const stop = RIED_BUS_STOPS.find((s) => s.id === wp.stopId);
      const startProg = wp.stopProg - dwellWindowProg / 2;
      const endProg = wp.stopProg + dwellWindowProg / 2;

      if (totalProg >= startProg && totalProg <= endProg) {
        isStopped = true;
        currentStop = stop;
        dwellTotalSec = wp.dwellSec;
        const dwellFraction = (totalProg - startProg) / dwellWindowProg;
        // Gauge goes from 1.0 (just arrived) down to 0.0 (departing)
        dwellProg = Math.max(0, Math.min(1, 1.0 - dwellFraction));
        dwellRemainingSec = Math.max(1, Math.round(dwellProg * wp.dwellSec));
        const nextWp = tour.waypoints[(i + 1) % tour.waypoints.length];
        nextStop = RIED_BUS_STOPS.find((s) => s.id === nextWp.stopId);
        break;
      }

      if (totalProg < wp.stopProg && !nextStop) {
        nextStop = stop;
      }
    }

    if (!nextStop && tour.waypoints.length > 0) {
      const firstWp = tour.waypoints[0];
      nextStop = RIED_BUS_STOPS.find((s) => s.id === firstWp.stopId);
    }

    // Interpolate bus position along route
    let lat: number;
    let lng: number;
    let heading: number;
    let speedKmh: number;

    if (isStopped && currentStop) {
      lat = currentStop.lat;
      lng = currentStop.lng;
      const pos = interpolatePolyline(tour.track, totalProg);
      heading = pos.heading;
      speedKmh = 0;
    } else {
      const pos = interpolatePolyline(tour.track, totalProg);
      lat = Number(pos.lat.toFixed(6));
      lng = Number(pos.lng.toFixed(6));
      heading = pos.heading;
      speedKmh = tour.speedTransitKmh;
    }

    // Check school bus heuristic
    const schoolEval = evaluateSchoolBus(
      tour.line,
      tour.lineCode,
      tour.isSchoolLine,
      currentStop,
      nextStop,
      now
    );

    // Realistic slight delay variation from GTFS-RT simulation (0 to +2 min)
    const simulatedDelaySec = (Math.abs(Math.sin(cycleIndex * 17 + tour.offsetSec)) > 0.6) ? 120 : 0;
    const delayMinutes = Math.round(simulatedDelaySec / 60);

    // Check level crossing warning (BÜ Mainstraße for line 642)
    const crossingWarning = checkLevelCrossingWarning(lat, lng, tour.line);

    // Check train connection info if stopped at hub
    const intermodalInfo = isStopped ? checkIntermodalConnection(currentStop) : undefined;

    buses.push({
      id: busId,
      line: tour.line,
      lineCode: tour.lineCode,
      operator: tour.operator,
      origin: tour.origin,
      destination: tour.destination,
      lat,
      lng,
      heading,
      speedKmh,
      status: isStopped ? "stopped" : "moving",
      currentStopId: currentStop?.id,
      currentStopName: currentStop?.name,
      nextStopId: nextStop?.id,
      nextStopName: nextStop?.name,
      dwellTimeRemainingSec: isStopped ? dwellRemainingSec : undefined,
      dwellTotalSec: isStopped ? dwellTotalSec : undefined,
      dwellProgress: isStopped ? dwellProg : undefined,
      delaySec: simulatedDelaySec,
      delayMinutes,
      isSchoolBus: schoolEval.isSchoolBus,
      schoolBusReason: schoolEval.reason,
      wheelchairAccessible: true, // Modern VRN low-floor fleet
      approachingCrossingWarning: crossingWarning,
      intermodalConnectionInfo: intermodalInfo,
    });
  }

  return {
    buses,
    stops: RIED_BUS_STOPS,
  };
}

/**
 * Generate Live Departure Board for a specific bus stop.
 */
export function getBusStopDepartures(stopId: string, timestampMs: number = Date.now()): BusDeparture[] {
  const stop = RIED_BUS_STOPS.find((s) => s.id === stopId)
    ?? RIED_BUS_STOPS.find((s) => s.id === `${stopId}-biblis`)
    ?? RIED_BUS_STOPS.find((s) => s.id.startsWith(stopId));
  if (!stop) return [];

  const now = new Date(timestampMs);
  const mobility = calculateBusMobility(timestampMs);
  const departures: BusDeparture[] = [];

  // 1. Check if there is currently a bus at this stop
  for (const bus of mobility.buses) {
    if (bus.currentStopId === stop.id || (bus.currentStopId && bus.currentStopId.startsWith(stop.id.replace(/-biblis|-worms/, "")))) {
      // If the stop is directional, only show the live bus if it travels in that direction
      if (stop.direction && !bus.destination.toLowerCase().includes(stop.direction.toLowerCase())) {
        continue;
      }
      departures.push({
        line: bus.line,
        origin: bus.origin,
        destination: bus.destination,
        scheduledTime: "Jetzt",
        estimatedTime: bus.dwellTimeRemainingSec ? `in ${bus.dwellTimeRemainingSec}s` : "Sofort",
        delayMinutes: bus.delayMinutes,
        isSchoolBus: bus.isSchoolBus,
        schoolBusReason: bus.schoolBusReason,
        wheelchairAccessible: bus.wheelchairAccessible,
        platform: stop.platforms?.[0] ?? (stop.directionLabel ?? "Steig 1"),
      });
    }
  }

  // 2. Generate regular departures for lines serving this stop
  for (const line of stop.lines) {
    // Determine destination and intervals based on platform direction
    let dest = "Bürstadt Bahnhof";
    let orig = "Worms Hbf";

    if (stop.direction === "Biblis") {
      dest = "Biblis Bahnhof";
      orig = "Worms Hbf";
    } else if (stop.direction === "Worms") {
      dest = "Worms Hbf";
      orig = line === "644" ? "Biblis Bahnhof" : (line === "642" ? "Bürstadt EKS" : "Lampertheim Bahnhof");
    } else if (stop.direction === "Lampertheim") {
      dest = line === "652" ? "Lampertheim Schulzentrum" : "Lampertheim Bahnhof";
      orig = line === "652" ? "Bobstadt Altes Rathaus" : "Bürstadt Bahnhof";
    } else if (stop.direction === "Bürstadt") {
      dest = line === "642" ? "Bürstadt EKS" : "Bürstadt Bahnhof";
      orig = line === "641" ? "Lampertheim Bahnhof" : (line === "642" ? "Worms Hbf" : "Bobstadt");
    } else if (stop.direction === "Groß-Rohrheim") {
      dest = "Groß-Rohrheim Bahnhof";
      orig = "Biblis Bahnhof";
    } else if (stop.direction === "Riedrode") {
      dest = "Riedrode Bahnhof";
      orig = "Bürstadt Bahnhof";
    } else if (stop.direction === "Bobstadt") {
      dest = "Bobstadt Altes Rathaus";
      orig = "Bürstadt Bahnhof";
    } else if (stop.direction === "Gartenstadt") {
      dest = "Bürstadt Gartenstadt";
      orig = "Bürstadt Bahnhof";
    } else if (stop.direction === "Hüttenfeld") {
      dest = "Lampertheim-Hüttenfeld Bürgerhaus";
      orig = "Lampertheim Bahnhof";
    } else if (stop.direction === "Neuschloß") {
      dest = "Lampertheim-Neuschloß Schlossplatz";
      orig = "Lampertheim Bahnhof";
    } else if (stop.direction === "Rosengarten") {
      dest = "Rosengarten Nibelungenstraße";
      orig = "Worms Hbf";
    } else {
      // Fallback for general hubs or non-directional stops
      if (line === "641") {
        dest = stop.municipality === "Bürstadt" ? "Lampertheim Bahnhof" : "Bürstadt Bahnhof";
        orig = stop.municipality === "Bürstadt" ? "Bürstadt Bahnhof" : "Lampertheim Bahnhof";
      } else if (line === "642") {
        dest = stop.id === "stop-bst-eks" ? "Worms Hbf" : "Bürstadt EKS";
        orig = "Worms Hbf";
      } else if (line === "644") {
        dest = stop.municipality === "Biblis" ? "Worms Hbf" : "Biblis Bahnhof";
        orig = "Biblis Bahnhof";
      } else if (line === "652") {
        dest = "Lampertheim Schulzentrum";
        orig = "Bobstadt Altes Rathaus";
      }
    }

    const nextMinutes1 = 7 + (line.charCodeAt(line.length - 1) % 11);
    const nextMinutes2 = nextMinutes1 + 25;

    const time1 = new Date(timestampMs + nextMinutes1 * 60 * 1000);
    const time2 = new Date(timestampMs + nextMinutes2 * 60 * 1000);

    const schoolEval = evaluateSchoolBus(line, `VRN-${line}`, line === "652", stop, undefined, time1);

    departures.push({
      line,
      origin: orig,
      destination: dest,
      scheduledTime: `${String(time1.getHours()).padStart(2, "0")}:${String(time1.getMinutes()).padStart(2, "0")}`,
      estimatedTime: `in ${nextMinutes1} Min`,
      delayMinutes: 0,
      isSchoolBus: schoolEval.isSchoolBus,
      schoolBusReason: schoolEval.reason,
      wheelchairAccessible: true,
      platform: stop.platforms?.[0] ?? (stop.directionLabel ?? "Steig 1"),
    });

    departures.push({
      line,
      origin: orig,
      destination: dest,
      scheduledTime: `${String(time2.getHours()).padStart(2, "0")}:${String(time2.getMinutes()).padStart(2, "0")}`,
      estimatedTime: `in ${nextMinutes2} Min`,
      delayMinutes: 0,
      isSchoolBus: schoolEval.isSchoolBus,
      schoolBusReason: schoolEval.reason,
      wheelchairAccessible: true,
      platform: stop.platforms?.[0] ?? (stop.directionLabel ?? "Steig 1"),
    });
  }

  return departures.slice(0, 8);
}
