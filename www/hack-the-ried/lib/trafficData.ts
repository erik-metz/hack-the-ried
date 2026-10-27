/**
 * Traffic Jam (Stau) data models, corridors and road geometries for the Hessian Ried.
 * Covers Autobahnen (A67, A5, A6) and primary Bundesstraßen (B47, B44).
 */

export interface TrafficIncident {
  id: string;
  roadName: string;
  direction: string;
  locationFrom: string;
  locationTo: string;
  startTime: string;
  endTime?: string | null;
  lastSeenAt: string;
  isActive: boolean;
  delaySeconds: number | null;
  delayMinutes: number | null;
  lengthMeters: number;
  lengthKm: float;
  severity: "minor" | "moderate" | "major" | "standstill";
  causeType: "congestion" | "accident" | "roadwork" | "closure";
  description?: string;
  coordinates?: [number, number][]; // [[lat, lon], ...]
  source: string;
  delayKind?: "unknown" | "reported" | "estimated";
  eventStatus?: "active" | "planned" | "ended" | "resolved";
  providerStartAt?: string | null;
  providerEndAt?: string | null;
  overallEndDate?: string | null;
  closureKind?: string;
  workLengthMeters?: number | null;
  isStale?: boolean;
}

export type float = number;

export interface TrafficCorridor {
  id: string;
  roadName: string;
  name: string;
  status: "clear" | "sluggish" | "congestion" | "closure" | "unknown";
  delayMinutes: number | null;
  activeIncidentsCount: number;
  description: string;
  track: [number, number][];
  center: [number, number];
  zoom: number;
}

// 1. Precise road geometries connecting Ried hubs (Bürstadt, Lampertheim, Worms, Lorsch, Biblis)
export const CORRIDOR_A67_TRACK: [number, number][] = [
  [49.8220, 8.5830], // Darmstädter Kreuz Süd
  [49.7950, 8.5730], // AS Pfungstadt
  [49.7520, 8.5480], // AS Gernsheim
  [49.6920, 8.5580], // Kreuz Lorsch Nord
  [49.6540, 8.5660], // AS Lorsch (B47 Anbindung)
  [49.6210, 8.5650], // Hüttenfeld Ost
  [49.5780, 8.5530], // Viernheimer Dreieck (A6 Anbindung)
];

export const CORRIDOR_B47_TRACK: [number, number][] = [
  [49.6318, 8.3595], // Worms Rheinbrücke West
  [49.6350, 8.3780], // Worms Rheinbrücke Ost
  [49.6420, 8.4100], // Hofheim (Ried) Umgehung
  [49.6457, 8.4420], // Bürstadt West
  [49.6450, 8.4650], // Bürstadt Ost (Industriegebiet)
  [49.6470, 8.5020], // Riedrode
  [49.6520, 8.5450], // Lorsch West
  [49.6540, 8.5660], // Lorsch Kreuzung A67
  [49.6680, 8.6050], // Bensheim A5 Anschluss
];

export const CORRIDOR_B44_TRACK: [number, number][] = [
  [49.7350, 8.4550], // Biblis Nord
  [49.6890, 8.4520], // Groß-Rohrheim
  [49.6580, 8.4510], // Bürstadt Nord (Boxheimerhof)
  [49.6457, 8.4560], // Bürstadt Mitte
  [49.6200, 8.4600], // Bürstadt Süd / Lampertheim Nord
  [49.5960, 8.4680], // Lampertheim Mitte (Europaring)
  [49.5650, 8.4820], // Lampertheim Neuschloß / Sandtorf
  [49.5350, 8.4900], // Mannheim-Sandhofen / Blumenau
];

export const CORRIDOR_A5_TRACK: [number, number][] = [
  [49.8050, 8.6250], // Darmstadt Eberstadt
  [49.7550, 8.6280], // Seeheim-Jugenheim
  [49.7020, 8.6220], // Zwingenberg
  [49.6680, 8.6180], // Bensheim
  [49.6350, 8.6200], // Heppenheim
  [49.5850, 8.6250], // Hemsbach
  [49.5520, 8.6400], // Weinheimer Kreuz
];

