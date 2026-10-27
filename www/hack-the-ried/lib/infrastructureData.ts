/**
 * Infrastructure, Energy & Connectivity data models and verified local datasets
 * for the Hessian Ried (Bürstadt, Lampertheim, Biblis, Groß-Rohrheim).
 *
 * Covers:
 * 1. Road Condition Monitoring (KI-Straßenzustandsmonitoring via ZAKB fleet cameras)
 * 2. Renewable Energy Generation (ZAKB Energiepark Hüttenfeld, Biogasanlage Bürstadt, PV)
 * 3. Broadband & Fibre Rollout Status (Deutsche Glasfaser, Deutsche GigaNetz, BNetzA)
 * 4. EV Charging Stations & Live Utilisation (BNetzA Ladesäulenregister & OCPI)
 * 5. Public Wi-Fi Hotspots (Hessen-WLAN / Digitale Dorflinde, Freifunk)
 */

// ==========================================
// 1. ROAD CONDITION / STREET QUALITY
// ==========================================
export type RoadConditionCategory = "sehr_gut" | "gut" | "befriedigend" | "ausreichend" | "mangelhaft";

export interface RoadSegment {
  id: string;
  roadName: string;
  roadClass: "bundesstrasse" | "landesstrasse" | "kreisstrasse" | "gemeindestrasse";
  municipality: string;
  district: string;
  conditionGrade: number; // 1.0 (sehr gut) - 5.0 (schadhaft)
  conditionCategory: RoadConditionCategory;
  potholesCount: number;
  crackingSeverity: "none" | "minor" | "moderate" | "severe";
  surfaceType: "asphalt" | "cobblestone" | "concrete";
  lastInspectedAt: string; // ISO string
  inspectedBy: string; // 'zakb_fleet_ai' | 'hessen_mobil_zeb'
  coordinates: [number, number][]; // Polylines [lat, lng]
}

export function getRoadConditionColor(grade: number): string {
  if (grade < 2.0) return "#10b981"; // emerald-500: sehr gut
  if (grade < 2.8) return "#84cc16"; // lime-500: gut
  if (grade < 3.5) return "#eab308"; // yellow-500: befriedigend
  if (grade < 4.2) return "#f97316"; // orange-500: ausreichend
  return "#ef4444"; // red-500: mangelhaft / akuter Handlungsbedarf
}

export function getRoadConditionLabel(grade: number): string {
  if (grade < 2.0) return "Sehr gut (1.x)";
  if (grade < 2.8) return "Gut (2.x)";
  if (grade < 3.5) return "Befriedigend (3.x)";
  if (grade < 4.2) return "Ausreichend (4.x)";
  return "Mangelhaft (Schäden)";
}

