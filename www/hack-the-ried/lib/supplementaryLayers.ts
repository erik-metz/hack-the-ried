import type { FeatureCollection } from "geojson";
import { CONTEXT_REGION, decodeContextPage } from "./contextLayers";

const ROOT = "https://services2.arcgis.com/jUpNdisbWqRpMo35/arcgis/rest/services/";
const GEO_LICENSE = "https://www.gesetze-im-internet.de/geonutzv/index.html";
export const SUPPLEMENTARY_SOURCES = {
  protected: {
    item: "2beeb8ed32d94730b5b70750ba434a4d", service: "Schutzgebiete", geometry: "polygon",
    attribution: "© Bundesamt für Naturschutz (BfN) 2025 · Aufbereitung: Esri Deutschland", license: GEO_LICENSE,
    dataStand: "LSG/NSG 2023; FFH/Vogelschutz 2019; Naturparke/Nationalparke/Biosphärenreservate 2025",
    note: "Schutzgebietskategorien können sich überlagern; schneidende Flächen reichen über den regionalen Auswahlbereich hinaus.",
    layers: [
      { id: 0, name: "Landschaftsschutzgebiete", fields: "OBJECTID,NAME,BL,FLAECHE", objectId: "OBJECTID" },
      { id: 1, name: "Naturschutzgebiete", fields: "OBJECTID,NAME,BL,FLAECHE", objectId: "OBJECTID" },
      { id: 2, name: "Naturparke", fields: "OBJECTID,NAME,BL,FLAECHE", objectId: "OBJECTID" },
      { id: 3, name: "Nationalparke", fields: "OBJECTID,NAME,BL,FLAECHE", objectId: "OBJECTID" },
      { id: 4, name: "FFH-Gebiete", fields: "OBJECTID,NAME,BL,FLAECHE,SITECODE", objectId: "OBJECTID" },
      { id: 5, name: "Biosphärenreservate", fields: "OBJECTID,NAME,BL,FLAECHE", objectId: "OBJECTID" },
      { id: 6, name: "Vogelschutzgebiete", fields: "OBJECTID,NAME,BL,FLAECHE,SITECODE", objectId: "OBJECTID" },
    ],
  },
  monitoring: {
    item: "7df2fba125e3409680b653d81fde39b5", service: "Umweltüberwachungseinrichtungen_Deutschlands", geometry: "point",
    attribution: "© Bundesanstalt für Gewässerkunde (BfG) 2023 · Aufbereitung: Esri Deutschland", license: GEO_LICENSE,
    dataStand: "Katalogstand 10/2022; gehostete Messstellen-Daten zuletzt bearbeitet 08/2023",
    note: "Messstellenverzeichnis, keine Messwerte oder Aussage zum heutigen Betriebsstatus. Meeresstationen sind für den Ried-Ausschnitt nicht relevant.",
    layers: [
      { id: 1, name: "Grundwassermessstellen", fields: "FID,NAME,EU_CD_GM,LASTMONITO,MONITORNET,URL", objectId: "FID" },
      { id: 2, name: "Oberflächenwassermessstellen", fields: "FID,NAME_STN,EU_CD_SM,MONITORNET,URL", objectId: "FID" },
    ],
  },
  warnings: {
    item: "e7e4164319284754a9f72f0c956efb40", service: "aea519", geometry: "polygon",
    attribution: "Quelle: Deutscher Wetterdienst · Geometrien: © GeoBasis-DE / BKG 2021 (Daten modifiziert) · Bereitstellung: Esri Deutschland", license: GEO_LICENSE,
    dataStand: "Esri-Dienst laut Metadaten alle 30 Minuten aktualisiert",
    note: "Zeitverzögerte Ergänzung; amtliche Warnlage unter https://www.dwd.de/warnungen. Kreisgrenzen sind keine Warnungen. Leere Daten gelten nur bei nachgewiesen frischer Quelle als leerer Warnbestand.",
    layers: [{ id: 1, name: "DWD-Wetterwarnungen", fields: "OBJECTID,IDENTIFIER,STATUS,MSGTYPE,SCOPE,HEADLINE,DESCRIPTION,INSTRUCTION,SEVERITY,EVENT,EC_LICENSE,ONSET,EFFECTIVE,EXPIRES,SENT,AREADESC", objectId: "OBJECTID" }],
  },
  chargers: {
    item: "bc3c97f73d6b4be4921be8560fbc325a", service: "Ladesaeulen_in_Deutschland", geometry: "point",
    attribution: "Quelle: Bundesnetzagentur · Aufbereitung: Esri Deutschland · CC BY 4.0", license: "https://creativecommons.org/licenses/by/4.0/",
    dataStand: "07/2026",
    note: "Zusätzlicher Registerstand zum Vergleich mit dem vorhandenen direkten BNetzA-Import; keine Live-Belegung. Zusammenführung erst über Ladeeinrichtungs-ID, keine doppelten Kartenmarker.",
    layers: [{ id: 0, name: "Ladesäulenregister", fields: "OBJECTID,Ladeeinrichtungs_ID,Betreiber,Anzeigename__Karte_,Status,Art_der_Ladeeinrichtung,Anzahl_Ladepunkte,Nennleistung_Ladeeinrichtung__kW_,Ort", objectId: "OBJECTID" }],
  },
} as const;
export type SupplementaryId = keyof typeof SUPPLEMENTARY_SOURCES;
export function isSupplementaryId(value: string): value is SupplementaryId {
  return Object.hasOwn(SUPPLEMENTARY_SOURCES, value);
}
export function supplementaryLayerUrl(id: SupplementaryId, layer: number) {
  return `${ROOT}${encodeURIComponent(SUPPLEMENTARY_SOURCES[id].service)}/FeatureServer/${layer}`;
}
export function supplementaryQuery(id: SupplementaryId, layer: number, offset: number) {
  const config = SUPPLEMENTARY_SOURCES[id].layers.find(entry => entry.id === layer);
  if (!config || !Number.isInteger(offset) || offset < 0 || offset >= 10000) throw new Error("Invalid query");
  const params = new URLSearchParams({ f: "geojson", where: "1=1", geometry: CONTEXT_REGION.join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: config.fields, orderByFields: config.objectId, returnGeometry: "true", geometryPrecision: "5", maxAllowableOffset: "0.0002", resultOffset: String(offset), resultRecordCount: "1000" });
  return `${supplementaryLayerUrl(id, layer)}/query?${params}`;
}
export function decodeSupplementaryPage(id: SupplementaryId, value: unknown): FeatureCollection {
  if (SUPPLEMENTARY_SOURCES[id].geometry === "polygon") return decodeContextPage(value);
  if (!value || typeof value !== "object") throw new Error("Invalid point collection");
  const page = value as FeatureCollection & { error?: unknown };
  if (page.error || page.type !== "FeatureCollection" || !Array.isArray(page.features) || page.features.length > 1000) throw new Error("Invalid point collection");
  for (const f of page.features) {
    if (f.type !== "Feature" || !f.properties || f.geometry?.type !== "Point") throw new Error("Invalid point");
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || c.length !== 2 || !c.every(n => typeof n === "number" && Number.isFinite(n)) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) throw new Error("Invalid coordinates");
  }
  return page;
}
export function warningSourceTimestamp(value: unknown, now: number): number {
  const stamp = (value as { editingInfo?: { dataLastEditDate?: unknown } } | null)?.editingInfo?.dataLastEditDate;
  if (typeof stamp !== "number" || !Number.isFinite(stamp) || stamp > now + 300_000 || now - stamp > 90 * 60_000) throw new Error("Warning source freshness unconfirmed");
  return stamp;
}
export function retainedWarning(properties: Record<string, unknown>, now: number): boolean {
  if (properties.STATUS !== "Actual" || properties.MSGTYPE === "Cancel" || properties.SCOPE !== "Public") return false;
  function time(value: unknown) {
    if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid warning timestamp");
    return Date.parse(value);
  }
  const expires = time(properties.EXPIRES);
  const onset = time(properties.ONSET);
  if (expires <= onset) throw new Error("Invalid warning interval");
  return expires > now; // Future-onset public warnings remain visible as upcoming.
}
