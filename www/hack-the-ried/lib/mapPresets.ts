import { DEFAULT_MAP_LAYERS, MAP_LAYER_IDS, type MapLayerId } from "./urlState";

export type LayerCategory =
  | "mobility"
  | "environment"
  | "infrastructure"
  | "planning";

export interface LayerMetadata {
  id: MapLayerId;
  label: string;
  icon: string;
  category: LayerCategory;
  description: string;
  minZoom?: number;
  highlightColor?: string;
}

export const LAYER_CATEGORIES: Record<
  LayerCategory,
  {
    label: string;
    icon: string;
    description: string;
  }
> = {
  mobility: {
    label: "Mobilität & Verkehr",
    icon: "🚗",
    description:
      "Straßenverkehr, Sperrungen, ÖPNV, Bahnübergänge & Ladeinfrastruktur",
  },
  environment: {
    label: "Umwelt & Gewässer",
    icon: "🌿",
    description:
      "Naturschutzgebiete, Hochwasser- & Flusspegel, Starkregen und Agrarflächen",
  },
  infrastructure: {
    label: "Infrastruktur & Digitales",
    icon: "⚡",
    description:
      "Erneuerbare Energien, KI-Straßenzustand, WLAN-Hotspots & Breitband",
  },
  planning: {
    label: "Planung & Kommunales",
    icon: "🏛️",
    description:
      "Bodenrichtwerte, Bebauungspläne, Kommunalpolitik, Betriebe & Müllabfuhr",
  },
};

export const LAYER_MIN_ZOOM: Record<MapLayerId, number> = {
  // Regional (Zoom 8-11)
  monitoring: 12,
  warnings: 8,
  landcover: 12,
  floodrisk: 10,
  census: 12,
  nature: 8,
  floods: 8,
  trains: 9,
  ships: 9,
  aircraft: 9,
  satellites: 8,
  closures: 10,
  lora: 9,
  emf: 10,

  // Municipal / City (Zoom 12-13)
  buses: 12,
  waste: 12,
  traffic: 12,
  energy: 12,
  starkregen: 12,
  places: 13,
  companies: 13,
  broadband: 13,
  elections: 13,

  // Neighborhood / Street (Zoom 14+)
  crossings: 14,
  charging: 14,
  fuel: 12,
  wifi: 14,
  crops: 14,
  road: 14,
  stops: 14,
  boris: 14,
  devplans: 14,
};

// Collected vectors retain overview styling. Raster and optional context overlays
// load only at their supported zoom.
export function isLayerZoomRestricted(id: MapLayerId, zoom: number): boolean {
  return (["starkregen", "lora", "landcover", "floodrisk", "census", "monitoring", "nature", "charging", "warnings"].includes(id)) && zoom < LAYER_MIN_ZOOM[id];
}