export const CORRIDOR_A6_TRACK: [number, number][] = [
  [49.5780, 8.5530], // Viernheimer Dreieck
  [49.5520, 8.5020], // Mannheim-Sandhofen (A6)
  [49.5380, 8.4350], // Rheinbrücke Mannheim / Ludwigshafen
];

export const RIED_CORRIDOR_METADATA: Omit<TrafficCorridor, "status" | "delayMinutes" | "activeIncidentsCount" | "description">[] = [
  {
    id: "corridor-b47",
    roadName: "B47",
    name: "B47 (Worms Rheinbrücke ↔ Bürstadt ↔ Lorsch ↔ Bensheim)",
    track: CORRIDOR_B47_TRACK,
    center: [49.645, 8.465],
    zoom: 12,
  },
  {
    id: "corridor-b44",
    roadName: "B44",
    name: "B44 (Biblis ↔ Bürstadt ↔ Lampertheim ↔ Mannheim)",
    track: CORRIDOR_B44_TRACK,
    center: [49.610, 8.460],
    zoom: 12,
  },
  {
    id: "corridor-a67",
    roadName: "A67",
    name: "A67 (Darmstadt ↔ Lorsch ↔ Viernheim)",
    track: CORRIDOR_A67_TRACK,
    center: [49.654, 8.566],
    zoom: 12,
  },
  {
    id: "corridor-a5",
    roadName: "A5",
    name: "A5 (Darmstadt ↔ Bensheim ↔ Heppenheim ↔ Weinheim)",
    track: CORRIDOR_A5_TRACK,
    center: [49.668, 8.618],
    zoom: 12,
  },
  {
    id: "corridor-a6",
    roadName: "A6",
    name: "A6 (Viernheim ↔ Sandhofen ↔ Ludwigshafen)",
    track: CORRIDOR_A6_TRACK,
    center: [49.555, 8.510],
    zoom: 12,
  },
];

/**
 * Deterministic local simulation of traffic conditions in the Ried based on time-of-day.
 * Used when backend database is unavailable or during local development/offline mode.
 */
