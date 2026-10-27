import OfficialStatisticsPage from "../components/OfficialStatisticsPage";
import {
  fetchBorisZones,
  fetchConstructionActivity,
  fetchDevelopmentPlans,
  fetchHousingStock,
  fetchMarketBenchmarks,
  fetchRealEstateSummary,
} from "@/lib/realestateData";
import {
  ArrowLeft,
  Building2,
  Database,
  ExternalLink,
  Flame,
  Hammer,
  Home,
  Layers,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import RegionalatlasTabs from "../components/RegionalatlasTabs";
import BauenWohnenClient from "./BauenWohnenClient";

export const dynamic = "force-dynamic";

export default async function BauenWohnenPage() {
  const collected = await Promise.all([
      fetchRealEstateSummary(),
      fetchHousingStock(),
      fetchBorisZones(),
      fetchConstructionActivity(),
      fetchMarketBenchmarks(),
      fetchDevelopmentPlans(),
    ]).catch(() => null);
  if (!collected || !collected[0].length) return <OfficialStatisticsPage domain="realestate" title="Bauen & Wohnen" />;
  const [summaries, housingStock, borisZones, permits, benchmarks, developmentPlans] = collected;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header / Navigation Bar */}
      <SiteHeader />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-12">
        {/* Regionalatlas Subnav Tabs */}
        <RegionalatlasTabs activeTab="bauen-wohnen" />

        {/* HERO SECTION */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 shadow-2xl">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              <Building2 className="w-3.5 h-3.5" /> Regionaler Immobilien- & Gebäudeatlas
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 leading-tight">
              Bauen, Wohnen & Bodenrichtwerte im{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300">
                Hessischen Ried
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Detaillierte amtliche Analysen zu <strong>Gebäudealter</strong>, <strong>Wohnungsbestand</strong>,{" "}
              <strong>Leerstandsquoten</strong> und <strong>Heizungsenergieträgern</strong> aus dem Zensus 2022
              sowie <strong>BORIS Hessen Bodenrichtwerte</strong>, Bautätigkeits-Zeitreihen und kommunale
              Neubaugebiete für <strong>Bürstadt</strong>, <strong>Lampertheim</strong>, <strong>Biblis</strong>,{" "}
              <strong>Groß-Rohrheim</strong>, <strong>Einhausen</strong> und <strong>Lorsch</strong>.
            </p>

            {/* Quick Metrics Bar */}
            <div className="pt-2 flex flex-wrap gap-4 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <Home className="w-4 h-4 text-emerald-400" />
                <span>42.850 Wohnungen erfasst</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>BORIS Hessen WFS Open Data</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>Zensus 2022 Heizungsradar</span>
              </div>
            </div>
          </div>
        </section>

        {/* INTERACTIVE CLIENT DASHBOARD */}
        <BauenWohnenClient
          summaries={summaries}
          housingStock={housingStock}
          borisZones={borisZones}
          permits={permits}
          benchmarks={benchmarks}
          developmentPlans={developmentPlans}
        />
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
