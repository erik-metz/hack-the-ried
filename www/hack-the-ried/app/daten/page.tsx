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

export const dynamic = "error";

export const metadata: Metadata = {
  title: "Daten herunterladen & API | HackTheRied",
  description: "Stichprobe, Themen-Exporte und Sensorarchive für eigene Auswertungen und den Hackathon im Hessischen Ried.",
};

export default function DataDocsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <SiteHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <header className="space-y-4">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Daten nutzen</h1>
          <p className="max-w-2xl text-slate-300">Daten aus dem Ried für deine Auswertung, App oder Hackathon-Idee. Lade Dateien herunter oder nutze die API.</p>
          <nav aria-label="Bereiche der Datenseite" className="flex flex-wrap gap-4 text-sm text-emerald-300">
            <a href="#datasets" className="hover:underline">Downloads</a>
            <a href="#monatsarchive" className="hover:underline">Sensorarchive</a>
            <a href="#api-tools" className="hover:underline">API</a>
            <Link href="/quellen" className="hover:underline">Quellen &amp; Aktualität →</Link>
          </nav>
        </header>
        <CommunitySection />
        <HackathonDataSection />
        <Suspense fallback={<p role="status" className="text-slate-400">Sensorarchive werden geladen …</p>}>
          <ArchiveDownloads />
        </Suspense>
        <SatelliteDownloadSection />
        <ApiDevToolsSection />
        <section className="rounded-2xl border border-slate-800 p-6 space-y-2">
          <h2 className="text-lg font-semibold">Quellen &amp; Nutzungsbedingungen</h2>
          <p className="text-sm text-slate-400">Herkunft, Erfassungsstatus und regionale Kataloge findest du unter <Link href="/quellen" className="text-emerald-300 hover:underline">Quellen</Link>. Beachte bei der Weiterverwendung die Lizenz und Namensnennung der jeweiligen Quelle.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
