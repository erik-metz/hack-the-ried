import Link from "next/link";
import { env } from "@/env";

type Observation = {
  id: number; scientific_name: string; taxon_rank: string; observed_on: string;
  quality_grade: "research" | "needs_id" | "casual"; source_url: string;
  coordinate_uncertainty_m: number | null; license: string; license_url: string;
  attribution: string | null; gbif_ids: number[];
};
type Data = {
  status: string; observations: Observation[]; matched: number; scanned: number;
  count: number; additional_count: number; gbif_overlap_count: number; truncated: boolean;
  fetched_at: string; has_more: boolean; deduplication?: { status: string; origin_records_inspected?: number; gbif_records?: number };
};
const QUALITY = { research: "Forschungsqualität", needs_id: "Bestimmung ausstehend", casual: "Sonstige Meldung" };
const LICENSE = { cc0: "CC0", "cc-by": "CC BY 4.0", "cc-by-sa": "CC BY-SA 4.0" };

export async function loadInaturalist(offset: number, includeDuplicates: boolean): Promise<Data | null> {
  try {
    const url = new URL("/api/v1/environment/measurements/inaturalist", env.BACKEND_API_URL);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("include_duplicates", String(includeDuplicates));
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return response.ok ? await response.json() as Data : null;
  } catch { return null; }
}

export default async function InaturalistSection({ dataPromise, offset, includeDuplicates }: {
  dataPromise: Promise<Data | null>; offset: number; includeDuplicates: boolean;
}) {
  const data = await dataPromise;
  const query = (nextOffset: number, duplicates = includeDuplicates) =>
    `/umwelt/biodiversitaet?inat_offset=${nextOffset}&inat_duplicates=${duplicates ? "1" : "0"}#inaturalist`;
  return <section id="inaturalist" className="space-y-4 border-t border-slate-700 pt-8">
    <h2 className="text-2xl font-semibold">iNaturalist: weitere öffentliche Fundmeldungen</h2>
    <p className="max-w-3xl text-slate-300">Suchgebiet: 49,54–49,75° Nord und 8,33–8,58° Ost. Dieser Ausschnitt unterscheidet sich vom GBIF-Suchgebiet oben.
      Täglich werden höchstens 2.000 Meldungen neu auf Lizenz und öffentliche Positionsfreigabe geprüft. Private, verschleierte oder taxonomisch geschützte Positionen sind ausgeschlossen.</p>
    <p className="max-w-3xl text-slate-300">Die Qualitätsstufe stammt von iNaturalist und ist keine Bestandsbewertung. Fotos, Töne, Beschreibungen und Personenprofile werden nicht übernommen.
      Der öffentliche Benutzername dient bei CC BY und CC BY-SA ausschließlich der erforderlichen Namensnennung. Angezeigt wird der bekannte Fundtag, ohne angenommene Uhrzeit.</p>
    {!data || data.status !== "success" ? <p role="status" className="rounded-xl border border-slate-700 p-6">
      {data?.status === "failed" ? "Quellenprüfung fehlgeschlagen; frühere iNaturalist-Meldungen wurden zurückgezogen." : data?.status === "stale" ? "Quellenprüfung veraltet; Positionen werden bis zur erneuten Prüfung nicht veröffentlicht." : "Aktuell keine geprüfte iNaturalist-Veröffentlichung verfügbar."}
    </p> : <>
      <p>Quellenprüfung: {new Date(data.fetched_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · {data.matched.toLocaleString("de-DE")} API-Treffer,
        {" "}{data.scanned.toLocaleString("de-DE")} abgerufen, {data.count.toLocaleString("de-DE")} freigegebene Meldungen.</p>
      <p>{data.gbif_overlap_count.toLocaleString("de-DE")} eindeutige Überschneidungen mit dem gespeicherten GBIF-Ausschnitt;
        {" "}{data.additional_count.toLocaleString("de-DE")} ohne dort nachgewiesenen Herkunftslink. Das belegt keine weltweite GBIF-Freiheit.</p>
      {data.deduplication?.status !== "checked" ? <p role="status" className="text-amber-300">Der GBIF-Abgleich ist {data.deduplication?.status === "partial" ? "nur teilweise möglich" : "derzeit nicht verfügbar"}. Unsichere Ähnlichkeiten werden nicht als Duplikate entfernt.</p> : null}
      {data.truncated ? <p role="status" className="text-amber-300">Der Abruf ist begrenzt oder die Quelle hat sich während der Abfrage geändert. Angezeigt wird ein unvollständiger Ausschnitt.</p> : null}
      <div className="flex flex-wrap gap-5">
        <Link className="underline" href={query(0, !includeDuplicates)}>{includeDuplicates ? "Nachgewiesene GBIF-Überschneidungen ausblenden" : "Auch nachgewiesene GBIF-Überschneidungen anzeigen"}</Link>
        <a className="underline" href={`/api/inaturalist/download?include_duplicates=${includeDuplicates}`}>Diese Auswahl als JSON herunterladen</a>
      </div>
      {!data.observations.length ? <p role="status">Keine freigegebenen Fundmeldungen in dieser Auswahl.</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left">
        <caption className="text-left text-slate-300 mb-3">Quelle iNaturalist · neueste Beobachtungs-IDs zuerst · ausgewählte öffentliche Metadaten, ohne Medien oder Beschreibungen; jede Meldung behält ihre eigene Lizenz.</caption>
        <thead><tr>{["Fundtag", "Taxon", "Qualitätsstufe", "Ortsgenauigkeit", "Quelle, Namensnennung & Lizenz"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{data.observations.map(row => <tr key={row.id} className="border-t border-slate-800">
          <td className="p-3 whitespace-nowrap">{row.observed_on}</td>
          <th scope="row" className="p-3 font-normal">{row.scientific_name}<br /><span className="text-slate-400">Rang: {row.taxon_rank}</span></th>
          <td className="p-3">{QUALITY[row.quality_grade]}</td>
          <td className="p-3">{row.coordinate_uncertainty_m === null ? "unbekannt" : `${row.coordinate_uncertainty_m.toLocaleString("de-DE")} m`}</td>
          <td className="p-3"><a className="underline" href={row.source_url}>iNaturalist #{row.id}</a>
            {row.attribution ? <p>© {row.attribution}</p> : null}
            <a className="underline" href={row.license_url}>{LICENSE[row.license as keyof typeof LICENSE] ?? row.license}</a>
            {row.gbif_ids.map(id => <p key={id}><a className="underline" href={`https://www.gbif.org/occurrence/${id}`}>Auch bei GBIF #{id}</a></p>)}
          </td>
        </tr>)}</tbody>
      </table></div>}
      <nav aria-label="iNaturalist-Fundmeldungsseiten" className="flex gap-6">
        {offset > 0 ? <Link className="underline" href={query(Math.max(0, offset - 100))}>Vorherige iNaturalist-Seite</Link> : null}
        {data.has_more ? <Link className="underline" href={query(offset + 100)}>Weitere iNaturalist-Fundmeldungen</Link> : null}
      </nav>
    </>}
    <p className="text-sm text-slate-400">Quelle: <a className="underline" href="https://www.inaturalist.org">iNaturalist und die verlinkten Beobachtenden</a>.
      Die Auswahl öffentlicher Felder verändert den Umfang der Originalmeldung. Fundmeldungen sind keine repräsentativen Artenbestände.</p>
  </section>;
}
