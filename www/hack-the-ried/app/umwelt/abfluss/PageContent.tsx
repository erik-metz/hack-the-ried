"use client";
import Link from "next/link";
import { usePublicDatasets } from "@/lib/hooks/usePublicDatasets";
import PublicPageLoading from "../../components/PublicPageLoading";
import { dischargeDays, type DischargeReading } from "@/lib/dischargeForecasts";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

const number = (value: number | null) => value === null ? "fehlend" : value.toLocaleString("de-DE", { maximumFractionDigits: 1 });

export default function DischargePage() {
  const publication = usePublicDatasets<[{ items: DischargeReading[]; truncated: boolean; as_of: string; last_checked_at: string | null }]>(["environment/measurements/discharge"], 60000);
  if (!publication) return <PublicPageLoading title="Abflussprognosen" />;
  let rows: DischargeReading[] = [];
  let available = false;
  let stale = false;
  let captured = "";
  const result = publication.results[0];
  if (result.status === "fulfilled" && !result.value.truncated) {
    const body = result.value;
    available = true;
    rows = body.items; captured = body.last_checked_at ?? "";
    stale = !captured || Date.parse(new Date(publication.loadedAt).toISOString()) - Date.parse(captured) > 72 * 3600_000;
  }
  const groups = new Map<string, DischargeReading[]>();
  for (const row of rows) { const group = groups.get(row.entity_id) ?? []; group.push(row); groups.set(row.entity_id, group); }
  return <div className="min-h-screen flex flex-col"><SiteHeader /><main className="flex-1 mx-auto w-full max-w-7xl px-4 py-10 space-y-6">
    <Link href="/umwelt" className="text-emerald-300 underline">Umwelt & Landwirtschaft</Link>
    <h1 className="text-3xl font-bold">Abflussprognosen bei Worms</h1>
    <p className="max-w-3xl text-slate-300">GloFAS v4 / Open-Meteo modelliert den täglichen Flussabfluss für die nächsten 14 Tage.
      Abfluss in m³/s beschreibt die Wassermenge pro Sekunde. Die Werte sind Modellprognosen; der gemessene Pegelstand ist eine andere Größe.</p>
    <p className="max-w-3xl text-amber-200">Die Zuordnung dieser etwa 5 km großen Rasterzelle zum Rhein ist noch nicht anhand des Modell-Flussnetzes bestätigt.
      Die Prognose dient als Modellübersicht und liefert keine amtliche Hochwasserwarnung oder lokale Alarmstufe.</p>
    <p className="text-sm text-slate-400">P25–P75 umfasst die mittleren 50 % der Ensemblewerte. Minimum und Maximum zeigen die Spannweite der Modellmitglieder,
      nicht die Tagesextrema eines gemessenen Pegels. Diese Spannen sind keine garantierten Grenzen.</p>
    {!available || rows.length === 0 ? <p role="status" className="rounded-xl border border-slate-700 p-6">Aktuell keine gespeicherten Abflussprognosen verfügbar.</p> : null}
    {captured ? <p className="text-sm text-slate-300">Quellenprüfung: {new Date(captured).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · Ausgabezeitpunkt des Modelllaufs unbekannt.</p> : null}
    {stale && rows.length > 0 ? <p role="status" className="text-amber-300">Daten veraltet – seit mehr als drei Tagen nicht erfolgreich geprüft.</p> : null}
    {[...groups].map(([id, readings]) => <section key={id} className="rounded-xl border border-slate-700 p-5 space-y-4">
      <h2 className="text-xl font-semibold">{readings[0].metadata.reference_point}</h2>
      <p className="text-sm text-slate-400">Modellraster: {readings[0].metadata.latitude}° N / {readings[0].metadata.longitude}° E · Gewässerzuordnung ungeprüft.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left">
        <caption className="text-left text-slate-300 mb-3">Tägliche Abflussprognosen in m³/s (UTC). Alle Angaben stammen aus demselben gespeicherten Prognosestand.</caption>
        <thead><tr>{["Tag", "Median", "P25", "P75", "Minimum", "Maximum", "Ensemble-Mittel", "Kontrolllauf"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{dischargeDays(readings).map(day => <tr key={day.date} className="border-t border-slate-800">
          <th scope="row" className="p-3 font-normal whitespace-nowrap">{day.date}</th>
          {[day.median, day.p25, day.p75, day.min, day.max, day.mean, day.control].map((value, index) => <td key={index} className="p-3">{number(value)}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>)}
    <section className="space-y-2"><h2 className="text-xl font-semibold">Amtliche Pegel und Hochwasserinformationen</h2>
      <p><a className="text-emerald-300 underline" href="https://www.pegelonline.wsv.de">PEGELONLINE der Wasserstraßen- und Schifffahrtsverwaltung</a></p>
      <p><a className="text-emerald-300 underline" href="https://hochwasser.hessen.de">Hochwasserportal Hessen</a></p>
    </section>
    <p className="text-sm text-slate-400">Quelle: <a className="underline" href="https://open-meteo.com/en/docs/flood-api">Copernicus CEMS GloFAS / Open-Meteo</a> · CC BY 4.0.
      Fehlende Werte bleiben fehlend; eine gelieferte Null bleibt Null.</p>
  </main><SiteFooter /></div>;
}
