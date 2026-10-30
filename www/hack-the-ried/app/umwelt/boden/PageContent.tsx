"use client";
import Link from "next/link";
import { usePublicDatasets } from "@/lib/hooks/usePublicDatasets";
import PublicPageLoading from "../../components/PublicPageLoading";
import { soilDays, type SoilReading } from "@/lib/soilForecasts";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

const number = (value: number | null, digits = 1) => value === null ? "–" : value.toLocaleString("de-DE", { maximumFractionDigits: digits });

export default function SoilPage() {
  const publication = usePublicDatasets<[{ items: SoilReading[]; truncated: boolean; as_of: string; last_checked_at: string | null }]>(["environment/measurements/soil"], 60000);
  if (!publication) return <PublicPageLoading title="Bodenprognosen" />;
  let rows: SoilReading[] = [];
  let available = false;
  let checkedAt = 0;
  let verifiedAt = 0;
  const result = publication.results[0];
  if (result.status === "fulfilled" && !result.value.truncated) {
    const body = result.value;
    available = true;
    rows = body.items;
    checkedAt = Date.parse(new Date(publication.loadedAt).toISOString());
    verifiedAt = body.last_checked_at ? Date.parse(body.last_checked_at) : 0;
  }
  const groups = new Map<string, SoilReading[]>();
  for (const row of rows) {
    const group = groups.get(row.entity_id) ?? [];
    group.push(row); groups.set(row.entity_id, group);
  }
  return <div className="min-h-screen flex flex-col">
    <SiteHeader />
    <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-10 space-y-8">
      <Link href="/umwelt" className="text-emerald-300 underline">Umwelt & Landwirtschaft</Link>
      <h1 className="text-3xl font-bold">Boden & Verdunstung im Ried</h1>
      <p className="max-w-3xl text-slate-300">Sieben Tage Modellprognosen von DWD ICON Global / Open-Meteo.
        Jeder Gemeinde ist ein Referenzpunkt zugeordnet. Das Raster ist etwa 11 km groß;
        benachbarte Gemeinden können dieselbe Rasterzelle teilen. Die Werte beschreiben Modellbedingungen.</p>
      {!available || rows.length === 0 ? <p role="status" className="rounded-xl border border-slate-700 p-6">
        Aktuell keine gespeicherten Bodenprognosen verfügbar.</p> : null}
      {[...groups].map(([id, readings]) => {
        const first = readings[0];
        const collected = readings.reduce((latest, r) => r.collected_at > latest ? r.collected_at : latest, first.collected_at);
        const stale = checkedAt - verifiedAt > 3 * 3600_000 || checkedAt - Date.parse(first.dimensions.issued_at) > 18 * 3600_000;
        return <section key={id} className="rounded-xl border border-slate-700 p-5 space-y-4">
          <h2 className="text-xl font-semibold">{first.metadata.municipality}</h2>
          <p className="text-sm text-slate-300">Modelllauf: {new Date(first.dimensions.issued_at).toLocaleString("de-DE", { timeZone: "UTC" })} UTC ·
            Raster: {number(first.metadata.latitude, 4)} / {number(first.metadata.longitude, 4)} ·
            Abgerufen: {new Date(collected).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
          </p>
          {stale ? <p role="status" className="text-amber-300">Daten veraltet – die Quellenprüfung oder der Modelllauf ist nicht mehr aktuell.</p> : null}
          <div className="overflow-x-auto"><table className="w-full text-sm text-left">
            <caption className="text-left text-slate-400 mb-3">Tageswerte nach UTC. Mittelwerte für Boden/Strahlung, Summen für Verdunstung.</caption>
            <thead><tr>{["Tag", "Bodenfeuchte 0–1 cm (m³/m³)", "Bodentemperatur 0 cm (°C)", "ET₀ (mm)", "Verdunstung (mm)", "Strahlung (W/m²)"].map(label =>
              <th key={label} scope="col" className="p-3 border-b border-slate-700">{label}</th>)}</tr></thead>
            <tbody>{soilDays(readings).map(day => <tr key={day.date}>
              <th scope="row" className="p-3 font-normal whitespace-nowrap">{day.date}</th>
              {[number(day.moisture, 3), number(day.temperature), number(day.et0), number(day.evaporation), number(day.radiation)].map((value, i) =>
                <td key={i} className="p-3 border-b border-slate-800">{value}</td>)}
            </tr>)}</tbody>
          </table></div>
          <details><summary className="cursor-pointer text-emerald-300">Stündlicher Verlauf und weitere Bodentiefen</summary>
            <div className="max-h-96 overflow-auto mt-3"><table className="w-full text-sm text-left">
              <thead><tr>{["Zeit (UTC)", "Messgröße", "Tiefe (cm)", "Wert", "Einheit"].map(label =>
                <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
              <tbody>{readings.map((r, i) => <tr key={i}>
                <td className="p-2 whitespace-nowrap">{r.valid_at.slice(0, 16).replace("T", " ")}</td>
                <td className="p-2">{({ soil_moisture: "Bodenfeuchte", soil_temperature: "Bodentemperatur", reference_evapotranspiration: "ET₀", evapotranspiration: "Verdunstung", shortwave_radiation: "Strahlung" } as Record<string, string>)[r.metric] ?? r.metric}</td>
                <td className="p-2">{r.dimensions.depth_start_cm !== undefined ? `${r.dimensions.depth_start_cm}–${r.dimensions.depth_end_cm}` : r.dimensions.depth_cm ?? "–"}</td>
                <td className="p-2">{r.quality === "valid" ? number(r.value, 3) : "fehlend"}</td><td className="p-2">{r.unit}</td>
              </tr>)}</tbody></table></div>
          </details>
        </section>;
      })}
      <p className="text-sm text-slate-400">Ein Strich bedeutet fehlende Stunden oder einen unvollständigen Tag. ET₀ ist die Referenzverdunstung.
        Strahlung ist über die vorherige Stunde gemittelt; Verdunstung beschreibt deren Summe.
        Diese Übersicht liefert keine automatische Bewässerungsempfehlung.
        Quelle: <a href="https://open-meteo.com/en/docs/single-runs-api" className="underline">DWD ICON / Open-Meteo</a> · CC BY 4.0.</p>
    </main><SiteFooter />
  </div>;
}
