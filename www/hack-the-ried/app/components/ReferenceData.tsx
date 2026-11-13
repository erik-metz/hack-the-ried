"use client";

import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import type { Map as LeafletMap, GeoJSON } from "leaflet";
import "leaflet/dist/leaflet.css";

type Source = { layer: string; title: string; checked_at: string; reference_date: string | null; count: number; attribution: string; license: string; url: string; note: string; stale: boolean; interval_seconds: number };
type Measurement = { metric: string; value: number | null; unit: string; observed_at: string; basis: string };
type Props = Record<string, unknown> & { name: string; measurements: Measurement[] };
type Snapshot = FeatureCollection<Geometry | null, Props> & { source: Source };
const labels: Record<string, string> = { geogenic_radon_potential: "Geogenes Radonpotenzial (dimensionslos)", durchschnMieteQM: "Durchschnittliche Nettokaltmiete", Eigentuemerquote: "Eigentümerquote", Leerstandsquote: "Leerstandsquote", additional_tropical_nights: "Zusätzliche Tropennächte durch Bebauung", groundwater_mean_depth: "Mittlerer Grundwasserflurabstand", property_tax_b_rate: "Grundsteuer B", land_value_county_median: "Kreismedian Bodenrichtwert", land_value_zone_count: "Richtwertzonen", rainfall_depth: "Starkregenhöhe", Einwohner: "Einwohner", Durchschnittsalter: "Durchschnittsalter" };
function date(value: string) { return new Date(value).toLocaleDateString("de-DE"); }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
const propertyLabels: Record<string,string> = { source_category: "Kategorie", ZONE: "Schutzzone", WSG_ID: "Schutzgebietskennung", STATUS_RPU: "Rechtlicher Status", POLY_NAME: "Gebiet", FL_RECUR: "Wiederkehrintervall (Jahre)", LB_Klasse: "Landbedeckung", LN_Klasse: "Landnutzung", LEG_TEXT: "Bodenbeschreibung", klartext_kurz: "Gestein", gkart_legtxt_stat: "Geologische Einheit", Hinweis: "Hinweis", export_date: "Exportstand", resolution_m: "Darstellungsraster (m)" };
function unit(value: string) { return value === "1" ? "" : value === "nights/year" ? "Nächte/Jahr" : value; }
function details(p: Props) {
  const block = document.createElement("div");
  const title = document.createElement("strong"); title.textContent = p.name; block.append(title);
  for (const [key, value] of Object.entries(p)) {
    if (!propertyLabels[key] || value == null || typeof value === "object") continue;
    const line = document.createElement("p"); line.textContent = `${propertyLabels[key]}: ${text(value)}`; block.append(line);
  }
  for (const m of p.measurements) {
    const line = document.createElement("p"); line.textContent = `${labels[m.metric] ?? m.metric}: ${m.value == null ? "unbekannt" : m.value.toLocaleString("de-DE")} ${unit(m.unit)} · Stand ${date(m.observed_at)}`; block.append(line);
  }
  return block;
}