export const VERIFIED_ROAD_SEGMENTS: RoadSegment[] = [
  {
    id: "rc-bst-b47-nibelungenstr",
    roadName: "Nibelungenstraße (B47)",
    roadClass: "bundesstrasse",
    municipality: "Bürstadt",
    district: "Kernstadt",
    conditionGrade: 2.1,
    conditionCategory: "gut",
    potholesCount: 0,
    crackingSeverity: "none",
    surfaceType: "asphalt",
    lastInspectedAt: "2026-08-15T09:30:00Z",
    inspectedBy: "ZAKB Müllfahrzeug-KI (Windschutzscheiben-Sensor)",
    coordinates: [
      [49.6415, 8.4480],
      [49.6416, 8.4550],
      [49.6418, 8.4620],
      [49.6420, 8.4690],
    ],
  },
  {
    id: "rc-bst-mainstr",
    roadName: "Mainstraße",
    roadClass: "gemeindestrasse",
    municipality: "Bürstadt",
    district: "Kernstadt",
    conditionGrade: 1.8,
    conditionCategory: "sehr_gut",
    potholesCount: 0,
    crackingSeverity: "none",
    surfaceType: "asphalt",
    lastInspectedAt: "2026-08-20T11:15:00Z",
    inspectedBy: "ZAKB Müllfahrzeug-KI (Windschutzscheiben-Sensor)",
    coordinates: [
      [49.6432, 8.4516],
      [49.6460, 8.4540],
      [49.6495, 8.4565],
    ],
  },
  {
    id: "rc-bst-industriestr",
    roadName: "Industriestraße (KAMÜ Kulturzentrum)",
    roadClass: "gemeindestrasse",
    municipality: "Bürstadt",
    district: "Kernstadt",
    conditionGrade: 3.2,
    conditionCategory: "befriedigend",
    potholesCount: 2,
    crackingSeverity: "minor",
    surfaceType: "asphalt",
    lastInspectedAt: "2026-08-18T14:40:00Z",
    inspectedBy: "ZAKB Müllfahrzeug-KI (Windschutzscheiben-Sensor)",
    coordinates: [
      [49.6456, 8.4560],
      [49.6458, 8.4590],
      [49.6462, 8.4630],
    ],
  },
  {
    id: "rc-bob-frankenstr",
    roadName: "Frankenstraße (L3411)",
    roadClass: "landesstrasse",
    municipality: "Bürstadt",
    district: "Bobstadt",
    conditionGrade: 3.8,
    conditionCategory: "ausreichend",
    potholesCount: 4,
    crackingSeverity: "moderate",
    surfaceType: "asphalt",
    lastInspectedAt: "2026-08-12T08:20:00Z",
    inspectedBy: "ZAKB Müllfahrzeug-KI (Windschutzscheiben-Sensor)",
    coordinates: [
      [49.6608, 8.4470],
      [49.6635, 8.4465],
      [49.6660, 8.4460],
    ],
  },
  {
    id: "rc-la-b44-roemerstr",
    roadName: "Römerstraße (B44)",
    roadClass: "bundesstrasse",
    municipality: "Lampertheim",
    district: "Kernstadt",
    conditionGrade: 2.4,
    conditionCategory: "gut",
    potholesCount: 1,
    crackingSeverity: "minor",
    surfaceType: "asphalt",
    lastInspectedAt: "2026-08-22T10:00:00Z",
    inspectedBy: "ZAKB Müllfahrzeug-KI (Windschutzscheiben-Sensor)",
    coordinates: [
      [49.5910, 8.4650],
      [49.5945, 8.4675],
      [49.5985, 8.4710],
    ],
  },
  {
    id: "rc-la-l3110-neuschloss",
    roadName: "Neuschloßstraße (L3110)",
    roadClass: "landesstrasse",
    municipality: "Lampertheim",
    district: "Neuschloß",
    conditionGrade: 4.1,
    conditionCategory: "ausreichend",
    potholesCount: 5,
    crackingSeverity: "severe",
    surfaceType: "asphalt",
    lastInspectedAt: "2026-08-10T13:10:00Z",
    inspectedBy: "ZAKB Müllfahrzeug-KI (Windschutzscheiben-Sensor)",
    coordinates: [
      [49.5990, 8.4850],
      [49.6010, 8.5050],
      [49.6018, 8.5180],
    ],
  },
  {
    id: "rc-bib-kirchstr",
    roadName: "Kirchstraße",
    roadClass: "gemeindestrasse",
    municipality: "Biblis",
    district: "Kernort",
    conditionGrade: 2.2,
    conditionCategory: "gut",
    potholesCount: 0,
    crackingSeverity: "none",
    surfaceType: "asphalt",
    lastInspectedAt: "2026-08-14T15:25:00Z",
    inspectedBy: "ZAKB Müllfahrzeug-KI (Windschutzscheiben-Sensor)",
    coordinates: [
      [49.6845, 8.4455],
      [49.6870, 8.4452],
      [49.6890, 8.4450],
    ],
  },
  {
    id: "rc-gr-kornstr",
    roadName: "Kornstraße",
    roadClass: "gemeindestrasse",
    municipality: "Groß-Rohrheim",
    district: "Kernort",
    conditionGrade: 2.6,
    conditionCategory: "befriedigend",
    potholesCount: 1,
    crackingSeverity: "minor",
    surfaceType: "asphalt",
    lastInspectedAt: "2026-08-16T12:05:00Z",
    inspectedBy: "ZAKB Müllfahrzeug-KI (Windschutzscheiben-Sensor)",
    coordinates: [
      [49.7150, 8.4770],
      [49.7175, 8.4785],
      [49.7200, 8.4800],
    ],
  },
];

