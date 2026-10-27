"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const EcostressMap = dynamic(() => import("./EcostressMap"), { ssr: false, loading: () => <p>Karte wird geladen …</p> });

type Stats = { mean_celsius: number | null; p10_celsius: number | null; p90_celsius: number | null; valid_pixels: number; valid_fraction: number };
type Scene = { id: string; acquired_at: string; tile: string; raster: { method: string; stats: Stats; archive_sha256: string } | null; raster_status?: string };
const temperature = (value: number | null) => value === null ? "keine gültigen Pixel" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} °C`;

export default function EcostressSection() {
  const [selectedId, setSelectedId] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState("ECOSTRESS-Aufnahmen werden geladen …");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ecostress/scenes", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      if (!Array.isArray(data.scenes)) throw new Error("invalid");
      setScenes(data.scenes);
      setStatus(data.scenes.length ? "" : "Noch keine ECOSTRESS-Aufnahmen archiviert.");
    }).catch(() => { if (!controller.signal.aborted) setStatus("ECOSTRESS-Daten aktuell nicht verfügbar."); });
    return () => controller.abort();
  }, []);
  const available = scenes.filter(scene => scene.raster?.method === "ecostress-v003-clear-land70-v1" && scene.raster.stats.valid_pixels > 0);
  const activeId = available.some(scene => scene.id === selectedId) ? selectedId : available[0]?.id;
  return <section id="ecostress" className="space-y-4 scroll-mt-20">
    <h2 className="text-2xl font-bold">ECOSTRESS: Oberflächentemperatur</h2>
    <p className="text-slate-300 max-w-3xl">Die Aufnahme beschreibt die Temperatur der Oberfläche zum Überflugzeitpunkt. Ausgewertet werden wolkenfreie Landpixel mit guter Qualität auf dem ursprünglichen 70-Meter-Raster. Der rechteckige Ried-Ausschnitt kann je Kachel nur teilweise überdeckt sein.</p>
    <p className="text-sm text-slate-400">Aufnahmezeiten und gültige Flächen unterscheiden sich. Die Werte sind keine Lufttemperaturen; Tagesunterschiede allein belegen keinen Temperaturtrend.</p>
    {status ? <p role="status">{status}</p> : null}
    {activeId ? <div className="space-y-3">
      <label className="block" htmlFor="ecostress-scene">Aufnahme für die Temperaturkarte</label>
      <select id="ecostress-scene" value={activeId} onChange={event => setSelectedId(event.target.value)} className="rounded border border-slate-600 bg-slate-900 p-2">
        {available.map(scene => <option key={scene.id} value={scene.id}>{new Date(scene.acquired_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · {scene.tile}</option>)}
      </select>
      <EcostressMap key={activeId} sceneId={activeId} />
    </div> : null}
    {scenes.map(scene => <article key={scene.id} className="rounded-xl border border-slate-700 p-5 space-y-2">
      <h3 className="font-semibold">{new Date(scene.acquired_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · Kachel {scene.tile}</h3>
      {scene.raster?.method === "ecostress-v003-clear-land70-v1" ? <>
        <p>Mittlere Oberflächentemperatur: {temperature(scene.raster.stats.mean_celsius)}</p>
        <p className="text-sm">P10: {temperature(scene.raster.stats.p10_celsius)} · P90: {temperature(scene.raster.stats.p90_celsius)} · Gültige Landpixel: {scene.raster.stats.valid_pixels.toLocaleString("de-DE")} ({(scene.raster.stats.valid_fraction * 100).toFixed(1)} % des überdeckten Ausschnitts)</p>
        <a className="text-emerald-300 underline" href={`/api/ecostress/crop/${encodeURIComponent(scene.id)}`}>Temperaturraster und Qualitätsmasken herunterladen</a>
      </> : <p role="status">{scene.raster_status === "not_configured" ? "Aufnahme im NASA-Katalog gefunden. Der geschützte Rasterzugang ist noch nicht eingerichtet." : scene.raster_status === "failed" ? "Der Rasterimport ist fehlgeschlagen. Für diese Aufnahme liegen keine ausgewerteten Temperaturen vor." : "Temperaturraster für diese Aufnahme noch nicht ausgewertet."}</p>}
    </article>)}
    <p className="text-sm text-slate-400">Quelle: <a className="underline" href="https://doi.org/10.5067/ECOSTRESS/ECO_L2T_LSTE.003">NASA ECOSTRESS L2T LSTE, Version 003</a>. Zwei Kacheln desselben Überflugs zählen als zwei Einträge.</p>
  </section>;
}
