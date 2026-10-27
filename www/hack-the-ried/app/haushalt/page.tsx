import AdoptedBudgetSection from "../components/AdoptedBudgetSection";
import OfficialStatisticsPage from "../components/OfficialStatisticsPage";
import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Landmark, Database } from "lucide-react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import RegionalatlasTabs from "../components/RegionalatlasTabs";
import HaushaltClient from "./HaushaltClient";
import { fetchBudgets, fetchFinanceComparison, fetchSpending } from "@/lib/financeData";
import { fetchElections } from "@/lib/electionsData";
import { fetchDevelopmentPlans, fetchConstructionActivity } from "@/lib/realestateData";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kommunalfinanzen & Haushalte | HackTheRied",
  description:
    "Transparente Gemeindehaushalte, Steuereinnahmen, Ausgaben für Schulen und Straßen sowie Wahlergebnisse für Bürstadt, Lampertheim, Biblis und Groß-Rohrheim.",
};

export default async function HaushaltPage() {
  const collected = await Promise.all([
    fetchBudgets(),
    fetchSpending(),
    fetchFinanceComparison(2024),
    fetchElections(),
    fetchDevelopmentPlans(),
    fetchConstructionActivity(),
  ]).catch(() => null);
  if (!collected || !collected[0].length) return <OfficialStatisticsPage domain="finance" title="Haushalt & Finanzen" />;
  const [budgets, spending, comparisons, elections, devPlans, permits] = collected;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header / Navigation Bar */}
      <SiteHeader />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">
        {/* Regionalatlas Subnav Tabs */}
        <RegionalatlasTabs activeTab="haushalt" />

        {/* HERO SECTION */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 shadow-2xl">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              <Landmark className="w-3.5 h-3.5" /> Transparenz & Kommunalverwaltung
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 leading-tight tracking-tight">
              Öffentliche Finanzen,{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                Haushalte & Wahlen
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Interaktive Einsicht in die städtischen Haushalte von <strong>Bürstadt</strong>, <strong>Lampertheim</strong>, <strong>Biblis</strong> und <strong>Groß-Rohrheim</strong>. Erkunde, woher das Geld kommt (Gewerbesteuer, Grundsteuern), wohin es fließt (Schulen, Straßen, Kitas) und wie die Bürgerinnen und Bürger gewählt haben.
            </p>
          </div>
        </section>

        <AdoptedBudgetSection />
        {/* INTERACTIVE CLIENT DASHBOARD */}
        <HaushaltClient
          budgets={budgets}
          spending={spending}
          comparisons={comparisons}
          elections={elections}
          devPlans={devPlans}
          permits={permits}
        />
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
