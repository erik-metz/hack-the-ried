import type { FeatureCollection, Feature, Geometry } from "geojson";
import { decodeSupplementaryPage, retainedWarning, warningSourceTimestamp, type SupplementaryId } from "./supplementaryLayers";

export interface SupplementarySnapshot extends FeatureCollection {
  checked_at?: string;
  source_updated_at?: string;
}
export function decodeSupplementarySnapshot(id: SupplementaryId, body: unknown): SupplementarySnapshot {
  if (!body || typeof body !== "object") throw new Error("Invalid snapshot");
  const snapshot = body as SupplementarySnapshot;
  if (!Array.isArray(snapshot.features)) throw new Error("Invalid snapshot");
  // The API paginates server-side; validate the returned combined collection in bounded chunks.
  if (snapshot.features.length > 70_000) throw new Error("Oversized snapshot");
  for (let i = 0; i < snapshot.features.length; i += 1000) decodeSupplementaryPage(id, { type: "FeatureCollection", features: snapshot.features.slice(i, i + 1000) });
  if (snapshot.type !== "FeatureCollection") throw new Error("Invalid snapshot");
  if (id === "warnings") {
    if (!snapshot.checked_at || !snapshot.source_updated_at || !Number.isFinite(Date.parse(snapshot.checked_at)) || !Number.isFinite(Date.parse(snapshot.source_updated_at))) throw new Error("Warning timestamps missing");
    for (const f of snapshot.features) retainedWarning(f.properties ?? {}, Date.parse(snapshot.checked_at));
  }
  return snapshot;
}
export function warningsFresh(snapshot: SupplementarySnapshot | null, now: number): boolean {
  if (!snapshot?.checked_at || !snapshot.source_updated_at) return false;
  const checked = Date.parse(snapshot.checked_at);
  if (!Number.isFinite(checked) || checked > now + 5000 || now - checked > 120_000) return false;
  try { warningSourceTimestamp({ editingInfo: { dataLastEditDate: Date.parse(snapshot.source_updated_at) } }, now); return true; } catch { return false; }
}
function chargerId(p: Record<string, unknown>): string | null {
  const raw = p.bnetzaId ?? p.bnetza_id ?? p.Ladeeinrichtungs_ID ?? (typeof p.id === "string" && p.id.startsWith("bnetza-") ? p.id.slice(7) : null);
  if ((typeof raw !== "string" && typeof raw !== "number") || !/^\d+$/.test(String(raw))) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? String(n) : null;
}
export function mergedChargers(primary: FeatureCollection | undefined, secondary: FeatureCollection | null): FeatureCollection {
  const features: Feature<Geometry>[] = [];
  const seen = new Set<string>();
  for (const [collection, source] of [[primary, "direct"], [secondary, "esri"]] as const) {
    for (const f of collection?.features ?? []) {
      if (f.geometry?.type !== "Point") continue;
      const p = f.properties ?? {};
      const id = chargerId(p);
      // Unidentifiable secondary records cannot be reconciled safely with the register.
      if ((source === "esri" && id === null) || (id !== null && seen.has(id))) continue;
      if (id !== null) seen.add(id);
      features.push({ ...f, properties: { ...p, register_source: source, register_id: id } });
    }
  }
  return { type: "FeatureCollection", features };
}
export function supplementaryColor(id: SupplementaryId, p: Record<string, unknown>): string {
  if (id === "protected") return ["#84cc16", "#16a34a", "#a3e635", "#14532d", "#14b8a6", "#059669", "#22d3ee"][Number(p.source_layer)] ?? "#16a34a";
  if (id === "monitoring") return p.source_layer === 1 ? "#818cf8" : "#38bdf8";
  if (id === "warnings") return ({ Minor: "#facc15", Moderate: "#fb923c", Severe: "#ef4444", Extreme: "#a855f7" } as Record<string, string>)[String(p.SEVERITY)] ?? "#94a3b8";
  return "#34d399";
}
export function supplementaryTitle(id: SupplementaryId, p: Record<string, unknown>): string {
  const values = id === "protected" ? [p.NAME, "Schutzgebiet"] : id === "monitoring" ? [p.NAME, p.NAME_STN, "Gewässermessstelle"] : id === "warnings" ? [p.HEADLINE, p.EVENT, "DWD-Warnung"] : [p.name, p.Anzeigename__Karte_, p.Betreiber, "Ladestation"];
  return String(values.find(value => value != null && String(value).trim()) ?? "Standort");
}
function numeric(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value.toLocaleString("de-DE") : "unbekannt";
}
export function supplementaryRows(id: SupplementaryId, p: Record<string, unknown>, now: number): string[] {
  if (id === "protected") return [`Kategorie: ${p.source_category ?? "unbekannt"}`, `Fläche laut Quelle (ha): ${numeric(p.FLAECHE)}`];
  if (id === "monitoring") return [`Kategorie: ${p.source_category ?? "unbekannt"}`, `Kennung: ${p.EU_CD_GM ?? p.EU_CD_SM ?? "unbekannt"}`, `Messnetz: ${p.MONITORNET ?? "unbekannt"}`, "Messstellenverzeichnis · keine Live-Messwerte oder Betriebsbestätigung"];
  if (id === "warnings") return [Date.parse(String(p.ONSET)) > now ? "Kommende Warnung" : "Im angegebenen Gültigkeitszeitraum", `Gebiet: ${p.AREADESC ?? "unbekannt"}`, `Von: ${p.ONSET ?? "unbekannt"}`, `Bis: ${p.EXPIRES ?? "unbekannt"}`, String(p.DESCRIPTION ?? ""), String(p.INSTRUCTION ?? "")];
  return [`BNetzA-ID: ${p.register_id ?? "unbekannt"}`, `Ladepunkte: ${numeric(p.totalPoints ?? p.total_points ?? p.Anzahl_Ladepunkte)}`, `Nennleistung Einrichtung (kW): ${numeric(p.maxPowerKw ?? p.Nennleistung_Ladeeinrichtung__kW_)}`, `Register: ${p.register_source === "direct" ? "direkter BNetzA-Import" : "Esri · Juli 2026"}`, `Registeraktualisierung: ${p.sourceUpdatedAt ?? "unbekannt"}`, "Live-Belegung nicht verfügbar."];
}
