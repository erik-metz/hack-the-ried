import Link from "next/link";
import OfficialStatisticsPage from "../components/OfficialStatisticsPage";
export const dynamic = "force-dynamic";
export default function EnvironmentPage() {
  return <>
    <div className="max-w-7xl mx-auto w-full px-4 pt-4"><Link href="/umwelt/boden" className="text-emerald-300 underline">Boden, Verdunstung & Strahlung: Gemeindeprognosen</Link>
      <Link href="/umwelt/pollen" className="ml-6 text-emerald-300 underline">Pollenprognosen für die Gemeinden</Link>
      <Link href="/umwelt/biodiversitaet" className="ml-6 text-emerald-300 underline">Biodiversität: Fundmeldungen im Ried</Link>
      <Link href="/umwelt/abfluss" className="ml-6 text-emerald-300 underline">Abflussprognosen bei Worms</Link>
      <Link href="/energie/markt" className="ml-6 text-emerald-300 underline">Strommarkt: Preise, Last & Erzeugung</Link></div>
    <OfficialStatisticsPage domain="environment" title="Umwelt & Landwirtschaft" />
  </>;
}
