import type { FeatureCollection, Feature, Geometry } from "geojson";

export const CONTEXT_REGION = [8.35, 49.55, 8.58, 49.76] as const;
const SERVICE_ROOT = "https://services2.arcgis.com/jUpNdisbWqRpMo35/arcgis/rest/services/";
export const CONTEXT_LAYERS = {
  landcover: {
    title: "Landbedeckung 2021", item: "6bb9b8ef9de446078796b71ce49b8a36",
    service: "Landbedeckung_Deutschland_2021", sublayers: [0],
    fields: "OBJECTID_1,LB_Klasse,LN_Klasse", objectId: "OBJECTID_1", minZoom: 12,
    attribution: "© BKG 2025 · CC BY 4.0 · Aufbereitung: Esri Deutschland",
    license: "https://creativecommons.org/licenses/by/4.0/",
    note: "Datenstand 2021 · Mindestkartierfläche 1 ha. Landbedeckung erklärt den Standortkontext; sie ist keine aktuelle Temperaturmessung.",
    legend: "Rot: Bebauung · Grau: versiegelte Flächen · Gelb: Ackerland · Blau: Wasser · Grün: Vegetation · Beige: übrige Klassen",
  },
  floodrisk: {
    title: "Hochwasserrisikoflächen", item: "91058f6620764a05a43d1d15cdf60d68",
    service: "Überflutungsflächen_nach_Risiko", sublayers: [0, 1, 2],
    fields: "OBJECTID,POLY_NAME,FL_RECUR,QLIKE,COL_YEAR", objectId: "OBJECTID", minZoom: 10,
    attribution: "© WasserBLIcK/BfG und zuständige Behörden der Länder, 2020 · CC BY 4.0 · Aufbereitung: Esri Deutschland",
    license: "https://creativecommons.org/licenses/by/4.0/",
    note: "Berichtszyklus 2016–2021 · zuletzt bearbeitet 2024. Szenarien, keine aktuelle Überflutung und keine Starkregenkarte. Außerhalb der Flächen ist Sicherheit nicht nachgewiesen.",
    legend: "Gelb: geringes · Orange: mittleres · Rot: hohes Risiko laut Quelldienst; Szenarien können sich überlagern.",
  },
  census: {
    title: "Bevölkerung · Zensus 2022", item: "87285c05ac3b498a8cbf257c3c23a37d",
    service: "Zensus2022_grid_final", sublayers: [1],
    fields: "OBJECTID,GITTER_ID_1km,Einwohner,Durchschnittsalter", objectId: "OBJECTID", minZoom: 12,
    attribution: "© Statistische Ämter des Bundes und der Länder, 2024 · Gitter: © GeoBasis-DE / BKG (2024) · DL-DE BY 2.0 · Aufbereitung: Esri Deutschland",
    license: "https://www.govdata.de/dl-de/by-2-0",
    note: "Stichtag 15.05.2022 · 1-km-Gitter. Keine heutigen Einwohnerzahlen und keine individuelle Hitzerisikobewertung. Fehlende oder negative Quellenwerte bleiben unbekannt.",
    legend: "Einwohner je 1-km-Zelle: hell bis dunkelviolett · <100 / 100–499 / 500–1.999 / ≥2.000 · Grau: unbekannt",
  },
} as const;
export type ContextLayerId = keyof typeof CONTEXT_LAYERS;
export function isContextLayerId(value: string): value is ContextLayerId {
  return Object.hasOwn(CONTEXT_LAYERS, value);
}
export function contextQuery(id: ContextLayerId, sublayer: number, offset: number) {
  const config = CONTEXT_LAYERS[id];
  const params = new URLSearchParams({
    f: "geojson", where: "1=1", geometry: CONTEXT_REGION.join(","),
    geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: config.fields,
    returnGeometry: "true", maxAllowableOffset: id === "floodrisk" ? "0.0002" : "0.00005", geometryPrecision: "5",
    orderByFields: config.objectId, resultOffset: String(offset), resultRecordCount: "1000",
  });
  return `${SERVICE_ROOT}${encodeURIComponent(config.service)}/FeatureServer/${sublayer}/query?${params}`;
}
export function decodeContextPage(value: unknown): FeatureCollection {
  if (!value || typeof value !== "object") throw new Error("Invalid GeoJSON");
  const page = value as FeatureCollection & { error?: unknown; properties?: { exceededTransferLimit?: boolean }; exceededTransferLimit?: boolean };
  if (page.error || page.type !== "FeatureCollection" || !Array.isArray(page.features) || page.features.length > 1000) throw new Error("Invalid GeoJSON page");
  for (const feature of page.features) {
    if (feature.type !== "Feature" || !feature.properties || !feature.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) throw new Error("Invalid polygon");
    const validCoordinates = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && (typeof v[0] === "number"
      ? v.length >= 2 && v.every(n => typeof n === "number" && Number.isFinite(n)) && Math.abs(v[0]) <= 180 && Math.abs(v[1] as number) <= 90
      : v.every(validCoordinates));
    if (!validCoordinates(feature.geometry.coordinates)) throw new Error("Invalid coordinates");
  }
  // ArcGIS uses either placement depending on service version.
  if ((page.exceededTransferLimit || page.properties?.exceededTransferLimit) && !page.features.length) throw new Error("Empty truncated page");
  return page;
}
export function contextNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
export function contextColor(id: ContextLayerId, properties: Record<string, unknown>): string {
  if (id === "floodrisk") return ["#eab308", "#f97316", "#dc2626"][Number(properties.scenario)] ?? "#94a3b8";
  if (id === "census") {
    const n = contextNumber(properties.Einwohner);
    return n === null ? "#94a3b8" : n < 100 ? "#ddd6fe" : n < 500 ? "#a78bfa" : n < 2000 ? "#7c3aed" : "#4c1d95";
  }
  const name = String(properties.LB_Klasse ?? "");
  return name === "Bebauung" ? "#f87171" : name.startsWith("Versiegelte") ? "#9ca3af" : name === "Ackerland" ? "#eab308" : name.startsWith("Wasser") ? "#38bdf8" : /bäume|Grünland|Grasland|Aufforstung|Sträucher|Heide/i.test(name) ? "#4ade80" : "#d6b98c";
}
export function contextRows(id: ContextLayerId, p: Record<string, unknown>): string[] {
  if (id === "landcover") return [`Landbedeckung: ${p.LB_Klasse ?? "unbekannt"}`, `Landnutzung: ${p.LN_Klasse ?? "unbekannt"}`];
  if (id === "floodrisk") return [`Szenario: ${["Geringes Risiko", "Mittleres Risiko", "Hohes Risiko"][Number(p.scenario)] ?? "unbekannt"}`, `Gebiet: ${p.POLY_NAME ?? "unbekannt"}`, `Quellenwert Wiederkehrintervall (Jahre): ${typeof p.FL_RECUR === "string" && p.FL_RECUR.trim() ? p.FL_RECUR : contextNumber(p.FL_RECUR) ?? "unbekannt"}`];
  return [`Gitter: ${p.GITTER_ID_1km ?? "unbekannt"}`, `Einwohner: ${contextNumber(p.Einwohner)?.toLocaleString("de-DE") ?? "unbekannt"}`, `Durchschnittsalter: ${contextNumber(p.Durchschnittsalter)?.toLocaleString("de-DE") ?? "unbekannt"}`];
}
export type ContextFeature = Feature<Geometry, Record<string, unknown>>;