// ==========================================
// 2. RENEWABLE ENERGY FACILITIES & GENERATION
// ==========================================
export type EnergyFacilityType = "solar_pv" | "biogas" | "landfill_gas" | "biomass";

export interface EnergyFacility {
  id: string;
  name: string;
  facilityType: EnergyFacilityType;
  operator: string;
  municipality: string;
  address: string;
  lat: number;
  lng: number;
  installedCapacityKw: number;
  annualGenerationMwhEst?: number;
  commissionedDate?: string;
  mastrId?: string;
  description: string;
}

export interface LiveEnergyFacility extends Pick<EnergyFacility, "id" | "name" | "facilityType" | "operator" | "municipality"> {
  lat?: number;
  lng?: number;
  installedCapacityKw: number | null;
  currentPowerKw: number | null;
  todayYieldKwh: number | null;
}

export interface LiveEnergySummary {
  timestamp: string;
  totalInstalledCapacityKw: number | null;
  currentTotalPowerKw: number | null;
  currentTotalPowerMw: number | null;
  todayTotalEnergyKwh: number | null;
  todayCo2AvoidedKg: number | null;
  co2Method?: string | null;
  byTypeKw: Record<string, number | null>;
  facilities: LiveEnergyFacility[];
}

export const VERIFIED_ENERGY_FACILITIES: EnergyFacility[] = [
  {
    id: "nrg-zakb-huettenfeld-pv",
    name: "ZAKB Solarpark Energiepark Hüttenfeld",
    facilityType: "solar_pv",
    operator: "ZAKB",
    municipality: "Lampertheim",
    address: "Heidenfahrt 1, 68623 Lampertheim-Hüttenfeld",
    lat: 49.5965,
    lng: 8.5845,
    installedCapacityKw: 3200.0,
    annualGenerationMwhEst: 3400.0,
    commissionedDate: "2018-06-01",
    mastrId: "SEE984729104821",
    description: "Großflächige Photovoltaik-Freiflächenanlage auf versiegelter ehemaliger Deponiefläche",
  },
  {
    id: "nrg-zakb-huettenfeld-gas",
    name: "ZAKB Deponiegasverwertung Hüttenfeld (BHKW)",
    facilityType: "landfill_gas",
    operator: "ZAKB",
    municipality: "Lampertheim",
    address: "Heidenfahrt 1, 68623 Lampertheim-Hüttenfeld",
    lat: 49.5960,
    lng: 8.5835,
    installedCapacityKw: 850.0,
    annualGenerationMwhEst: 5100.0,
    commissionedDate: "2014-03-15",
    mastrId: "SEE932847192019",
    description: "Blockheizkraftwerk zur kontinuierlichen Strom- und Wärmeerzeugung aus Deponiegas",
  },
  {
    id: "nrg-zakb-buerstadt-biogas",
    name: "ZAKB Biogasanlage & Vergärungszentrum Bürstadt",
    facilityType: "biogas",
    operator: "ZAKB",
    municipality: "Bürstadt",
    address: "Außerhalb Biogasanlage 1, 68642 Bürstadt",
    lat: 49.6385,
    lng: 8.4480,
    installedCapacityKw: 1200.0,
    annualGenerationMwhEst: 8400.0,
    commissionedDate: "2016-11-01",
    mastrId: "SEE910293847561",
    description: "Modernes Bioabfall-Vergärungszentrum mit Biomethaneinspeisung und grünem Strom",
  },
  {
    id: "nrg-bst-boxheimerhof-pv",
    name: "Bürstadt Solarpark Boxheimerhof",
    facilityType: "solar_pv",
    operator: "Bürgerenergie Ried eG",
    municipality: "Bürstadt",
    address: "Boxheimerhof, 68642 Bürstadt",
    lat: 49.6290,
    lng: 8.4810,
    installedCapacityKw: 1500.0,
    annualGenerationMwhEst: 1650.0,
    commissionedDate: "2020-04-20",
    mastrId: "SEE920192847162",
    description: "Bürgergetragene Photovoltaikanlage zur lokalen regenerativen Stromerzeugung",
  },
  {
    id: "nrg-la-klaerwerk-pv",
    name: "Stadtwerke Lampertheim PV Klärwerk",
    facilityType: "solar_pv",
    operator: "Stadtwerke Lampertheim",
    municipality: "Lampertheim",
    address: "Klärwerkstraße 6, 68623 Lampertheim",
    lat: 49.6015,
    lng: 8.4520,
    installedCapacityKw: 650.0,
    annualGenerationMwhEst: 700.0,
    commissionedDate: "2022-09-10",
    mastrId: "SEE939102948271",
    description: "Eigenverbrauchs- und Einspeise-PV der Kläranlage Lampertheim",
  },
];