export function calculateLocalTraffic(nowTimestamp = Date.now()): {
  incidents: TrafficIncident[];
  corridors: TrafficCorridor[];
} {
  const date = new Date(nowTimestamp);
  const hour = date.getHours();
  const minutes = date.getMinutes();
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = day === 0 || day === 6;

  // Morning rush hour: 07:00 - 09:15
  const isMorningRush = !isWeekend && ((hour === 7 && minutes >= 15) || hour === 8 || (hour === 9 && minutes <= 15));
  // Evening rush hour: 16:00 - 18:45
  const isEveningRush = !isWeekend && (hour === 16 || hour === 17 || (hour === 18 && minutes <= 30));

  const incidents: TrafficIncident[] = [];

  // Permanent long-term roadworks on A67 around Lorsch/Viernheim
  incidents.push({
    id: "autobahn-a67-baustelle-lorsch",
    roadName: "A67",
    direction: "Darmstadt ➔ Viernheimer Dreieck",
    locationFrom: "AS Lorsch",
    locationTo: "AD Viernheim",
    startTime: new Date(nowTimestamp - 4 * 3600 * 1000).toISOString(),
    lastSeenAt: new Date(nowTimestamp).toISOString(),
    isActive: true,
    delaySeconds: isMorningRush || isEveningRush ? 720 : 180, // +12 min or +3 min
    delayMinutes: isMorningRush || isEveningRush ? 12 : 3,
    lengthMeters: 3800,
    lengthKm: 3.8,
    severity: isMorningRush || isEveningRush ? "major" : "moderate",
    causeType: isMorningRush || isEveningRush ? "congestion" : "roadwork",
    description: isMorningRush || isEveningRush
      ? "3.8 km Stau und stockender Berufsverkehr vor der Baustelle AS Lorsch"
      : "Dauerbaustelle Fahrbahnerneuerung, verengte Fahrstreifen zwischen AS Lorsch und Viernheimer Dreieck",
    coordinates: [
      [49.6540, 8.5660],
      [49.6210, 8.5650],
      [49.5780, 8.5530],
    ],
    source: "autobahn_api",
  });

  // B47 Worms Rheinbrücke bottleneck
  if (isMorningRush) {
    incidents.push({
      id: "b47-stau-rheinbruecke-worms",
      roadName: "B47",
      direction: "Bürstadt / Lampertheim ➔ Worms",
      locationFrom: "Bürstadt-West",
      locationTo: "Rheinbrücke Worms",
      startTime: new Date(nowTimestamp - 45 * 60 * 1000).toISOString(),
      lastSeenAt: new Date(nowTimestamp).toISOString(),
      isActive: true,
      delaySeconds: 900, // +15 min
      delayMinutes: 15,
      lengthMeters: 4200,
      lengthKm: 4.2,
      severity: "major",
      causeType: "congestion",
      description: "Berufsverkehr Richtung Worms: 4.2 km zähflüssiger Verkehr und Rückstau vor der Rheinbrücke",
      coordinates: [
        [49.6457, 8.4420],
        [49.6420, 8.4100],
        [49.6350, 8.3780],
        [49.6318, 8.3595],
      ],
      source: "probe",
    });
  } else if (isEveningRush) {
    incidents.push({
      id: "b47-stau-rheinbruecke-feierabend",
      roadName: "B47",
      direction: "Worms ➔ Bürstadt / Lorsch",
      locationFrom: "Rheinbrücke Worms",
      locationTo: "Bürstadt-Ost",
      startTime: new Date(nowTimestamp - 30 * 60 * 1000).toISOString(),
      lastSeenAt: new Date(nowTimestamp).toISOString(),
      isActive: true,
      delaySeconds: 660, // +11 min
      delayMinutes: 11,
      lengthMeters: 3100,
      lengthKm: 3.1,
      severity: "moderate",
      causeType: "congestion",
      description: "Feierabendverkehr aus Worms ins Ried: 3.1 km zähflüssiger Verkehr zwischen Rheinbrücke und Bürstadt",
      coordinates: [
        [49.6318, 8.3595],
        [49.6350, 8.3780],
        [49.6420, 8.4100],
        [49.6457, 8.4420],
      ],
      source: "probe",
    });
  }

  // B44 Lampertheim Europaring / Neuschloß
  if (isMorningRush) {
    incidents.push({
      id: "b44-verkehr-lampertheim-sandhofen",
      roadName: "B44",
      direction: "Lampertheim ➔ Mannheim-Sandhofen",
      locationFrom: "Lampertheim Europaring",
      locationTo: "Mannheim-Sandhofen (B44)",
      startTime: new Date(nowTimestamp - 20 * 60 * 1000).toISOString(),
      lastSeenAt: new Date(nowTimestamp).toISOString(),
      isActive: true,
      delaySeconds: 420, // +7 min
      delayMinutes: 7,
      lengthMeters: 2500,
      lengthKm: 2.5,
      severity: "moderate",
      causeType: "congestion",
      description: "Zähflüssiger Berufsverkehr Richtung Mannheim-Sandhofen",
      coordinates: [
        [49.5960, 8.4680],
        [49.5650, 8.4820],
        [49.5350, 8.4900],
      ],
      source: "probe",
    });
  }

  // Assemble corridor summaries
  const corridors: TrafficCorridor[] = RIED_CORRIDOR_METADATA.map((meta) => {
    const active = incidents.filter((i) => i.roadName.toUpperCase() === meta.roadName.toUpperCase());
    const count = active.length;
    const maxDelaySec = Math.max(0, ...active.map((i) => i.delaySeconds ?? 0));
    const delayMin = Math.round(maxDelaySec / 60);

    let status: TrafficCorridor["status"] = "clear";
    let desc = "Freie Fahrt ohne Behinderungen";

    if (active.some((i) => i.severity === "standstill" || i.causeType === "closure")) {
      status = "closure";
      desc = "Vollsperrung oder Stillstand gemeldet";
    } else if (delayMin >= 10 || active.some((i) => i.severity === "major")) {
      status = "congestion";
      desc = `Stau (+${delayMin} Min. Zeitverlust)`;
    } else if (delayMin >= 4 || count > 0) {
      status = "sluggish";
      desc = `Zähflüssig (+${delayMin} Min. Verzögerung)`;
    }

    return {
      ...meta,
      status,
      delayMinutes: delayMin,
      activeIncidentsCount: count,
      description: desc,
    };
  });

  return { incidents, corridors };
}