export const LAYER_DEFINITIONS: Record<MapLayerId, LayerMetadata> = {
  monitoring: { id: "monitoring", label: "Gewässermessstellen", icon: "💧", category: "environment", description: "BfG-Verzeichnis: Grundwasser- und Oberflächenwassermessstellen · keine Live-Messwerte", minZoom: 12 },
  warnings: { id: "warnings", label: "DWD-Wetterwarnungen", icon: "⚠️", category: "environment", description: "Warnpolygone über Esri · etwa 30 Minuten verzögert · mit Quellenaktualität", minZoom: 8 },
  landcover: { id: "landcover", label: "Landbedeckung 2021", icon: "🌱", category: "environment", description: "BKG-Landbedeckung im Ried · historischer Flächenkontext, Mindestkartierfläche 1 ha", minZoom: 12 },
  floodrisk: { id: "floodrisk", label: "Hochwasserrisikoflächen", icon: "🌊", category: "environment", description: "BfG-Szenarien 2016–2021, Bearbeitung 2024 · keine aktuelle Überflutung oder Starkregenprognose", minZoom: 10 },
  census: { id: "census", label: "Bevölkerung · Zensus 2022", icon: "👥", category: "planning", description: "Einwohner pro 1-km-Gitterzelle im Ried · Stichtag 15.05.2022", minZoom: 12 },
  fuel: { id: "fuel", label: "Tankstellen & Spritpreise", icon: "⛽", category: "mobility", description: "Super E5, E10 und Diesel · Tankerkönig / MTS-K", minZoom: LAYER_MIN_ZOOM.fuel },
  places: {
    id: "places",
    label: "Öffentliche Orte",
    icon: "🏫",
    category: "planning",
    description:
      "Kartierte Schulen, Gesundheit, Kultur und Freizeit – ohne Live-Öffnungs- oder Notdienststatus",
    minZoom: LAYER_MIN_ZOOM.places,
  },
  crossings: {
    id: "crossings",
    label: "Bahnübergänge",
    icon: "⛩",
    category: "mobility",
    description:
      "Gesammelte Bahnübergänge; Schrankenstatus nur bei verfügbarer Messung",
    minZoom: LAYER_MIN_ZOOM.crossings,
  },
  // Mobility & Traffic
  closures: {
    id: "closures",
    label: "Sperrungen",
    icon: "⛔",
    category: "mobility",
    description: "Aktuelle und geplante Straßensperrungen & Baustellen im Ried",
    minZoom: LAYER_MIN_ZOOM.closures,
    highlightColor: "border-red-500 text-red-300",
  },
  traffic: {
    id: "traffic",
    label: "Verkehrslage",
    icon: "🚗",
    category: "mobility",
    description:
      "Echtzeit-Verkehrslage, Staus und Verzögerungen auf Ried-Hauptachsen",
    minZoom: LAYER_MIN_ZOOM.traffic,
    highlightColor: "border-amber-500 text-amber-300",
  },
  buses: {
    id: "buses",
    label: "VRN Busse",
    icon: "🚌",
    category: "mobility",
    description: "Fahrplanbasierte Live-Positionen der VRN-Buslinien im Ried",
    minZoom: LAYER_MIN_ZOOM.buses,
    highlightColor: "border-sky-500 text-sky-300",
  },
  stops: {
    id: "stops",
    label: "Haltestellen",
    icon: "🚏",
    category: "mobility",
    description: "VRN-Bushaltestellen mit Richtungssteigen & Abfahrten",
    minZoom: LAYER_MIN_ZOOM.stops,
    highlightColor: "border-amber-500 text-amber-300",
  },
  satellites: {
    id: "satellites",
    label: "Satelliten",
    icon: "🛰",
    category: "mobility",
    description:
      "Berechnete Bodenprojektionen aus Space-Track-Bahnelementen · SGP4 · keine Live-Messungen",
    minZoom: LAYER_MIN_ZOOM.satellites,
    highlightColor: "border-violet-500 text-violet-300",
  },
  aircraft: {
    id: "aircraft",
    label: "Flugverkehr",
    icon: "✈",
    category: "mobility",
    description:
      "Empfangene Flugpositionen über dem Ried · adsb.lol und Open Glider Network (auch Segelflug) · keine vollständige Erfassung",
    minZoom: LAYER_MIN_ZOOM.aircraft,
    highlightColor: "border-yellow-500 text-yellow-300",
  },
  ships: {
    id: "ships",
    label: "Schiffe",
    icon: "🚢",
    category: "mobility",
    description:
      "Gemeldete AIS-Positionen auf dem Rhein zwischen Worms und Gernsheim; Empfang kann lückenhaft sein",
    minZoom: LAYER_MIN_ZOOM.ships,
    highlightColor: "border-cyan-500 text-cyan-300",
  },
  trains: {
    id: "trains",
    label: "Züge & BÜ",
    icon: "🚅",
    category: "mobility",
    description:
      "Riedbahn & Nibelungenbahn Zugpositionen aus gespeicherten Meldungen und Fahrplänen",
    minZoom: LAYER_MIN_ZOOM.trains,
    highlightColor: "border-sky-500 text-sky-300",
  },
  charging: {
    id: "charging",
    label: "Ladesäulen",
    icon: "⚡",
    category: "mobility",
    description: "Öffentliche Elektro-Ladesäulen und Live-Belegungsstatus",
    minZoom: LAYER_MIN_ZOOM.charging,
    highlightColor: "border-emerald-400 text-emerald-300",
  },

  // Environment & Water
  nature: {
    id: "nature",
    label: "Naturschutz",
    icon: "🌿",
    category: "environment",
    description:
      "BfN-Schutzgebiete: Naturschutz, FFH, Vogelschutz und weitere Kategorien im Ried",
    minZoom: LAYER_MIN_ZOOM.nature,
    highlightColor: "border-emerald-500 text-emerald-300",
  },
  floods: {
    id: "floods",
    label: "Flusspegel",
    icon: "🌊",
    category: "environment",
    description:
      "Offizielle Rhein-Pegel (Worms) & Weschnitz-Pegel mit Alarmstufen",
    minZoom: LAYER_MIN_ZOOM.floods,
    highlightColor: "border-sky-400 text-sky-300",
  },
  starkregen: {
    id: "starkregen",
    label: "Starkregen-WMS",
    icon: "🌧️",
    category: "environment",
    description:
      "Offizielle HLNUG Starkregengefahrenkarte Hessen (Fließwege & Überflutung)",
    minZoom: LAYER_MIN_ZOOM.starkregen,
    highlightColor: "border-blue-500 text-blue-300",
  },
  crops: {
    id: "crops",
    label: "Agrarkulturen",
    icon: "🌾",
    category: "environment",
    description: "Spargelanbau, Gemüseflächen und Ackerschläge im Ried",
    minZoom: LAYER_MIN_ZOOM.crops,
    highlightColor: "border-purple-400 text-purple-300",
  },

  // Infrastructure & Energy
  energy: {
    id: "energy",
    label: "Ökostrom",
    icon: "☀️",
    category: "infrastructure",
    description:
      "Kartierte private Solaranlagen, PV-Dächer, Energieparks & Biomasse (Geodaten ohne Live-Messwerte)",
    minZoom: LAYER_MIN_ZOOM.energy,
    highlightColor: "border-amber-400 text-amber-300",
  },
  road: {
    id: "road",
    label: "Straßen-KI",
    icon: "🛣️",
    category: "infrastructure",
    description: "KI-basierte Fahrbahnbewertung durch ZAKB-Flottensensorik",
    minZoom: LAYER_MIN_ZOOM.road,
    highlightColor: "border-lime-400 text-lime-300",
  },
  wifi: {
    id: "wifi",
    label: "WLAN",
    icon: "📶",
    category: "infrastructure",
    description: "Öffentliche WLAN-Hotspots (Hessen-WLAN & Freifunk Ried)",
    minZoom: LAYER_MIN_ZOOM.wifi,
    highlightColor: "border-cyan-400 text-cyan-300",
  },
  broadband: {
    id: "broadband",
    label: "Glasfaser",
    icon: "🌐",
    category: "infrastructure",
    description: "Breitband- und Glasfaser-Ausbaugebiete im Ried",
    minZoom: LAYER_MIN_ZOOM.broadband,
    highlightColor: "border-purple-400 text-purple-300",
  },
  lora: {
    id: "lora",
    label: "LoRaWAN & Heatmap",
    icon: "📡",
    category: "infrastructure",
    description: "LoRaWAN Netzabdeckung, Gateways & TTN Mapper Heatmap im Ried",
    minZoom: LAYER_MIN_ZOOM.lora,
    highlightColor: "border-cyan-500 text-cyan-300",
  },
  emf: {
    id: "emf",
    label: "Funkanlagen & Mobilfunk",
    icon: "🗼",
    category: "infrastructure",
    description:
      "Standortbescheinigungen & Sendeantennen der Bundesnetzagentur (BNetzA)",
    minZoom: LAYER_MIN_ZOOM.emf,
    highlightColor: "border-sky-500 text-sky-300",
  },

  // Planning & Municipal
  boris: {
    id: "boris",
    label: "Bodenrichtwerte",
    icon: "🏡",
    category: "planning",
    description:
      "Offizielle BORIS Hessen Bodenrichtwertzonen (€/m² Wohnbauland)",
    minZoom: LAYER_MIN_ZOOM.boris,
    highlightColor: "border-teal-400 text-teal-300",
  },
  devplans: {
    id: "devplans",
    label: "Bau-Pläne",
    icon: "🏗️",
    category: "planning",
    description:
      "Bebauungspläne und Neubaugebiete in Bürstadt, Lampertheim & Biblis",
    minZoom: LAYER_MIN_ZOOM.devplans,
    highlightColor: "border-amber-400 text-amber-300",
  },
  elections: {
    id: "elections",
    label: "Wahlbezirke",
    icon: "🗳️",
    category: "planning",
    description:
      "Stimmbezirke und historische Wahlbeteiligung der Kommunalwahlen",
    minZoom: LAYER_MIN_ZOOM.elections,
    highlightColor: "border-purple-400 text-purple-300",
  },
  companies: {
    id: "companies",
    label: "Arbeitgeber",
    icon: "🏢",
    category: "planning",
    description: "Bedeutende Industrie- & Gewerbearbeitgeber im Ried",
    minZoom: LAYER_MIN_ZOOM.companies,
    highlightColor: "border-sky-400 text-sky-300",
  },
  waste: {
    id: "waste",
    label: "Müllabfuhr",
    icon: "🚛",
    category: "planning",
    description: "Live-Fahrzeuge der ZAKB Müllabfuhr und Sammeltouren im Ried",
    minZoom: LAYER_MIN_ZOOM.waste,
    highlightColor: "border-emerald-500 text-emerald-300",
  },
};

