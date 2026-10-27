import { readCollected } from "@/lib/collectedBackend";
import OfficialStatisticsClient, { type StatisticsData } from "../components/OfficialStatisticsClient";
import {
  fetchCulturalEvents,
  fetchRegionalFacilities,
  fetchSocialSummary,
  fetchWasteStatistics,
} from "@/lib/regionalStats";
import {
  Code2,
  ExternalLink,
  HeartHandshake,
} from "lucide-react";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import RegionalatlasTabs from "../components/RegionalatlasTabs";
import StatistikClient from "./StatistikClient";

export const dynamic = "force-dynamic";

export default async function RegionalStatistikPage() {
  const [summaryResult, wasteResult, facilityResult, eventResult, officialResult] = await Promise.allSettled([
    fetchSocialSummary(), fetchWasteStatistics(), fetchRegionalFacilities(),
    fetchCulturalEvents({ includePast: true }),
    readCollected<StatisticsData>("statistics/social"),
  ]);
  const summaries = summaryResult.status === "fulfilled" ? summaryResult.value : [];
  const wasteStats = wasteResult.status === "fulfilled" ? wasteResult.value : [];
  const facilities = facilityResult.status === "fulfilled" ? facilityResult.value : [];
  const events = eventResult.status === "fulfilled" ? eventResult.value : [];
  // eslint-disable-next-line react-hooks/purity -- Request-time snapshot in a dynamic Server Component.
  const now = Date.now();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <SiteHeader />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-12">
        {/* Regionalatlas Subnav Tabs */}
        <RegionalatlasTabs activeTab="statistik" />

        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 shadow-2xl">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              <HeartHandshake className="w-3.5 h-3.5" /> Regionales Leben, Soziales & Kreislaufwirtschaft
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 leading-tight">
              Arbeit, Gesundheit & Vereine im{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                Hessischen Ried
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Veröffentlichte Gemeindestatistik und regionale Veranstaltungen für
              Bürstadt, Lampertheim, Biblis und Groß-Rohrheim. Zusätzliche Angaben
              zu Arbeitsmarkt, Versorgung und Abfallbilanzen erscheinen nur,
              soweit gespeicherte Daten vorliegen.
            </p>


          </div>
        </section>

        {/* Interactive Client Dashboard Component */}
        <StatistikClient
          summaries={summaries}
          wasteStats={wasteStats}
          facilities={facilities}
          events={events}
          now={now}
          eventsUnavailable={eventResult.status === "rejected"}
        />

        <section className="space-y-4" aria-label="Amtliche Gemeindestatistik">
          <p className="text-sm text-slate-400">
            Die HSL-Gemeindestatistik ergänzt diese Ansicht um Straßenverkehrsunfälle
            und kommunales Personal. Sie enthält keine Kennzahlen zur ärztlichen
            Versorgung, zu Recyclingquoten oder zur sozialen Bedürftigkeit.
          </p>
          <OfficialStatisticsClient
            domain="social"
            title="Straßenverkehrsunfälle & kommunales Personal"
            data={officialResult.status === "fulfilled" ? officialResult.value : null}
          />
        </section>

        {/* Developer / Hackathon Callout */}
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Code2 className="w-5 h-5 text-emerald-400" />
                Sozial- & Versorgungsdaten per API abfragen
              </h3>
              <p className="text-sm text-slate-400 max-w-2xl">
                Verfügbare Veröffentlichungen und Veranstaltungen
                stehen als JSON-Endpunkte für den regionalen Hackathon und
                Forschungsprojekte bereit.
              </p>
            </div>
            <Link
              href="/daten"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm transition-colors shrink-0"
            >
              API-Dokumentation
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
