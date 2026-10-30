import type { Metadata } from "next";
import DashboardClient from "../components/DashboardClient.tsx";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import { Compass, Satellite } from "lucide-react";

export const dynamic = "error";

export const metadata: Metadata = {
  title: "Sensorkarte & Satelliten-Layer | HackTheRied",
  description:
    "Interaktive Karte von Worms über das Hessische Ried bis nördlich Darmstadt: Live-Sensordaten, Mobilität, Kommunallayer sowie Copernicus Sentinel-2 Satellitenbilder (Echtfarben RGB & NDVI Vegetationsgesundheit).",
};

export default function KartePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      <SiteHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              <Compass className="size-3.5" /> Interaktives Geoportal
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 flex items-center gap-2.5">
              <span>Sensorkarte &amp; Erdbeobachtung</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                <Satellite className="size-3" /> Sentinel-2 COG
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-3xl">
              Vollständige Kartenansicht für das Hessische Ried: Filtere Bürger- und Multisensorstationen, aktiviere
              Fachlayer für Mobilität, Umwelt und Kommunalinfrastruktur oder schalte hochauflösende Copernicus Sentinel-2
              Satellitenbilder (RGB &amp; NDVI) als Rasterebene dazu.
            </p>
          </div>

        </div>

        <div className="w-full">
          <DashboardClient />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