export type LayerPresetId =
  | "default"
  | "sensors_only"
  | "mobility"
  | "environment"
  | "planning";

export interface LayerPreset {
  id: LayerPresetId;
  label: string;
  icon: string;
  shortLabel: string;
  description: string;
  layers: Record<MapLayerId, boolean>;
}

export const LAYER_PRESETS: Record<LayerPresetId, LayerPreset> = {
  default: {
    id: "default",
    label: "Standard-Ansicht",
    shortLabel: "Standard",
    icon: "🌟",
    description: "Ausgewogene Ried-Übersicht mit Kern-Ebenen",
    layers: DEFAULT_MAP_LAYERS,
  },
  sensors_only: {
    id: "sensors_only",
    label: "Nur Sensoren",
    shortLabel: "Nur Sensoren",
    icon: "🎯",
    description: "Maximaler Fokus auf IoT-Messwerte ohne Geodaten-Overlays",
    layers: {
      monitoring: false,
      warnings: false,
      landcover: false,
      floodrisk: false,
      census: false,
      nature: false,
      crops: false,
      floods: false,
      starkregen: false,
      fuel: false,
      charging: false,
      energy: false,
      road: false,
      wifi: false,
      broadband: false,
      boris: false,
      devplans: false,
      elections: false,
      companies: false,
      closures: false,
      traffic: false,
      buses: false,
      stops: false,
      waste: false,
      trains: false,
      ships: false,
      aircraft: false,
      satellites: false,
      crossings: false,
      places: false,
      lora: false,
      emf: false,
    },
  },
  mobility: {
    id: "mobility",
    label: "Mobilität & Verkehr",
    shortLabel: "Mobilität",
    icon: "🚗",
    description:
      "Sperrungen, Staus, Live-Busse, Haltestellen, Züge & Ladesäulen",
    layers: {
      monitoring: false,
      warnings: false,
      landcover: false,
      floodrisk: false,
      census: false,
      nature: false,
      crops: false,
      floods: false,
      starkregen: false,
      fuel: true,
      charging: true,
      energy: false,
      road: true,
      wifi: false,
      broadband: false,
      boris: false,
      devplans: false,
      elections: false,
      companies: false,
      closures: true,
      traffic: true,
      buses: true,
      stops: true,
      waste: true,
      trains: true,
      ships: true,
      aircraft: true,
      satellites: true,
      crossings: true,
      places: false,
      lora: false,
      emf: false,
    },
  },
  environment: {
    id: "environment",
    label: "Umwelt & Gewässer",
    shortLabel: "Umwelt",
    icon: "🌿",
    description:
      "Naturschutzgebiete, Flusspegel, Starkregen-WMS & Agrarkulturen",
    layers: {
      monitoring: false,
      warnings: false,
      landcover: false,
      floodrisk: false,
      census: false,
      nature: true,
      crops: true,
      floods: true,
      starkregen: true,
      fuel: false,
      charging: false,
      energy: true,
      road: false,
      wifi: false,
      broadband: false,
      boris: false,
      devplans: false,
      elections: false,
      companies: false,
      closures: false,
      traffic: false,
      buses: false,
      stops: false,
      waste: false,
      trains: false,
      ships: false,
      aircraft: false,
      satellites: false,
      crossings: false,
      places: false,
      lora: false,
      emf: false,
    },
  },
  planning: {
    id: "planning",
    label: "Planung & Bauen",
    shortLabel: "Planung",
    icon: "🏛️",
    description:
      "Bodenrichtwerte (BORIS), Bau-Pläne, Glasfaser, Gewerbe & ZAKB",
    layers: {
      monitoring: false,
      warnings: false,
      landcover: false,
      floodrisk: false,
      census: false,
      nature: false,
      crops: false,
      floods: false,
      starkregen: false,
      fuel: false,
      charging: false,
      energy: false,
      road: false,
      wifi: true,
      broadband: true,
      boris: true,
      devplans: true,
      elections: true,
      companies: true,
      closures: false,
      traffic: false,
      buses: false,
      stops: false,
      waste: true,
      trains: false,
      ships: false,
      aircraft: false,
      satellites: false,
      crossings: false,
      places: false,
      lora: true,
      emf: true,
    },
  },
};