export default function ReferenceData() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selected, setSelected] = useState("tax");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const geometry = useRef<GeoJSON | null>(null);
  const source = snapshot?.source;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reference", { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error();
      const body = await r.json();
      if (!Array.isArray(body.sources)) throw new Error();
      if (!controller.signal.aborted) setSources(body.sources);
    }).catch(() => { if (!controller.signal.aborted) setError("Quellenübersicht derzeit nicht verfügbar."); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/reference/${selected}`, { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error();
      const body = await r.json();
      if (body.type !== "FeatureCollection" || !Array.isArray(body.features) || !body.source) throw new Error();
      if (!controller.signal.aborted) setSnapshot(body);
    }).catch(() => { if (!controller.signal.aborted) setError("Diese Referenzdaten sind derzeit nicht vollständig verfügbar."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected, attempt]);
  useEffect(() => {
    if (!snapshot?.features.some(f => f.geometry) || !host.current) return;
    let cancelled = false;
    void import("leaflet").then(L => {
      if (cancelled || !host.current) return;
      if (!map.current) {
        map.current = L.map(host.current).setView([49.65,8.46], 11);
        // Regional basemap tiles are precollected by the VPS, no provider calls.
        L.tileLayer("/api/map-tiles/base/{z}/{x}/{y}", { maxZoom: 18, maxNativeZoom: 14, attribution: "© BKG · TopPlusOpen" }).addTo(map.current);
      }
      geometry.current?.remove();
      const features = snapshot.features.filter(f => f.geometry);
      geometry.current = L.geoJSON({ type: "FeatureCollection", features } as FeatureCollection, {
        style: { renderer: L.canvas(), color: "#10b981", weight: 1, fillOpacity: 0.18 },
        pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 5, color: "#38bdf8" }),
        onEachFeature: (f, layer) => layer.bindPopup(details(f.properties as Props)),
      }).addTo(map.current);
      // Border-intersecting source polygons can extend far beyond the Ried.
      map.current.fitBounds([[49.55, 8.35], [49.76, 8.58]], { maxZoom: 12 });
      map.current.invalidateSize();
    });
    return () => { cancelled = true; geometry.current?.remove(); };
  }, [snapshot]);
  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  const isSpatial = snapshot?.features.some(f => f.geometry) ?? false;
  return <section className="space-y-5">
    <label className="block">Datenebene
      <select className="mt-2 block w-full rounded border border-slate-600 bg-slate-900 p-3" value={selected} onChange={e => { setSelected(e.target.value); setSnapshot(null); setError(""); setLoading(true); }}>
        {sources.length ? sources.map(s => <option key={s.layer} value={s.layer}>{s.title}</option>) : <option value="tax">Grundsteuer-B-Hebesätze</option>}
      </select>
    </label>
    <p role="status">{loading ? "Gespeicherte Referenzdaten werden geladen …" : error || (source ? `${source.count} Datensätze · zuletzt geprüft ${date(source.checked_at)}${source.stale ? " · Quellenprüfung überfällig" : ""}` : "")}</p>
    {error ? <button className="underline" onClick={() => { setError(""); setLoading(true); setAttempt(n => n + 1); }}>Erneut versuchen</button> : null}
    {source ? <div className="rounded border border-slate-700 p-4 space-y-2"><h2 className="text-xl font-semibold">{source.title}</h2><p>{source.note}</p><p>{source.attribution}</p><p>Prüfintervall: {Math.round(source.interval_seconds / 86400)} Tage. Der Datenstand steht am jeweiligen Wert; das Prüfdatum ändert ihn nicht.</p><a className="underline" href={source.url} target="_blank" rel="noreferrer">Originalquelle</a><p>Lizenz: {source.license}</p></div> : null}
    <div ref={host} className={`h-[480px] rounded border border-slate-700 ${isSpatial ? "" : "hidden"}`} aria-label="Karte der ausgewählten Referenzdaten" />
    {snapshot ? <div className="space-y-3">{snapshot.features.slice(0,100).map(f => <article key={String(f.id)} className="rounded border border-slate-800 p-4"><h3 className="font-semibold">{f.properties.name}</h3>
      {f.properties.measurements.map(m => <p key={m.metric}>{labels[m.metric] ?? m.metric}: <strong>{m.value == null ? "unbekannt" : m.value.toLocaleString("de-DE")} {unit(m.unit)}</strong> · Stand {date(m.observed_at)} · {m.basis === "model" ? "modelliert" : "veröffentlicht"}</p>)}
      {selected === "catalogue" ? <><p>{text(f.properties.overlap) || "Zusätzliche Fachquelle; regionaler Export separat erforderlich."}</p><p>Status: {({ collected: "Auf der VPS erfasst", existing: "Bereits über andere Quellen angebunden", authentication_required: "Zusätzlicher Anbieterzugang erforderlich", no_hessen_coverage: "Keine bestätigte Ried-Abdeckung", export_required: "Regionaler Datenexport noch nicht angebunden" } as Record<string,string>)[text(f.properties.integration)] ?? "Unbekannt"} · Abdeckung laut Anbieter: {text(f.properties.coverage)}</p><p>{text(f.properties.source)}</p></> : <p>{["ZONE", "source_category", "LB_Klasse", "LN_Klasse", "basis", "model", "source_date", "stichtag", "LEG_TEXT", "klartext_kurz", "geometry_status"].map(k => text(f.properties[k])).filter(Boolean).join(" · ")}</p>}
    </article>)}{snapshot.features.length > 100 ? <p>Die Liste zeigt die ersten 100 Datensätze; die Karte enthält alle regionalen Geometrien.</p> : null}</div> : null}
  </section>;
}
