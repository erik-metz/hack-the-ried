"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Index = { mean: number | null; p10: number | null; p90: number | null; valid_pixels: number };
type Raster = { method: string; resolution_m: number; aoi_bbox: number[]; clear_fraction: number; indices: Record<string, Index>; archive_sha256: string };
type Scene = { id: string; sceneId: string; date: string; cloudCoverPercent: number; raster: Raster | null };
const format = (value: number | null | undefined) => value == null ? "fehlend" : value.toLocaleString("de-DE", { maximumFractionDigits: 3 });

export default function SatelliteEarthObservationSection() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState("Satellitendaten werden geladen …");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/satellite/scenes", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      setScenes(Array.isArray(data.scenes) ? data.scenes : []);
      setStatus(Array.isArray(data.scenes) && data.scenes.length ? "" : "Noch keine archivierten Sentinel-Szenen verfügbar.");
    }).catch(() => { if (!controller.signal.aborted) setStatus("Satellitendaten aktuell nicht verfügbar."); });
    return () => controller.abort();
  }, []);
  return <section id="satellit" className="space-y-5 scroll-mt-20">
    <h2 className="text-2xl font-bold">Sentinel-2: Vegetation und Feuchte</h2>
    <p className="text-slate-300 max-w-3xl">Die Indizes werden aus echten Reflexionsbändern im Ried-Ausschnitt berechnet. Wolken, Schatten und Schnee sind ausgeschlossen.
      Alle Bänder werden auf ein gemeinsames Raster mit 20 Metern Auflösung gebracht. Der Ausschnitt ist ein Rechteck von 8,33–8,58° Ost und 49,54–49,75° Nord; einzelne Szenen können ihn nur teilweise abdecken.</p>
    <p className="text-sm text-slate-400">NDVI beschreibt den Vegetationskontrast, NDWI den Grün-/Nahinfrarot-Kontrast und NDMI den Nahinfrarot-/SWIR-Kontrast.
      EVI und SAVI berücksichtigen weitere Einflüsse. Niedrige Werte allein belegen keine Dürre. Mittelwerte beziehen sich auf gültige Pixel der jeweiligen Szene und sind ohne gemeinsame Flächenmaske keine regionalen Trendwerte.</p>
    {status ? <p role="status" className="rounded-xl border border-slate-700 p-5">{status}</p> : null}
    {scenes.map(scene => <article key={scene.id} className="rounded-xl border border-slate-700 p-5 space-y-3">
      <h3 className="font-semibold">Aufnahme {scene.date} · {scene.sceneId}</h3>
      <p className="text-sm text-slate-400">Wolkenanteil der gesamten Quellszene: {format(scene.cloudCoverPercent)} %</p>
      {scene.raster?.method === "sentinel-c1-scl20-v1" ? <>
        <p>Auswertbarer Anteil des überdeckten Ausschnitts: {format(scene.raster.clear_fraction * 100)} %</p>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left">
          <caption className="text-left text-slate-400 mb-2">Pixelweise berechnet, danach gemittelt. P10/P90 beschreiben die räumliche Verteilung.</caption>
          <thead><tr>{["Index", "Mittel", "P10", "P90", "Gültige Pixel"].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
          <tbody>{Object.entries(scene.raster.indices).map(([name, index]) => <tr key={name} className="border-t border-slate-800">
            <th scope="row" className="p-2">{name.toUpperCase()}</th><td className="p-2">{format(index.mean)}</td><td className="p-2">{format(index.p10)}</td><td className="p-2">{format(index.p90)}</td><td className="p-2">{index.valid_pixels.toLocaleString("de-DE")}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="text-xs text-slate-400 break-all">Archivbeleg SHA-256: {scene.raster.archive_sha256}</p>
        <a className="text-emerald-300 underline" href={`/api/satellite/download?start=${scene.date}&end=${scene.date}&layer=all&format=zip`}>Rasterausschnitte und Indizes dieses Tages herunterladen</a>
      </> : <p role="status">Rasterindizes für diese Szene noch nicht berechnet.</p>}
    </article>)}
    <p className="text-sm text-slate-400">Quelle: Copernicus Sentinel-2 L2A über Earth Search. Fehlende Raster werden nicht durch Schätzungen ersetzt.</p>
    <Link href="/karte" className="text-emerald-300 underline">Echte RGB- und NDVI-Raster auf der Karte ansehen</Link>
  </section>;
}
