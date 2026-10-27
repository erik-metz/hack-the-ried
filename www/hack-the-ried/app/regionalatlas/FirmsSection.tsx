"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const FirmsMap = dynamic(() => import("./FirmsMap"), { ssr: false, loading: () => <p>Karte wird geladen …</p> });

export type Detection = { id: string; latitude: number; longitude: number; acquired_at: string; confidence: "l" | "n" | "h"; frp_mw: number; satellite: string; instrument: string; version: string; scan_km: number; track_km: number };
type Publication = { status: string; fetched_at?: string; last_successful_fetch_at?: string | null; detections: Detection[]; count: number };
export const confidenceLabel = { l: "niedrig", n: "nominal", h: "hoch" };
export const formatFirmsTime = (time: string) => new Date(time).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
const states: Record<string, string> = {
  not_configured: "Der NASA-FIRMS-Zugang ist noch nicht eingerichtet.",
  not_collected: "Noch kein NASA-FIRMS-Abruf archiviert.",
  failed: "Der letzte FIRMS-Abruf ist fehlgeschlagen. Die Anzeige enthält gegebenenfalls ältere Daten.",
  stale: "Der letzte erfolgreiche FIRMS-Abruf ist veraltet. Die Anzeige enthält ältere Daten.",
};

export default function FirmsSection() {
  const [days, setDays] = useState("3");
  const [publication, setPublication] = useState<Publication | null>(null);
  const [message, setMessage] = useState("FIRMS-Daten werden geladen …");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/firms?days=${days}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const data: Publication = await response.json();
      if (!Array.isArray(data.detections) || typeof data.status !== "string") throw new Error("invalid");
      setPublication(data);
      setMessage(states[data.status] ?? (data.status === "success" ? (data.count ? "" : "Erfolgreicher Abruf: keine thermischen Anomalien im gewählten Zeitraum gemeldet. Das belegt keine Brandfreiheit.") : "FIRMS-Daten aktuell nicht verfügbar."));
    }).catch(() => { if (!controller.signal.aborted) { setPublication(null); setMessage("FIRMS-Daten aktuell nicht verfügbar."); } });
    return () => controller.abort();
  }, [days]);
  return <section id="firms" className="space-y-4 scroll-mt-20">
    <h2 className="text-2xl font-bold">NASA FIRMS: thermische Anomalien</h2>
    <p className="max-w-3xl text-slate-300">NOAA-20/VIIRS meldet auffällig warme Satellitenpixel. Die Punkte sind keine bestätigten Brände; diese Anzeige bietet keine Warnfunktion. Erfasst wird das Rechteck 8,33–8,58° Ost und 49,54–49,75° Nord.</p>
    <p className="text-sm text-slate-400">Die Punkte zeigen ungefähr die Mitte eines nominell 375 Meter großen Pixels. Konfidenz ist eine Qualitätsklasse, keine Brandwahrscheinlichkeit. FRP ist die Strahlungsleistung des Pixels in Megawatt; sie beschreibt weder Brandfläche noch Oberflächentemperatur.</p>
    <label htmlFor="firms-days" className="block">Zeitraum (Kalendertage in UTC)</label>
    <select id="firms-days" value={days} onChange={event => { setPublication(null); setMessage("FIRMS-Daten werden geladen …"); setDays(event.target.value); }} className="rounded border border-slate-600 bg-slate-900 p-2">
      <option value="1">Heute</option><option value="2">Heute und gestern</option><option value="3">Heute und zwei vorherige Tage</option>
    </select>
    {message ? <p role="status">{message}</p> : null}
    {publication?.last_successful_fetch_at ? <p className="text-sm">Letzter erfolgreicher Abruf: {formatFirmsTime(publication.last_successful_fetch_at)} (Europe/Berlin)</p> : null}
    {publication?.detections.length ? <>
      <FirmsMap detections={publication.detections} />
      <p>{publication.count.toLocaleString("de-DE")} gemeldete Pixel; keine Zusammenfassung zu Brandereignissen.</p>
      <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Archivierte thermische Anomalien</caption><thead><tr><th scope="col">Aufnahme (Europe/Berlin)</th><th scope="col">Konfidenz</th><th scope="col">FRP (MW)</th><th scope="col">Satellit</th></tr></thead><tbody>{publication.detections.map(point => <tr key={point.id}><td>{formatFirmsTime(point.acquired_at)}</td><td>{confidenceLabel[point.confidence]}</td><td>{point.frp_mw.toLocaleString("de-DE")}</td><td>{point.satellite} / {point.instrument}</td></tr>)}</tbody></table></div>
    </> : null}
    {publication?.last_successful_fetch_at ? <a className="text-emerald-300 underline" href={`/api/firms/download?days=${days}`}>Anomalien mit Herkunft und Zeitbezug als JSON herunterladen</a> : null}
    <p className="text-sm text-slate-400">Quelle: <a className="underline" href="https://firms.modaps.eosdis.nasa.gov/">NASA LANCE FIRMS</a>, VIIRS_NOAA20_NRT. Abruf stündlich; die Bereitstellung nach einem Überflug kann verzögert sein. Fehlende Meldungen werden nicht ergänzt.</p>
  </section>;
}
