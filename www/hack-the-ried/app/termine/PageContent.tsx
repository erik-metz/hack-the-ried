"use client";
import { usePublicDatasets } from "@/lib/hooks/usePublicDatasets";
import PublicPageLoading from "../components/PublicPageLoading";
import type { fetchCulturalEvents } from "@/lib/regionalStats";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import RegionalatlasTabs from "../components/RegionalatlasTabs";
import TermineClient from "./TermineClient";

const PUBLICATIONS = ["collected/social/events?include_past=true"];

export default function TerminePage() {
  const publication = usePublicDatasets<[Awaited<ReturnType<typeof fetchCulturalEvents>>]>(PUBLICATIONS);
  if (!publication) return <PublicPageLoading title="Termine" />;
  const [result] = publication.results;
  const initialEvents = result.status === "fulfilled" ? result.value : [];
  const now = publication.loadedAt;

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
