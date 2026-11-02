import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import HackathonDataSection from "./HackathonDataSection";
import SatelliteDownloadSection from "./SatelliteDownloadSection";
import ArchiveDownloads from "./ArchiveDownloads";
import ApiDevToolsSection from "./ApiDevToolsSection";
import CommunitySection from "./CommunitySection";
import McpAccessSection from "./McpAccessSection";

export const dynamic = "error";

export const metadata: Metadata = {
  title: "Daten, API & MCP für KI | HackTheRied",
  description: "Öffentliche Daten aus dem Hessischen Ried herunterladen, per API abfragen oder über unseren MCP-Server direkt mit deinem KI-Client nutzen.",
};

export default function DataDocsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <SiteHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12">
        <header className="space-y-6">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Open Data · Hessisches Ried</p>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Daten nutzen</h1>
            <p className="text-base leading-relaxed text-slate-300">Für deine Analyse, deine Anwendung oder deinen KI-Client. Wähle den Zugang, der zu deinem Vorhaben passt.</p>
          </div>
          <nav aria-label="Datenzugang wählen" className="grid gap-3 md:grid-cols-3">
            <a href="#datasets" className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-colors hover:border-emerald-500/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
              <span className="block font-semibold text-slate-100">Dateien herunterladen <span aria-hidden="true" className="text-emerald-300">↓</span></span>
              <span className="mt-2 block text-sm leading-relaxed text-slate-400">Messdaten, Monatsarchive und Satellitenbilder für eigene Auswertungen.</span>
            </a>
            <a href="#schnittstellen" className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-colors hover:border-emerald-500/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
              <span className="block font-semibold text-slate-100">API &amp; KI anbinden <span aria-hidden="true" className="text-emerald-300">↓</span></span>
              <span className="mt-2 block text-sm leading-relaxed text-slate-400">Öffentliche Daten direkt in deiner Anwendung oder per MCP nutzen.</span>
            </a>
            <Link href="/quellen" className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-colors hover:border-emerald-500/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
              <span className="block font-semibold text-slate-100">Quellen verstehen <span aria-hidden="true" className="text-emerald-300">→</span></span>
              <span className="mt-2 block text-sm leading-relaxed text-slate-400">Herkunft, Aktualität und Nutzungsbedingungen der Daten prüfen.</span>
            </Link>
          </nav>
        </header>

        <div className="space-y-4">
          <HackathonDataSection />
          <details className="group rounded-2xl border border-slate-800 bg-slate-900/40">
            <summary className="cursor-pointer rounded-2xl p-5 sm:p-6 text-slate-100 hover:bg-slate-800/40 focus-visible:outline-2 focus-visible:outline-emerald-400">
              <span className="ml-2 font-semibold">Monatsarchive</span>
              <span className="mt-1 block pl-6 text-sm leading-relaxed text-slate-400">Vollständige Monatsdaten als Parquet-ZIP für langfristige Analysen.</span>
            </summary>
            <Suspense fallback={<p role="status" className="p-6 text-sm text-slate-400">Monatsarchive werden geladen …</p>}>
              <ArchiveDownloads />
            </Suspense>
          </details>
          <details className="group rounded-2xl border border-slate-800 bg-slate-900/40">
            <summary className="cursor-pointer rounded-2xl p-5 sm:p-6 text-slate-100 hover:bg-slate-800/40 focus-visible:outline-2 focus-visible:outline-emerald-400">
              <span className="ml-2 font-semibold">Satellitenbilder</span>
              <span className="mt-1 block pl-6 text-sm leading-relaxed text-slate-400">Sentinel-2-Aufnahmen als Bilderarchiv oder GIS-Manifest herunterladen.</span>
            </summary>
            <SatelliteDownloadSection />
          </details>
        </div>

        <section id="schnittstellen" aria-labelledby="interfaces-title" className="scroll-mt-24 space-y-5">
          <div className="space-y-2">
            <h2 id="interfaces-title" className="text-2xl sm:text-3xl font-bold">API &amp; KI anbinden</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-400">Zwei Wege zu den öffentlichen Daten: HTTP-Endpunkte für deine Anwendung oder MCP für deinen KI-Client.</p>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ApiDevToolsSection />
            <McpAccessSection />
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-800 pt-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl space-y-2">
            <h2 className="text-base font-semibold">Quellen &amp; Nutzungsbedingungen</h2>
            <p className="text-sm leading-relaxed text-slate-400">Beachte bei der Weiterverwendung die Lizenz und Namensnennung der jeweiligen Quelle. Verfügbarkeit und Bezugszeitraum können je nach Datensatz abweichen.</p>
          </div>
          <Link href="/quellen" className="shrink-0 text-sm font-medium text-emerald-300 hover:underline">Quellen &amp; Aktualität →</Link>
        </section>
        <CommunitySection />
      </main>
      <SiteFooter />
    </div>
  );
}
