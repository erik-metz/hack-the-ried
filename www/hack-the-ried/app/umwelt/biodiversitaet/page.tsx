import Link from "next/link";
import InaturalistSection, { loadInaturalist } from "./InaturalistSection";
import { env } from "@/env";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Biodiversität im Ried | HackTheRied" };
type Occurrence = { entity_id: string; event_day: string; provenance: {
  gbif_id: number; scientificName: string; basisOfRecord: string; datasetKey: string;
  license: string; issues: string[] | null; informationWithheld: string | null; dataGeneralizations: string | null;
  spatial_reference: { coordinate_uncertainty_m: number | null };
} };
type Data = { items: Occurrence[]; stored_records: number; stored_species: number; has_more: boolean; as_of: string;
  snapshot: null | { last_checked_at: string; matched: number; scanned: number; skipped: number; source_truncated: boolean; query: { year: string } } };

export default async function BiodiversityPage({ searchParams }: { searchParams: Promise<{ offset?: string; inat_offset?: string; inat_duplicates?: string }> }) {
  const params = await searchParams;
  const requested = Number(params.offset ?? 0);
  const offset = Number.isInteger(requested) && requested >= 0 && requested <= 3000 ? requested : 0;
  const inatRequested = Number(params.inat_offset ?? 0);
  const inatOffset = Number.isInteger(inatRequested) && inatRequested >= 0 && inatRequested <= 2000 ? inatRequested : 0;
  const inatDuplicates = params.inat_duplicates === "1";
  const inatPromise = loadInaturalist(inatOffset, inatDuplicates);
  let data: Data | null = null;
  try {
    const url = new URL("/api/v1/environment/measurements/biodiversity", env.BACKEND_API_URL);
    url.searchParams.set("limit", "100"); url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("GBIF-Daten nicht verfügbar");
    data = await response.json();
  } catch { data = null; }
  const snapshot = data?.snapshot;
  const stale = snapshot && data && Date.parse(data.as_of) - Date.parse(snapshot.last_checked_at) > 72 * 3600_000;
  return <div className="min-h-screen flex flex-col"><SiteHeader /><main className="flex-1 mx-auto w-full max-w-7xl px-4 py-10 space-y-6">
    <Link href="/umwelt" className="text-emerald-300 underline">Umwelt & Landwirtschaft</Link>
    <h1 className="text-3xl font-bold">Biodiversität: Fundmeldungen im Ried</h1>
    <p className="max-w-3xl text-slate-300">GBIF bündelt Fundmeldungen aus verschiedenen Datensätzen. Der Suchausschnitt umfasst
      49,55–49,76° Nord und 8,35–8,65° Ost, einschließlich angrenzender Orte. Er folgt keiner Gemeindegrenze.
      Wir prüfen die Quelle täglich und übernehmen höchstens 3.000 Treffer in der Reihenfolge der GBIF-Suche.</p>
    <p className="max-w-3xl text-slate-300">Die Daten zeigen gemeldete Vorkommen. Meldeaktivität, Datensatzabdeckung und Nachträge beeinflussen die Auswahl.
      Eine Fundmeldung ist keine Bestandszählung; fehlende Meldungen belegen keine Abwesenheit. Eine Angabe von 00:00 bezeichnet hier nur den bekannten Fundtag.</p>
    {!snapshot ? <p role="status" className="rounded-xl border border-slate-700 p-6">Aktuell kein gespeicherter GBIF-Suchausschnitt verfügbar.</p> : <>
      <p>Suchzeitraum: {snapshot.query.year.replace(",", "–")} · Quellenprüfung: {new Date(snapshot.last_checked_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</p>
      {stale ? <p role="status" className="text-amber-300">Daten veraltet – seit mehr als drei Tagen nicht erfolgreich geprüft.</p> : null}
      <p>{snapshot.matched.toLocaleString("de-DE")} Treffer in der GBIF-Suche; {snapshot.scanned.toLocaleString("de-DE")} abgerufen;
        {" "}{snapshot.skipped.toLocaleString("de-DE")} wegen unzureichender Angaben ausgelassen.
        {" "}{data?.stored_records.toLocaleString("de-DE")} sichtbare Fundmeldungen und {data?.stored_species.toLocaleString("de-DE")} unterschiedliche GBIF-Artschlüssel im gespeicherten Ausschnitt.</p>
      {snapshot.source_truncated ? <p className="text-amber-300">Die Abrufgrenze wurde erreicht. Diese Auswahl ist kein vollständiges Arteninventar und keine repräsentative Stichprobe.</p> : null}
      <div className="overflow-x-auto"><table className="w-full text-sm text-left">
        <caption className="text-left text-slate-300 mb-3">Gespeicherte Fundmeldungen, nach Fundtag sortiert. Unbekannte Koordinatenunsicherheit bleibt unbekannt.</caption>
        <thead><tr>{["Fundtag", "Wissenschaftlicher Name", "Belegtyp", "Ortsgenauigkeit", "Quelle & Lizenz"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{data?.items.map(row => <tr key={row.entity_id} className="border-t border-slate-800">
          <td className="p-3 whitespace-nowrap">{row.event_day.slice(0, 10)}</td>
          <th scope="row" className="p-3 font-normal"><a className="underline" href={`https://www.gbif.org/occurrence/${row.provenance.gbif_id}`}>{row.provenance.scientificName}</a></th>
          <td className="p-3">{row.provenance.basisOfRecord}</td>
          <td className="p-3">{row.provenance.spatial_reference.coordinate_uncertainty_m === null ? "unbekannt" : `${row.provenance.spatial_reference.coordinate_uncertainty_m.toLocaleString("de-DE")} m`}
            {row.provenance.informationWithheld || row.provenance.dataGeneralizations ? <p>Angaben zurückgehalten oder vergröbert.</p> : null}
            {row.provenance.issues?.length ? <details><summary className="cursor-pointer">Qualitätshinweise</summary>{row.provenance.issues.join(", ")}</details> : null}</td>
          <td className="p-3"><a className="underline" href={`https://www.gbif.org/dataset/${encodeURIComponent(row.provenance.datasetKey)}`}>Datensatz</a>
            <br /><a className="underline" href={row.provenance.license}>Lizenz des Datensatzes</a></td>
        </tr>)}</tbody>
      </table></div>
      <nav aria-label="Fundmeldungsseiten" className="flex gap-6">
        {offset > 0 ? <Link className="underline" href={`/umwelt/biodiversitaet?offset=${Math.max(0, offset-100)}`}>Vorherige Seite</Link> : null}
        {data?.has_more ? <Link className="underline" href={`/umwelt/biodiversitaet?offset=${offset+100}`}>Weitere Fundmeldungen</Link> : null}
      </nav>
    </>}
    <p className="text-sm text-slate-400">Quelle: <a className="underline" href="https://www.gbif.org">GBIF und die verlinkten Datenherausgeber</a>.
      Jede Meldung behält ihre eigene Lizenz. Bilder und Namen meldender Personen werden nicht in dieser Übersicht angezeigt.</p>
    <InaturalistSection dataPromise={inatPromise} offset={inatOffset} includeDuplicates={inatDuplicates} />
  </main><SiteFooter /></div>;
}
