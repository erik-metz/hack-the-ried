import type { Position } from "./mobilityData";

type AircraftStyle = { key: string; label: string; symbol: string; color: string; path: string; directional: boolean };
const style = (key: string, label: string, symbol: string, color: string, path: string, directional = true): AircraftStyle =>
  ({ key, label, symbol, color, path, directional });

// Original silhouettes; each aircraft nose points north in a 32 × 32 viewBox.
export const AIRCRAFT_STYLES = {
  unknown: style("unknown", "Flugzeug · Kategorie unbekannt", "✈", "#facc15", "M16 3V29M5 16L16 12L27 16M11 26L16 24L21 26"),
  glider: style("glider", "Segelflugzeug / Motorsegler", "╋", "#a3e635", "M16 2V29M2 13H30M11 26H21"),
  tow: style("tow", "Schleppflugzeug", "🛩", "#fb923c", "M16 3V23M5 12H27M11 21H21M16 23V27M16 29V31"),
  helicopter: style("helicopter", "Hubschrauber / Tragschrauber", "🚁", "#22d3ee", "M13 10Q16 6 19 10V17Q16 21 13 17ZM16 20V29M12 27H20M4 13H28M16 3V23"),
  drop: style("drop", "Fallschirm-Absetzflugzeug", "🛩", "#f472b6", "M16 2V19M4 10H28M11 17H21M10 24Q16 19 22 24L16 29Z"),
  hang: style("hang", "Drachenflieger", "△", "#fbbf24", "M16 3L2 22L16 17L30 22ZM16 17V28M12 25H20"),
  para: style("para", "Gleitschirm", "🪂", "#c084fc", "M3 12Q16 -3 29 12Q16 6 3 12ZM3 12L16 25L29 12M16 25V29", false),
  piston: style("piston", "Motorflugzeug", "🛩", "#facc15", "M16 5V29M11 3H21M4 15H28M11 26H21"),
  jet: style("jet", "Jet / Turboprop", "✈", "#f8fafc", "M16 2L19 15L29 22L18 20L19 29L16 26L13 29L14 20L3 22L13 15Z"),
  balloon: style("balloon", "Ballon", "🎈", "#fb7185", "M16 2C1 2 4 19 12 22H20C28 19 31 2 16 2ZM12 22L13 29H19L20 22M11 29H21", false),
  airship: style("airship", "Luftschiff", "◉", "#2dd4bf", "M16 2C5 2 5 26 16 27C27 26 27 2 16 2ZM16 21V31M11 30L16 26L21 30"),
  drone: style("drone", "Drohne / UAV", "⊗", "#a78bfa", "M12 12L6 6M20 12L26 6M12 20L6 26M20 20L26 26M12 12H20V20H12ZM2 6a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M22 6a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M2 26a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M22 26a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", false),
  light: style("light", "Leichtflugzeug", "🛩", "#fde047", "M16 5V28M7 13H25M12 25H20M12 3H20"),
  small: style("small", "Kleinflugzeug", "🛩", "#fbbf24", "M16 3L18 13L28 17H18V27L16 25L14 27V17H4L14 13Z"),
  large: style("large", "Großes Flugzeug", "✈", "#e2e8f0", "M16 2L18 12L29 20H18V28L16 25L14 28V20H3L14 12ZM10 15V21M22 15V21"),
  vortex: style("vortex", "Großflugzeug · starke Wirbelschleppe", "✈", "#fca5a5", "M16 2L18 13L28 20H18V28L16 25L14 28V20H4L14 13ZM2 24Q7 30 10 24M22 24Q25 30 30 24"),
  heavy: style("heavy", "Schweres Großflugzeug", "✈", "#cbd5e1", "M16 2L19 12L30 21H19V29L16 26L13 29V21H2L13 12ZM7 16V23M11 15V23M21 15V23M25 16V23"),
  performance: style("performance", "Hochleistungsflugzeug", "✈", "#f87171", "M16 2L20 18L29 27L18 24L16 30L14 24L3 27L12 18Z"),
  lighter: style("lighter", "Ballon / Luftschiff", "🎈", "#fb7185", "M16 3C2 3 3 21 12 23H20C29 21 30 3 16 3ZM12 23L13 29H19L20 23M16 3V23", false),
  parachute: style("parachute", "Fallschirmspringer", "🪂", "#f0abfc", "M3 13Q16 -6 29 13ZM3 13L16 23L29 13M16 23V27M12 31L16 27L20 31", false),
  ultralight: style("ultralight", "Ultraleicht / Drachen / Gleitschirm", "△", "#bef264", "M16 3L2 19H30ZM16 19V29M10 26H22"),
  space: style("space", "Raumflugkörper", "🚀", "#818cf8", "M16 2Q9 11 12 23H20Q23 11 16 2ZM12 18L7 26L12 24M20 18L25 26L20 24M13 27L16 31L19 27"),
};

const OGN: Record<number, AircraftStyle> = { 1:AIRCRAFT_STYLES.glider, 2:AIRCRAFT_STYLES.tow,
  3:AIRCRAFT_STYLES.helicopter, 5:AIRCRAFT_STYLES.drop, 6:AIRCRAFT_STYLES.hang,
  7:AIRCRAFT_STYLES.para, 8:AIRCRAFT_STYLES.piston, 9:AIRCRAFT_STYLES.jet,
  11:AIRCRAFT_STYLES.balloon, 12:AIRCRAFT_STYLES.airship, 13:AIRCRAFT_STYLES.drone };
// ADS-B size categories do not specify piston/jet engines. Never infer from model codes.
const ADSB: Record<string, AircraftStyle> = { A1:AIRCRAFT_STYLES.light, A2:AIRCRAFT_STYLES.small,
  A3:AIRCRAFT_STYLES.large, A4:AIRCRAFT_STYLES.vortex, A5:AIRCRAFT_STYLES.heavy,
  A6:AIRCRAFT_STYLES.performance, A7:AIRCRAFT_STYLES.helicopter, B1:AIRCRAFT_STYLES.glider,
  B2:AIRCRAFT_STYLES.lighter, B3:AIRCRAFT_STYLES.parachute, B4:AIRCRAFT_STYLES.ultralight,
  B6:AIRCRAFT_STYLES.drone, B7:AIRCRAFT_STYLES.space };

export function aircraftStyle(position: Pick<Position, "ogn_category" | "emitter_category">): AircraftStyle {
  if (typeof position.ogn_category === "number" && Object.hasOwn(OGN, position.ogn_category)) return OGN[position.ogn_category];
  if (position.emitter_category && Object.hasOwn(ADSB, position.emitter_category)) return ADSB[position.emitter_category];
  return AIRCRAFT_STYLES.unknown;
}

export function aircraftMarker(position: Position, label: string): HTMLElement {
  const category = aircraftStyle(position);
  const root = document.createElement("div");
  root.className = "map-place-marker";
  root.style.setProperty("--place-color", category.color);
  root.title = `${category.label}${label ? ` · ${label}` : ""}`;
  root.dataset.aircraftCategory = category.key;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("width", "26"); svg.setAttribute("height", "26");
  svg.setAttribute("aria-hidden", "true");
  svg.style.color = category.color;
  if (category.directional && position.course_deg !== undefined && Number.isFinite(position.course_deg)) {
    svg.style.transform = `rotate(${position.course_deg}deg)`;
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", category.path); path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
  svg.append(path); root.append(svg);
  if (label) {
    const badge = document.createElement("span");
    badge.className = "map-place-label"; badge.textContent = label; root.append(badge);
  }
  return root;
}
