import type { Metadata } from "next";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import RegionalatlasTabs from "../../components/RegionalatlasTabs";
import BahnClient from "./BahnClient";

export const metadata: Metadata = {
  title: "Bahnhöfe & Anlagenstatus | Regionalatlas Ried",
  description: "DB-Bahnhofsinfrastruktur, Bahnsteige, Aufzüge und Rolltreppen im Ried und an den Hauptbahnhöfen Frankfurt und Mannheim, mit Quelle und Aktualität.",
};

export default function BahnPage() {
  return <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <SiteHeader />
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <RegionalatlasTabs activeTab="bahn" />
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">DB InfraGO · OpenStation</p>
        <h1 className="text-3xl sm:text-4xl font-bold">Bahnhöfe &amp; Anlagenstatus</h1>
        <p className="max-w-3xl text-slate-400">Entdecke Bahnsteige, Zugänge und technische Anlagen der erfassten Bahnhöfe. Aufzüge und Rolltreppen zeigen den gemeldeten Betriebsstatus mit dem Zeitpunkt der Meldung.</p>
      </header>
      <BahnClient />
    </main>
    <SiteFooter />
  </div>;
}
