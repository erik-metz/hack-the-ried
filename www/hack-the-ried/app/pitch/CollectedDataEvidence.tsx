"use client";

import { useEffect, useState } from "react";
import { TrainFront, Bike, BusFront, Ship, PanelTopClose, RefreshCw } from "lucide-react";
import type { PitchWindowResult } from "@/lib/pitchWindow";

function time(value: string) { return new Date(value).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }); }
function number(value: number | null | undefined) { return value == null ? "—" : value.toLocaleString("de-DE"); }

export default function CollectedDataEvidence({ startedAt }: { startedAt: number }) {
  const [data, setData] = useState<PitchWindowResult | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const params = new URLSearchParams({ start: new Date(startedAt).toISOString() });
        const response = await fetch(`/api/pitch-window?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const next: PitchWindowResult = await response.json();
        if (!controller.signal.aborted) { setData(next); setError(false); }
      } catch {
        if (!controller.signal.aborted) { setData(null); setError(true); }
      }
      if (!controller.signal.aborted) timer = setTimeout(load, 30000);
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [startedAt, revision]);
  const crossings = data?.crossings;
  const bikes = data?.bikes;
  const traffic = [
    { id: "bus" as const, title: "Busse unterwegs", icon: BusFront, color: "text-sky-400", background: "bg-sky-400/10" },
    { id: "train" as const, title: "Züge unterwegs", icon: TrainFront, color: "text-violet-400", background: "bg-violet-400/10" },
    { id: "ship" as const, title: "Schiffe auf dem Rhein", icon: Ship, color: "text-amber-400", background: "bg-amber-400/10" },
  ];
  return <section className="space-y-4" aria-label="Bewegung im Ried seit Vortragsbeginn" aria-live="polite">
    {!data ? <div className="py-8 text-xl text-slate-300">
      <p>{error ? "Aktivitätsdaten derzeit nicht verfügbar" : "Bewegung im Ried wird abgefragt …"}</p>
      {error && <button type="button" onClick={() => setRevision((value) => value + 1)} className="mt-4 rounded-lg border border-slate-600 px-3 py-2 text-sm">Erneut laden</button>}
    </div> : <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold">Bahnübergänge</h3><span className="rounded-xl bg-orange-400/10 p-2 text-orange-400"><PanelTopClose className="h-7 w-7" aria-hidden="true" /></span></div>
          <div className="mt-3 grid grid-cols-2 gap-4"><div><p className="text-5xl font-bold text-emerald-400">{number(crossings?.available ? crossings.opened : null)}</p><p className="mt-1 text-lg text-slate-300">geöffnet</p></div><div><p className="text-5xl font-bold text-orange-400">{number(crossings?.available ? crossings.closed : null)}</p><p className="mt-1 text-lg text-slate-300">geschlossen</p></div></div>
          <p className="mt-3 text-sm text-slate-400">{crossings?.available ? `Seit Vortragsbeginn · modelliert${crossings.partial ? " · Teilzeitraum" : ""}` : "Historie momentan nicht verfügbar"}</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 lg:col-span-3" title="Aus Änderungen der Stationsbestände abgeleitet. Gleichzeitige Fahrten können unentdeckt bleiben; Umverteilungen können ebenfalls enthalten sein.">
          <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold">Leihräder</h3><span className="rounded-xl bg-teal-400/10 p-2 text-teal-400"><Bike className="h-7 w-7" aria-hidden="true" /></span></div>
          <div className="mt-3 grid grid-cols-2 gap-4"><div><p className="text-5xl font-bold text-teal-400">{number(bikes?.available ? bikes.removed : null)}</p><p className="mt-1 text-lg text-slate-300">entnommen</p></div><div><p className="text-5xl font-bold text-sky-400">{number(bikes?.available ? bikes.returned : null)}</p><p className="mt-1 text-lg text-slate-300">zurückgestellt</p></div></div>
          <p className="mt-3 text-sm text-slate-400">{bikes?.available ? `Seit Vortragsbeginn · aus Stationsbeständen abgeleitet${bikes.partial ? " · Teilzeitraum" : ""}` : "Stationshistorie momentan nicht verfügbar"}</p>
        </article>
        {traffic.map(({ id, title, icon: Icon, color, background }) => {
          const activity = data.moving?.[id];
          return <article key={id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">{title}</h3><span className={`rounded-xl p-2 ${background} ${color}`}><Icon className="h-6 w-6" aria-hidden="true" /></span></div>
            <p className={`mt-3 text-5xl font-bold ${color}`}>{number(activity?.count)}</p>
            <p className="mt-2 text-sm text-slate-400">{!activity?.available ? "Quelle momentan nicht verfügbar" : id === "ship" ? "Aktuell in Fahrt · AIS-Positionen" : activity.estimated > 0 ? `Aktuell im Ried · ${activity.estimated} laut Fahrplan` : "Aktuell in Fahrt · erfasste Positionen"}</p>
          </article>;
        })}
      </div>
      <div className="flex items-center justify-between text-sm text-slate-500"><p>Vortragsbeginn {time(data.startedAt)} · Stand {time(data.checkedAt)}</p><button type="button" onClick={() => setRevision((value) => value + 1)} aria-label="Aktivitätsdaten aktualisieren" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"><RefreshCw className="h-4 w-4" aria-hidden="true" /></button></div>
    </>}
  </section>;
}
