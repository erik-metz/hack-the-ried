import { fetchCulturalEvents } from "@/lib/regionalStats";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import RegionalatlasTabs from "../components/RegionalatlasTabs";
import TermineClient from "./TermineClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Veranstaltungen & Termine im Ried | Ried-Sens",
  description:
    "Aktuelle und historische Veranstaltungen, Feste, Märkte und Kulturtermine in Bürstadt, Lampertheim, Biblis und Groß-Rohrheim mit Sensor-Korrelationsanalyse.",
};

export default async function TerminePage() {
  const [result] = await Promise.allSettled([fetchCulturalEvents({ includePast: true })]);
  const initialEvents = result.status === "fulfilled" ? result.value : [];
  // eslint-disable-next-line react-hooks/purity -- Request-time snapshot in a dynamic Server Component.
  const now = Date.now();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      <SiteHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-12">
        <RegionalatlasTabs activeTab="termine" />
        <TermineClient initialEvents={initialEvents} now={now} eventsUnavailable={result.status === "rejected"} />
      </main>

      <SiteFooter />
    </div>
  );
}