export const PRESET_IDS: LayerPresetId[] = [
  "default",
  "sensors_only",
  "mobility",
  "environment",
  "planning",
];

export function getLayersByCategory(category: LayerCategory): LayerMetadata[] {
  return MAP_LAYER_IDS.map((id) => LAYER_DEFINITIONS[id]).filter(
    (meta) => meta.category === category
  );
}

export function countActiveLayers(layers: Record<MapLayerId, boolean>): number {
  return MAP_LAYER_IDS.reduce((acc, id) => (layers[id] ? acc + 1 : acc), 0);
}

export function countCategoryActiveLayers(
  category: LayerCategory,
  layers: Record<MapLayerId, boolean>
): { active: number; total: number } {
  const items = getLayersByCategory(category);
  const active = items.reduce(
    (acc, item) => (layers[item.id] ? acc + 1 : acc),
    0
  );
  return { active, total: items.length };
}

export function detectActivePreset(
  layers: Record<MapLayerId, boolean>
): LayerPresetId | "custom" {
  for (const presetId of PRESET_IDS) {
    const presetLayers = LAYER_PRESETS[presetId].layers;
    const isMatch = MAP_LAYER_IDS.every(
      (id) => Boolean(layers[id]) === Boolean(presetLayers[id])
    );
    if (isMatch) return presetId;
  }
  return "custom";
}
