"use client";
import { usePublicDatasets, fulfilledValues } from "@/lib/hooks/usePublicDatasets";
import PublicPageLoading from "../components/PublicPageLoading";
import OfficialStatisticsPage from "../components/OfficialStatisticsPage";
import type { AgeStructure, CommuterFlow, Municipality } from "@/lib/demographicsData";
import type {
  fetchDemographicSummary,
  fetchEducationalFacilities,
} from "@/lib/demographicsData";
import {
  Code2,
  Database,
  ExternalLink,
  GraduationCap,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import RegionalatlasTabs from "../components/RegionalatlasTabs";
import DemographicsClient from "./DemographicsClient";

const PUBLICATIONS = ["collected/demographics/summary", "collected/demographics/facilities", "collected/demographics/age-structure", "collected/demographics/commuters", "collected/demographics/municipalities"];

export default function DemographicsPage() {
  const publication = usePublicDatasets<[Awaited<ReturnType<typeof fetchDemographicSummary>>, Awaited<ReturnType<typeof fetchEducationalFacilities>>, Record<string, AgeStructure[]>, CommuterFlow[], Municipality[]]>(PUBLICATIONS);
  if (!publication) return <PublicPageLoading title="Demografie" />;
  const collected = fulfilledValues(publication.results);
  if (!collected || !collected[0].length) return <OfficialStatisticsPage domain="demographics" title="Demografie" />;
  const [summaries, facilities, ageStructure, commuters, municipalities] = collected;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header / Navigation Bar */}
      <SiteHeader />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-12">
        {/* Regionalatlas Subnav Tabs */}
        <RegionalatlasTabs activeTab="demografie" />

        {/* HERO SECTION */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 shadow-2xl">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              <Users className="w-3.5 h-3.5" /> Regionaler Sozial- & Demografieatlas
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 leading-tight">
              Menschen, Pendler & Bildung im{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                Hessischen Ried
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Umfassende sozio-ökonomische Kennzahlen, Alterspyramiden,
              Wanderungsstatistiken und Betreuungskapazitäten für{" "}
              <strong>Bürstadt</strong>, <strong>Lampertheim</strong>,{" "}
              <strong>Biblis</strong>, <strong>Groß-Rohrheim</strong> und{" "}
              <strong>Hofheim (Ried)</strong>. Offene Daten für Stadtplanung,
              Hackathons und Bürgerinformation.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-lg">
                <Database className="w-3.5 h-3.5 text-emerald-400" /> Hessisches Statistisches Landesamt
              </span>
              <span className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-lg">
                <GraduationCap className="w-3.5 h-3.5 text-amber-400" /> Kreis Bergstraße Schulentwicklungsplan
              </span>
              <span className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-lg">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" /> Bundesagentur für Arbeit Pendleratlas
              </span>
            </div>
          </div>
        </section>

        {/* INTERACTIVE DEMOGRAPHICS CLIENT COMPONENT */}
        <DemographicsClient ageStructure={ageStructure} commuters={commuters} municipalities={municipalities} summaries={summaries} facilities={facilities} />

        {/* OPEN DATA / DEVELOPER CALLOUT */}
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Code2 className="w-5 h-5 text-emerald-400" />
                Demografiedaten für Hackathons & Analysen
              </h3>
              <p className="text-sm text-slate-400">
                Alle Bevölkerungsdaten, Pendlerströme und Schulstandorte stehen über unsere
                REST-API maschinenlesbar zur Verfügung.
              </p>
            </div>
            <Link
              href="/daten"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 transition-colors shrink-0"
            >
              Zur Open-Data-Dokumentation
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
          <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
            <span className="text-slate-500"># Beispiel REST-Abfrage:</span>
            <br />
            <span className="text-emerald-400">GET</span>{" "}
            <span>https://api.hack-the-ried.de/api/v1/demographics/summary</span>
            <br />
            <span className="text-emerald-400">GET</span>{" "}
            <span>https://api.hack-the-ried.de/api/v1/demographics/buerstadt/commuters</span>
          </div>
        </section>
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