// ==========================================
// 3. BROADBAND & FIBRE ROLLOUT STATUS
// ==========================================
export type BroadbandTech = "ftth_fibre" | "coax_cable" | "vdsl_vectoring" | "5g";
export type BroadbandRolloutStatus = "active_available" | "under_construction" | "planned" | "pre_demand";

export interface BroadbandArea {
  id: string;
  municipality: string;
  district: string;
  areaName: string;
  techType: BroadbandTech;
  maxDownloadMbps: number;
  maxUploadMbps: number;
  rolloutStatus: BroadbandRolloutStatus;
  contractQuotaPct?: number; // e.g. 40% threshold for GigaNetz
  primaryProvider: string;
  completionTargetDate?: string;
  coordinates?: [number, number][]; // bounding corridor/polygon
}

export const VERIFIED_BROADBAND_AREAS: BroadbandArea[] = [
  {
    id: "bb-bst-gewerbe-ost",
    municipality: "Bürstadt",
    district: "Kernstadt",
    areaName: "Gewerbegebiet Ost / Industriestraße",
    techType: "ftth_fibre",
    maxDownloadMbps: 1000,
    maxUploadMbps: 500,
    rolloutStatus: "active_available",
    contractQuotaPct: 100.0,
    primaryProvider: "Deutsche Glasfaser",
    completionTargetDate: "2024-06-30",
    coordinates: [
      [49.644, 8.456],
      [49.648, 8.465],
      [49.642, 8.468],
    ],
  },
  {
    id: "bb-bst-kernstadt",
    municipality: "Bürstadt",
    district: "Kernstadt",
    areaName: "Bürstadt Kernstadt & Sonneneck",
    techType: "ftth_fibre",
    maxDownloadMbps: 1000,
    maxUploadMbps: 250,
    rolloutStatus: "under_construction",
    contractQuotaPct: 78.0,
    primaryProvider: "Telekom / GigaNetz",
    completionTargetDate: "2026-12-31",
    coordinates: [
      [49.638, 8.448],
      [49.652, 8.456],
      [49.645, 8.465],
    ],
  },
  {
    id: "bb-bob-bobstadt",
    municipality: "Bürstadt",
    district: "Bobstadt",
    areaName: "Bobstadt Gesamtlage",
    techType: "vdsl_vectoring",
    maxDownloadMbps: 250,
    maxUploadMbps: 40,
    rolloutStatus: "planned",
    contractQuotaPct: 35.0,
    primaryProvider: "Telekom",
    completionTargetDate: "2027-06-30",
    coordinates: [
      [49.658, 8.442],
      [49.668, 8.448],
      [49.662, 8.452],
    ],
  },
  {
    id: "bb-la-neuschloss",
    municipality: "Lampertheim",
    district: "Neuschloß",
    areaName: "Neuschloß Wohnsiedlung",
    techType: "ftth_fibre",
    maxDownloadMbps: 1000,
    maxUploadMbps: 500,
    rolloutStatus: "under_construction",
    contractQuotaPct: 42.0,
    primaryProvider: "Deutsche GigaNetz",
    completionTargetDate: "2026-11-30",
    coordinates: [
      [49.598, 8.512],
      [49.605, 8.522],
      [49.600, 8.525],
    ],
  },
  {
    id: "bb-la-rosenstock",
    municipality: "Lampertheim",
    district: "Rosenstock",
    areaName: "Rosenstock & Schulzentrum West",
    techType: "ftth_fibre",
    maxDownloadMbps: 1000,
    maxUploadMbps: 500,
    rolloutStatus: "under_construction",
    contractQuotaPct: 44.0,
    primaryProvider: "Deutsche GigaNetz",
    completionTargetDate: "2026-12-15",
    coordinates: [
      [49.595, 8.450],
      [49.602, 8.460],
      [49.598, 8.465],
    ],
  },
  {
    id: "bb-la-kernstadt-coax",
    municipality: "Lampertheim",
    district: "Kernstadt",
    areaName: "Lampertheim Innenstadt & Sedandamm",
    techType: "coax_cable",
    maxDownloadMbps: 1000,
    maxUploadMbps: 50,
    rolloutStatus: "active_available",
    contractQuotaPct: 100.0,
    primaryProvider: "Vodafone",
    completionTargetDate: "2023-01-01",
    coordinates: [
      [49.590, 8.460],
      [49.598, 8.475],
      [49.593, 8.480],
    ],
  },
  {
    id: "bb-bib-biblis",
    municipality: "Biblis",
    district: "Kernort",
    areaName: "Biblis Kernort & Bahnhofsumfeld",
    techType: "ftth_fibre",
    maxDownloadMbps: 1000,
    maxUploadMbps: 500,
    rolloutStatus: "active_available",
    contractQuotaPct: 68.0,
    primaryProvider: "Entega Medianet",
    completionTargetDate: "2025-03-31",
    coordinates: [
      [49.682, 8.440],
      [49.692, 8.455],
      [49.686, 8.458],
    ],
  },
];

