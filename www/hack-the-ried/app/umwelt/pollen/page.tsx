import Link from "next/link";
import { env } from "@/env";
import { pollenDays, POLLEN_NAMES, type PollenReading } from "@/lib/pollenForecasts";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pollenprognosen | HackTheRied" };
const number = (value: number | null) => value === null ? "fehlend" : value.toLocaleString("de-DE", { maximumFractionDigits: 1 });

export default async function PollenPage() {
  let rows: PollenReading[] = [];
  let available = true;
  let stale = false;
  let captured = "";
  try {
    const response = await fetch(new URL("/api/v1/environment/measurements/pollen", env.BACKEND_API_URL),
      { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Pollenprognosen nicht verfügbar");
    const body: { items: PollenReading[]; truncated: boolean; as_of: string; last_checked_at: string | null } = await response.json();
    if (body.truncated) throw new Error("Unvollständige Pollenprognose");
    rows = body.items; captured = body.last_checked_at ?? "";
    stale = !captured || Date.parse(body.as_of) - Date.parse(captured) > 9 * 3600_000;
  } catch { available = false; }
  const groups = new Map<string, PollenReading[]>();
  for (const row of rows) { const group = groups.get(row.entity_id) ?? []; group.push(row); groups.set(row.entity_id, group); }
  return <div className="min-h-screen flex flex-col"><SiteHeader />
    <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-10 space-y-8">
      <Link href="/umwelt" className="text-emerald-300 underline">Umwelt & Landwirtschaft</Link>
      <h1 className="text-3xl font-bold">Pollenprognosen im Ried</h1>
      <p className="max-w-3xl text-slate-300">Modellierte Pollenkonzentrationen von CAMS Europe / Open-Meteo für sechs Pollenarten.
        Jede Gemeinde hat einen Referenzpunkt im etwa 11 km großen Modellraster. Benachbarte Gemeinden können dieselbe Rasterzelle teilen.</p>
      <p className="text-sm text-slate-400">Während der Pollensaison sind etwa vier Prognosetage verfügbar.
        Fehlende Stunden bedeuten keine gemeldete Konzentration; eine gelieferte Null bleibt als Null sichtbar.
        Der Anbieter liefert keinen Ausgabezeitpunkt des Modelllaufs.</p>
      {!available || rows.length === 0 ? <p role="status" className="rounded-xl border border-slate-700 p-6">Aktuell keine gespeicherten Pollenprognosen verfügbar.</p> : null}
      {captured ? <p className="text-sm text-slate-300">Quellenprüfung: {new Date(captured).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · Ausgabezeitpunkt unbekannt.</p> : null}
      {stale && rows.length > 0 ? <p role="status" className="text-amber-300">Daten veraltet – seit mehr als neun Stunden nicht erfolgreich geprüft.</p> : null}
      {[...groups].map(([id, readings]) => {
        const point = readings[0].metadata;
        return <section key={id} className="rounded-xl border border-slate-700 p-5 space-y-4">
          <h2 className="text-xl font-semibold">{point.municipality}</h2>
          <p className="text-sm text-slate-400">Rasterkoordinaten: {point.latitude} / {point.longitude}</p>
          <div className="overflow-x-auto"><table className="w-full text-sm text-left">
            <caption className="text-left text-slate-300 mb-3">Tägliche Höchstwerte in Körnern/m³. Ein Tageswert benötigt 24 gültige Stunden (UTC).</caption>
            <thead><tr>{["Tag", "Pollenart", "Höchstwert", "Gültige Stunden"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
            <tbody>{pollenDays(readings).map(day => <tr key={`${day.date}-${day.species}`} className="border-t border-slate-800">
              <th scope="row" className="p-3 font-normal whitespace-nowrap">{day.date}</th><td className="p-3">{POLLEN_NAMES[day.species] ?? day.species}</td>
              <td className="p-3">{number(day.peak)}</td><td className="p-3">{day.hours}/24</td>
            </tr>)}</tbody>
          </table></div>
          <details><summary className="cursor-pointer text-emerald-300">Stündlicher Verlauf</summary><div className="max-h-96 overflow-auto mt-3">
            <table className="w-full text-sm text-left"><thead><tr>{["Zeit (UTC)", "Pollenart", "Körner/m³"].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
              <tbody>{readings.map((r, i) => <tr key={i}><td className="p-2 whitespace-nowrap">{r.valid_at.slice(0, 16).replace("T", " ")}</td>
                <td className="p-2">{POLLEN_NAMES[r.dimensions.species] ?? r.dimensions.species}</td><td className="p-2">{r.quality === "valid" ? number(r.value) : "fehlend"}</td></tr>)}</tbody>
            </table></div></details>
        </section>;
      })}
      <p className="text-sm text-slate-400">Quelle: <a href="https://open-meteo.com/en/docs/air-quality-api" className="underline">CAMS European Air Quality Forecasts, ENSEMBLE / Open-Meteo</a> · CC BY 4.0.
        Belastungsstufen werden erst mit belegten artspezifischen Schwellen ergänzt.</p>
    </main><SiteFooter /></div>;
}
