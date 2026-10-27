import Link from "next/link";
import { env } from "@/env";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strommarkt Deutschland | HackTheRied" };
const PRODUCTS = { price: "Day-ahead-Preise", load: "Veröffentlichte Gesamtlast", generation: "Erzeugung nach Energieträger" };
type Product = keyof typeof PRODUCTS;
type Reading = { entity_id: string; metric: string; unit: string; value: number | null; quality: string; period_start: string; period_end: string;
  metadata: { area_label: string; area_eic: string };
  dimensions: { direction?: string; psr_type?: string; series_id: string; resolution: string };
  provenance: { document_id: string; document_revision: string; document_created_at: string } };
type Data = { items: Reading[]; stored_intervals: number; has_more: boolean; last_checked_at: string | null; as_of: string };
const PSR: Record<string, string> = { B01: "Biomasse", B02: "Braunkohle", B03: "Kohlegas", B04: "Erdgas", B05: "Steinkohle", B06: "Öl", B07: "Ölschiefer", B08: "Torf", B09: "Geothermie", B10: "Pumpspeicher", B11: "Laufwasser", B12: "Wasserspeicher", B13: "Meeresenergie", B14: "Kernenergie", B15: "Sonstige Erneuerbare", B16: "Solar", B17: "Abfall", B18: "Wind Offshore", B19: "Wind Onshore", B20: "Sonstige", B25: "Energiespeicher" };
const timestamp = (value: string) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", timeZoneName: "short" });

export default async function EnergyMarketPage({ searchParams }: { searchParams: Promise<{ product?: string; offset?: string }> }) {
  const params = await searchParams;
  const product: Product = params.product === "load" || params.product === "generation" ? params.product : "price";
  const requested = Number(params.offset ?? 0);
  const offset = Number.isInteger(requested) && requested >= 0 && requested <= 20000 ? requested : 0;
  let data: Data | null = null;
  try {
    const url = new URL("/api/v1/environment/measurements/energy", env.BACKEND_API_URL);
    url.searchParams.set("product", product); url.searchParams.set("limit", "100"); url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Strommarktdaten nicht verfügbar");
    data = await response.json();
  } catch { data = null; }
  const stale = data?.last_checked_at && Date.parse(data.as_of)-Date.parse(data.last_checked_at)>3*3600_000;
  return <div className="min-h-screen flex flex-col"><SiteHeader /><main className="flex-1 mx-auto w-full max-w-7xl px-4 py-10 space-y-6">
    <Link href="/umwelt" className="text-emerald-300 underline">Umwelt & Landwirtschaft</Link>
    <h1 className="text-3xl font-bold">Strommarkt Deutschland</h1>
    <p className="max-w-3xl text-slate-300">ENTSO-E veröffentlicht Börsenpreise für die Gebotszone Deutschland–Luxemburg sowie Last und Erzeugung für Deutschland.
      Diese Daten beschreiben den überregionalen Strommarkt. Sie geben keine lokale Stromerzeugung einzelner Anlagen im Ried an.</p>
    <p className="text-sm text-slate-400">Day-ahead-Preise in EUR/MWh sind Großhandelspreise für den Folgetag; sie enthalten keine Netzentgelte, Steuern oder Endkundentarife.
      Negative Preise bleiben sichtbar. Last und Erzeugung in MW sind Leistung, keine Energiemenge in MWh. Veröffentlichte Istwerte können Schätzungen enthalten.</p>
    <nav aria-label="Strommarktdaten" className="flex flex-wrap gap-5">{Object.entries(PRODUCTS).map(([key, title]) => <Link key={key} href={`/energie/markt?product=${key}`} aria-current={product===key ? "page" : undefined} className="text-emerald-300 underline">{title}</Link>)}</nav>
    <h2 className="text-xl font-semibold">{PRODUCTS[product]}</h2>
    <p>Gebietsbezug: {product === "price" ? "Deutschland–Luxemburg (10Y1001A1001A82H)" : "Deutschland (10Y1001A1001A83F)"}</p>
    {!data?.last_checked_at ? <p role="status" className="rounded-xl border border-slate-700 p-6">Aktuell keine gespeicherten Daten für dieses Produkt verfügbar.</p> : <>
      <p className="text-sm text-slate-300">Quellenprüfung: {timestamp(data.last_checked_at)} · {data.stored_intervals.toLocaleString("de-DE")} sichtbare Intervalle im gespeicherten Stand.</p>
      {stale ? <p role="status" className="text-amber-300">Daten veraltet – seit mehr als drei Stunden nicht erfolgreich geprüft.</p> : null}
      {data.items.length === 0 ? <p role="status">Keine sichtbaren Intervalle auf dieser Seite.</p> : null}
      <div className="overflow-x-auto"><table className="w-full text-sm text-left">
        <caption className="text-left text-slate-300 mb-3">Originale Marktintervalle, neueste zuerst. Zeiten enthalten die Sommer-/Winterzeitzone; fehlende Werte bleiben fehlend.</caption>
        <thead><tr>{["Beginn", "Ende", "Wert", "Einheit", "Energieträger / Richtung", "Veröffentlichung"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{data.items.map((row, index) => <tr key={`${row.period_start}-${row.dimensions.series_id}-${index}`} className="border-t border-slate-800">
          <th scope="row" className="p-3 font-normal whitespace-nowrap">{timestamp(row.period_start)}</th><td className="p-3 whitespace-nowrap">{timestamp(row.period_end)}</td>
          <td className="p-3">{row.quality === "valid" && row.value !== null ? row.value.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "fehlend"}</td><td className="p-3">{row.unit}</td>
          <td className="p-3">{row.dimensions.psr_type ? `${PSR[row.dimensions.psr_type] ?? row.dimensions.psr_type} · ` : ""}{row.dimensions.direction === "consumption" ? "Verbrauch" : row.dimensions.direction === "generation" ? "Erzeugung" : "–"}</td>
          <td className="p-3"><details><summary className="cursor-pointer">Dokument & Revision</summary><p>{row.provenance.document_id} · Revision {row.provenance.document_revision}</p><p>Dokument erstellt: {timestamp(row.provenance.document_created_at)}</p><p>Zeitreihe: {row.dimensions.series_id} · {row.dimensions.resolution}</p></details></td>
        </tr>)}</tbody>
      </table></div>
      <nav aria-label="Intervallseiten" className="flex gap-6">
        {offset>0 ? <Link className="underline" href={`/energie/markt?product=${product}&offset=${Math.max(0,offset-100)}`}>Vorherige Seite</Link> : null}
        {data.has_more ? <Link className="underline" href={`/energie/markt?product=${product}&offset=${offset+100}`}>Weitere Intervalle</Link> : null}
      </nav>
    </>}
    <p className="text-sm text-slate-400">Quelle: <a className="underline" href="https://transparency.entsoe.eu">ENTSO-E Transparency Platform und meldende Datenlieferanten</a> · CC BY 4.0.
      Blockkurven werden entsprechend ihrer gemeldeten Auflösung in Intervalle aufgeteilt. Erzeugungsreihen und Speicherverbrauch bleiben getrennt; es wird keine pauschale Gesamtsumme berechnet.</p>
  </main><SiteFooter /></div>;
}