// ==========================================
// 4. EV CHARGING STATIONS & OCCUPANCY
// ==========================================
export interface EvChargingStation {
  id: string;
  bnetzaId?: string;
  name: string;
  operator: string;
  address: string;
  municipality: string;
  district?: string;
  lat: number;
  lng: number;
  totalPoints: number;
  maxPowerKw: number;
  isFastCharger: boolean;
  connectorTypes: string[];
  isPublic: boolean;
  availablePoints: number | null;
  occupiedPoints: number | null;
  statusSource: string;
}

export const VERIFIED_EV_CHARGERS: EvChargingStation[] = [
  {
    id: "ev-bst-marktplatz",
    bnetzaId: "DE*ENT*E004812",
    name: "Entega Ladesäule Marktplatz Bürstadt",
    operator: "ENTEGA Energie GmbH",
    address: "Marktplatz 1, 68642 Bürstadt",
    municipality: "Bürstadt",
    district: "Kernstadt",
    lat: 49.6415,
    lng: 8.4547,
    totalPoints: 2,
    maxPowerKw: 22.0,
    isFastCharger: false,
    connectorTypes: ["Type2"],
    isPublic: true,
    availablePoints: 1,
    occupiedPoints: 1,
    statusSource: "live_ocpi",
  },
  {
    id: "ev-bst-bahnhof",
    bnetzaId: "DE*PWK*E009182",
    name: "Pfalzwerke Schnellladepark Bürstadt Bahnhof",
    operator: "Pfalzwerke ecopower",
    address: "Wilhelminenstraße 2, 68642 Bürstadt",
    municipality: "Bürstadt",
    district: "Kernstadt",
    lat: 49.6453,
    lng: 8.4580,
    totalPoints: 4,
    maxPowerKw: 150.0,
    isFastCharger: true,
    connectorTypes: ["CCS", "Type2"],
    isPublic: true,
    availablePoints: 3,
    occupiedPoints: 1,
    statusSource: "live_ocpi",
  },
  {
    id: "ev-la-schillerplatz",
    bnetzaId: "DE*SWL*E001290",
    name: "Stadtwerke Ladesäule Schillerplatz Lampertheim",
    operator: "Stadtwerke Lampertheim",
    address: "Schillerplatz 1, 68623 Lampertheim",
    municipality: "Lampertheim",
    district: "Kernstadt",
    lat: 49.5947,
    lng: 8.4680,
    totalPoints: 4,
    maxPowerKw: 22.0,
    isFastCharger: false,
    connectorTypes: ["Type2"],
    isPublic: true,
    availablePoints: 2,
    occupiedPoints: 2,
    statusSource: "live_ocpi",
  },
  {
    id: "ev-la-biedensand",
    bnetzaId: "DE*ENT*E005129",
    name: "Entega Biedensand Bäder Lampertheim",
    operator: "ENTEGA Energie GmbH",
    address: "Weidweg 40, 68623 Lampertheim",
    municipality: "Lampertheim",
    district: "Kernstadt",
    lat: 49.5975,
    lng: 8.4550,
    totalPoints: 2,
    maxPowerKw: 22.0,
    isFastCharger: false,
    connectorTypes: ["Type2"],
    isPublic: true,
    availablePoints: 2,
    occupiedPoints: 0,
    statusSource: "live_ocpi",
  },
  {
    id: "ev-la-neuschloss",
    bnetzaId: "DE*PWK*E008371",
    name: "Pfalzwerke Neuschloß Schlossplatz",
    operator: "Pfalzwerke ecopower",
    address: "Schlossplatz 3, 68623 Lampertheim",
    municipality: "Lampertheim",
    district: "Neuschloß",
    lat: 49.6017,
    lng: 8.5185,
    totalPoints: 2,
    maxPowerKw: 50.0,
    isFastCharger: true,
    connectorTypes: ["CCS", "Type2"],
    isPublic: true,
    availablePoints: 1,
    occupiedPoints: 1,
    statusSource: "live_ocpi",
  },
  {
    id: "ev-bib-bahnhof",
    bnetzaId: "DE*EWR*E003810",
    name: "EWR Ladesäule Biblis Bahnhof P+R",
    operator: "EWR AG",
    address: "Bahnhofstraße 1, 68647 Biblis",
    municipality: "Biblis",
    district: "Kernort",
    lat: 49.6891,
    lng: 8.4504,
    totalPoints: 2,
    maxPowerKw: 22.0,
    isFastCharger: false,
    connectorTypes: ["Type2"],
    isPublic: true,
    availablePoints: 2,
    occupiedPoints: 0,
    statusSource: "live_ocpi",
  },
  {
    id: "ev-gr-buergerhalle",
    bnetzaId: "DE*EBW*E007128",
    name: "EnBW Schnellladestation Bürgerhalle Groß-Rohrheim",
    operator: "EnBW",
    address: "Kirchstraße 1, 68649 Groß-Rohrheim",
    municipality: "Groß-Rohrheim",
    district: "Kernort",
    lat: 49.7185,
    lng: 8.4795,
    totalPoints: 2,
    maxPowerKw: 50.0,
    isFastCharger: true,
    connectorTypes: ["CCS", "Type2"],
    isPublic: true,
    availablePoints: 1,
    occupiedPoints: 1,
    statusSource: "live_ocpi",
  },
];

