import Link from "next/link";
import ReferenceData from "../../components/ReferenceData";
export default function ReferencePage() {
  return <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
    <Link href="/umwelt" className="text-emerald-300 underline">Zur Umweltübersicht</Link>
    <h1 className="text-3xl font-bold">Boden, Schutzgebiete & Referenzdaten im Ried</h1>
    <p>Regelmäßig auf der VPS erfasste Referenzdaten für Bürstadt, Lampertheim, Biblis und Groß-Rohrheim. Grundradar liefert den Quellenkatalog und regionale Wertetabellen; Fachkarten stammen aus den angegebenen Originalquellen. Historische Karten und Modelle beschreiben keine aktuelle Gefahrenlage.</p>
    <ReferenceData />
  </main>;
}
