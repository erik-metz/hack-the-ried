"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const datasets = [
  ["environment/agriculture/stats", "Landwirtschaft"],
  ["environment/groundwater", "Grundwasser"],
  ["environment/protected-areas", "Naturschutz"],
  ["environment/flood/gauges", "Pegelstände"],
] as const;
type RecordValue = Record<string, string | number | null>;
export default function EnvironmentAgricultureWidget() {
  const [selected, setSelected] = useState<string>(datasets[0][0]);
  const [data, setData] = useState<RecordValue[] | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setData(null);
    async function load() {
      try {
        const response = await fetch(`/api/collected/${selected}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("Invalid data");
        if (!controller.signal.aborted) { setData(rows); setUpdated(response.headers.get("x-source-updated-at")); }
      } catch {
        if (!controller.signal.aborted) { setData(null); setUpdated(null); }
      }
      if (!controller.signal.aborted) timer = setTimeout(load, 60000);
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selected]);
  return <section className="rounded-3xl border border-slate-800 p-6 text-slate-200">
    <h3 className="text-xl font-bold">Umwelt & Landwirtschaft</h3>
    <Link href="/umwelt" className="text-sm text-emerald-400 underline">Amtliche Umwelt- und Flächenstatistik</Link>
    <div className="my-4 flex flex-wrap gap-3">{datasets.map(([id, label]) =>
      <button key={id} onClick={() => setSelected(id)} aria-pressed={selected === id} className="rounded border px-3 py-2">{label}</button>)}</div>
    {updated && <p className="mb-3 text-xs text-slate-400">Quellenstand: {new Date(updated).toLocaleString("de-DE")}</p>}
    {!data ? <p role="status">Aktuell keine gespeicherten Quelldaten verfügbar.</p> : data.length === 0 ? <p>Keine Einträge in der gespeicherten Quelle.</p> :
      <div className="grid gap-3 sm:grid-cols-2">{data.map((row, i) => <dl key={String(row.id ?? i)} className="rounded border border-slate-800 p-3">
        {Object.entries(row).filter(([key, value]) => !key.includes("url") && (typeof value === "number" || typeof value === "string")).map(([key, value]) =>
          <div key={key} className="flex justify-between gap-4 text-sm"><dt>{key}</dt><dd>{String(value)}</dd></div>)}
      </dl>)}</div>}
  </section>;
}