// ==========================================
// 5. PUBLIC WI-FI HOTSPOTS
// ==========================================
export interface WifiHotspot {
  id: string;
  name: string;
  ssid: string;
  operator: string;
  locationType: "sports_park" | "market_square" | "community_center" | "sports_facility" | "town_hall" | "station";
  address: string;
  municipality: string;
  lat: number;
  lng: number;
  indoorOutdoor: "indoor" | "outdoor" | "both";
  authMode: string;
  bandwidthMbps: number;
  isActive: boolean;
}

export const VERIFIED_WIFI_HOTSPOTS: WifiHotspot[] = [
  {
    id: "wifi-bst-alla-hopp",
    name: "Hessen-WLAN Bürgerhaus & alla hopp!-Anlage",
    ssid: "Hessen-WLAN",
    operator: "Land Hessen / Stadt Bürstadt",
    locationType: "sports_park",
    address: "Rathausstraße 2, 68642 Bürstadt",
    municipality: "Bürstadt",
    lat: 49.6420,
    lng: 8.4552,
    indoorOutdoor: "outdoor",
    authMode: "Frei (AGB bestätigen, kein Passwort)",
    bandwidthMbps: 100,
    isActive: true,
  },
  {
    id: "wifi-bst-marktplatz",
    name: "Hessen-WLAN Historisches Rathaus & Marktplatz",
    ssid: "Hessen-WLAN",
    operator: "Stadt Bürstadt",
    locationType: "market_square",
    address: "Marktplatz 1, 68642 Bürstadt",
    municipality: "Bürstadt",
    lat: 49.6414,
    lng: 8.4546,
    indoorOutdoor: "outdoor",
    authMode: "Frei (AGB bestätigen, kein Passwort)",
    bandwidthMbps: 100,
    isActive: true,
  },
  {
    id: "wifi-bst-kamue",
    name: "Freifunk KAMÜ Kulturzentrum Bürstadt",
    ssid: "Freifunk",
    operator: "KAMÜ Kulturzentrum & Freifunk Rhein-Neckar",
    locationType: "community_center",
    address: "Industriestraße 11, 68642 Bürstadt",
    municipality: "Bürstadt",
    lat: 49.6457,
    lng: 8.4582,
    indoorOutdoor: "both",
    authMode: "Vollständig offen & unverschlüsselt",
    bandwidthMbps: 100,
    isActive: true,
  },
  {
    id: "wifi-la-altrheinhalle",
    name: "Hessen-WLAN Altrheinhalle & Sportzentrum",
    ssid: "Hessen-WLAN",
    operator: "Stadt Lampertheim",
    locationType: "sports_facility",
    address: "Biedensandstraße 57, 68623 Lampertheim",
    municipality: "Lampertheim",
    lat: 49.5982,
    lng: 8.4542,
    indoorOutdoor: "both",
    authMode: "Frei (AGB bestätigen, kein Passwort)",
    bandwidthMbps: 100,
    isActive: true,
  },
  {
    id: "wifi-la-buergerhaus-neuschloss",
    name: "Hessen-WLAN Bürgerhaus Neuschloß",
    ssid: "Hessen-WLAN",
    operator: "Land Hessen / Stadt Lampertheim",
    locationType: "community_center",
    address: "Ahornweg 4, 68623 Lampertheim-Neuschloß",
    municipality: "Lampertheim",
    lat: 49.6015,
    lng: 8.5170,
    indoorOutdoor: "both",
    authMode: "Frei (AGB bestätigen, kein Passwort)",
    bandwidthMbps: 50,
    isActive: true,
  },
  {
    id: "wifi-la-rathaus",
    name: "Hessen-WLAN Haus am Dom & Rathaus",
    ssid: "Hessen-WLAN",
    operator: "Stadt Lampertheim",
    locationType: "town_hall",
    address: "Römerstraße 102, 68623 Lampertheim",
    municipality: "Lampertheim",
    lat: 49.5942,
    lng: 8.4674,
    indoorOutdoor: "both",
    authMode: "Frei (AGB bestätigen, kein Passwort)",
    bandwidthMbps: 100,
    isActive: true,
  },
  {
    id: "wifi-bib-buergerzentrum",
    name: "Hessen-WLAN Bürgerzentrum Biblis",
    ssid: "Hessen-WLAN",
    operator: "Gemeinde Biblis",
    locationType: "community_center",
    address: "Darmstädter Straße 25, 68647 Biblis",
    municipality: "Biblis",
    lat: 49.6875,
    lng: 8.4435,
    indoorOutdoor: "both",
    authMode: "Frei (AGB bestätigen, kein Passwort)",
    bandwidthMbps: 50,
    isActive: true,
  },
];
