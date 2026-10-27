import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../lib/roadRoutesData.json"), "utf8"));

const code = `/**
 * Real road driving route tracks for the Hessian Ried.
 * Generated from OpenStreetMap road geometries via OSRM.
 *
 * Each polyline consists of high-density coordinates [lat, lng]
 * tracing physical streets, highways (B47, B44, L3110, L3111, L3411),
 * and municipal road networks.
 */

// 1. Bus Route Tracks
export const ROUTE_641_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.buses.route_641.track)};

export const ROUTE_642_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.buses.route_642.track)};

export const ROUTE_644_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.buses.route_644.track)};

export const ROUTE_652_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.buses.route_652.track)};

export const ROUTE_644_GR_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.buses.route_644_gr.track)};

// 2. Waste Truck Route Tracks (ZAKB)
export const ROUTE_BUERSTADT_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.wasteTrucks.route_buerstadt.track)};

export const ROUTE_LAMPERTHEIM_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.wasteTrucks.route_lampertheim.track)};

export const ROUTE_HOFHEIM_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.wasteTrucks.route_hofheim.track)};

export const ROUTE_BIBLIS_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.wasteTrucks.route_biblis.track)};

export const ROUTE_ROSENGARTEN_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.wasteTrucks.route_rosengarten.track)};

export const ROUTE_NORDHEIM_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.wasteTrucks.route_nordheim.track)};

export const ROUTE_GROSS_ROHRHEIM_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.wasteTrucks.route_gross_rohrheim.track)};

export const ROUTE_UMWELTMOBIL_ROAD_TRACK: [number, number][] = ${JSON.stringify(data.wasteTrucks.route_umweltmobil.track)};

// 3. Metadata for Map Route Overlays
export interface RouteOverlayDefinition {
  id: string;
  name: string;
  category: "bus" | "waste";
  color: string;
  weight: number;
  opacity: number;
  dashArray?: string;
  track: [number, number][];
}

export const BUS_ROUTE_OVERLAYS: RouteOverlayDefinition[] = [
  {
    id: "route-overlay-bus-641",
    name: "VRN Linie 641: Bürstadt ↔ Lampertheim",
    category: "bus",
    color: "#0284c7",
    weight: 3.5,
    opacity: 0.65,
    track: ROUTE_641_ROAD_TRACK,
  },
  {
    id: "route-overlay-bus-642",
    name: "VRN Linie 642: Worms ↔ Hofheim ↔ Bürstadt",
    category: "bus",
    color: "#0ea5e9",
    weight: 3.5,
    opacity: 0.65,
    track: ROUTE_642_ROAD_TRACK,
  },
  {
    id: "route-overlay-bus-644",
    name: "VRN Linie 644: Worms ↔ Hofheim ↔ Biblis",
    category: "bus",
    color: "#38bdf8",
    weight: 3.5,
    opacity: 0.65,
    track: ROUTE_644_ROAD_TRACK,
  },
  {
    id: "route-overlay-bus-644-gr",
    name: "VRN Linie 644: Biblis ↔ Groß-Rohrheim",
    category: "bus",
    color: "#0284c7",
    weight: 3.5,
    opacity: 0.65,
    track: ROUTE_644_GR_ROAD_TRACK,
  },
  {
    id: "route-overlay-bus-652",
    name: "VRN Linie 652: Schülerbus Bürstadt ↔ Lampertheim",
    category: "bus",
    color: "#f59e0b",
    weight: 3.5,
    opacity: 0.75,
    dashArray: "6, 6",
    track: ROUTE_652_ROAD_TRACK,
  },
];

export const WASTE_TRUCK_ROUTE_OVERLAYS: RouteOverlayDefinition[] = [
  {
    id: "route-overlay-truck-bst",
    name: "ZAKB Tour B1: Bürstadt (Restmüll)",
    category: "waste",
    color: "#64748b",
    weight: 3,
    opacity: 0.6,
    dashArray: "4, 6",
    track: ROUTE_BUERSTADT_ROAD_TRACK,
  },
  {
    id: "route-overlay-truck-la",
    name: "ZAKB Tour L2: Lampertheim (Biomüll)",
    category: "waste",
    color: "#16a34a",
    weight: 3,
    opacity: 0.6,
    dashArray: "4, 6",
    track: ROUTE_LAMPERTHEIM_ROAD_TRACK,
  },
  {
    id: "route-overlay-truck-hof",
    name: "ZAKB Tour H1: Hofheim (Gelber Sack)",
    category: "waste",
    color: "#eab308",
    weight: 3,
    opacity: 0.6,
    dashArray: "4, 6",
    track: ROUTE_HOFHEIM_ROAD_TRACK,
  },
  {
    id: "route-overlay-truck-bib",
    name: "ZAKB Tour BI1: Biblis & Wattenheim (Altpapier)",
    category: "waste",
    color: "#2563eb",
    weight: 3,
    opacity: 0.6,
    dashArray: "4, 6",
    track: ROUTE_BIBLIS_ROAD_TRACK,
  },
  {
    id: "route-overlay-truck-ros",
    name: "ZAKB Tour RO1: Rosengarten (Biomüll)",
    category: "waste",
    color: "#16a34a",
    weight: 3,
    opacity: 0.6,
    dashArray: "4, 6",
    track: ROUTE_ROSENGARTEN_ROAD_TRACK,
  },
  {
    id: "route-overlay-truck-nor",
    name: "ZAKB Tour NO1: Nordheim (Restmüll)",
    category: "waste",
    color: "#64748b",
    weight: 3,
    opacity: 0.6,
    dashArray: "4, 6",
    track: ROUTE_NORDHEIM_ROAD_TRACK,
  },
  {
    id: "route-overlay-truck-gr",
    name: "ZAKB Tour GR1: Groß-Rohrheim (Gelber Sack)",
    category: "waste",
    color: "#eab308",
    weight: 3,
    opacity: 0.6,
    dashArray: "4, 6",
    track: ROUTE_GROSS_ROHRHEIM_ROAD_TRACK,
  },
  {
    id: "route-overlay-truck-umw",
    name: "ZAKB Tour UMW: Umweltmobil Ried-Route",
    category: "waste",
    color: "#9333ea",
    weight: 3,
    opacity: 0.6,
    dashArray: "4, 6",
    track: ROUTE_UMWELTMOBIL_ROAD_TRACK,
  },
];
`;

fs.writeFileSync(path.join(__dirname, "../lib/roadRoutes.ts"), code, "utf8");
console.log("Successfully generated lib/roadRoutes.ts!");
