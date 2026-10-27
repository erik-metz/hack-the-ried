import OfficialStatisticsPage from "../components/OfficialStatisticsPage";
import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Briefcase, Database, MapPin } from "lucide-react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import RegionalatlasTabs from "../components/RegionalatlasTabs";
import WirtschaftClient from "./WirtschaftClient";
import {
  fetchBusinessRegistrations,
  fetchCompanies,
  fetchEconomyOverview,
  fetchIndustryStructure,
  fetchStartupInitiatives,
  fetchTaxRates,
} from "@/lib/economyData";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wirtschaft & Unternehmen | HackTheRied",
  description:
    "Gewerbeanmeldungen, Unternehmensneugründungen, Branchenstruktur, Gewerbesteuer-Hebesätze und Top-Arbeitgeber in Bürstadt, Lampertheim, Biblis und dem Kreis Bergstraße.",
};

export default async function WirtschaftPage() {
  const collected = await Promise.all([
    fetchEconomyOverview(2024),
    fetchCompanies(),
    fetchTaxRates(2024),
    fetchBusinessRegistrations(),
    fetchIndustryStructure("kreis-bergstrasse", 2024),
    fetchStartupInitiatives(),
  ]).catch(() => null);
  if (!collected) return <OfficialStatisticsPage domain="economy" title="Wirtschaft" />;
  const [
    overview,
    companies,
    taxRates,
    registrations,
    industryEmployment,
    startupInitiatives,
  ] = collected;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header / Navigation Bar */}
      <SiteHeader />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">
        {/* Regionalatlas Subnav Tabs */}
        <RegionalatlasTabs activeTab="wirtschaft" />

        {/* HERO SECTION */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 shadow-2xl">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              <Briefcase className="w-3.5 h-3.5" /> Regionalökonomie & Wirtschaftsstandort
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 leading-tight tracking-tight">
              Wirtschaft, Gewerbe &{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                Unternehmen im Ried
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Detaillierte Gründungsstatistiken von <strong>Statistik Hessen</strong>, Gewerbesteuer-Hebesätze aller 22 Kommunen des <strong>Kreises Bergstraße</strong>, Branchenstrukturen und ein Profil der wichtigsten Arbeitgeber in Bürstadt, Lampertheim, Biblis und der Metropolregion.
            </p>
          </div>
        </section>

        {/* CLIENT DASHBOARD */}
        <WirtschaftClient
          overview={overview}
          companies={companies}
          taxRates={taxRates}
          registrations={registrations}
          industryEmployment={industryEmployment}
          startupInitiatives={startupInitiatives}
        />
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
