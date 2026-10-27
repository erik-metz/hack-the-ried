import { Metadata } from "next";
import Link from "next/link";
import {
  Layers,
  Building2,
  Users,
  Coins,
  Briefcase,
  BarChart3,
  ArrowRight,
  Database,
  Home,
  Recycle,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import RegionalatlasTabs from "../components/RegionalatlasTabs";

export const metadata: Metadata = {
  title: "Regionalatlas Ried | Kommunaldaten, Statistik & Bürgerinformationen",
  description:
    "Der zentrale Regionalatlas für das Hessische Ried: Bauen & Wohnen, Demografie & Bildung, Finanzen & Haushalt, Wirtschaft & Gewerbe sowie Regionalstatistik für Bürstadt, Lampertheim, Biblis und die Region.",
};

const THEMEN_BEREICHE = [
  {
    id: "bauen-wohnen", title: "Bauen & Wohnen", subtitle: "Wohnungsbestand & Bodenrichtwerte",
    href: "/bauen-wohnen", icon: Building2, color: "amber", badge: "HSL & BORIS Hessen",
    description: "Veröffentlichte Gemeindestatistik zum Wohnungsbestand und historische BORIS-Bodenrichtwertzonen mit ausgewiesenem Stichtag.",
    kpis: [{ label: "Daten", val: "Amtliche Tabellen" }, { label: "Bodenrichtwerte", val: "Zonen & Stichtag" }],
    highlights: ["HSL-Tabellen mit Bezugszeiträumen", "BORIS-Zonen mit Originalgeometrien", "Bodenrichtwerte sind keine Verkaufspreise"],
  },
  {
    id: "demografie", title: "Demografie & Bildung", subtitle: "Bevölkerung & Bevölkerungsbewegung",
    href: "/demografie", icon: Users, color: "teal", badge: "HSL Gemeindestatistik",
    description: "Amtliche Bevölkerungstabellen für die vier Ried-Kommunen. Zusätzliche Bildungs- und Pendlerdaten erscheinen nur bei vorhandener Veröffentlichung.",
    kpis: [{ label: "Daten", val: "Amtliche Tabellen" }, { label: "Vergleich", val: "Vier Kommunen" }],
    highlights: ["Bevölkerung nach Originalkennzahlen", "Bevölkerungsbewegung", "Bezugszeitraum je Tabelle"],
  },
  {
    id: "statistik", title: "Regionalstatistik & Soziales", subtitle: "Gemeindestatistik & Kultur",
    href: "/statistik", icon: BarChart3, color: "pink", badge: "HSL & Veranstalter",
    description: "Straßenverkehrsunfälle, kommunales Personal und regionale Veranstaltungen. Weitere Sozial- und Abfalldaten werden nur bei vorhandener Veröffentlichung angezeigt.",
    kpis: [{ label: "Statistik", val: "Unfälle & Personal" }, { label: "Kultur", val: "Veranstaltungen" }],
    highlights: ["Amtliche Tabellen für vier Kommunen", "Regionale Veranstaltungen", "Fehlende Angaben bleiben sichtbar"],
  },
  {
    id: "haushalt", title: "Finanzen & Haushalt", subtitle: "Kommunalhaushalte & Finanzstatistik",
    href: "/haushalt", icon: Coins, color: "emerald", badge: "Amtliche Veröffentlichungen",
    description: "Veröffentlichte Haushaltspläne und HSL-Finanzstatistik mit getrennten Berichtszeiträumen. Ungeklärte Angaben bleiben gekennzeichnet.",
    kpis: [{ label: "Pläne", val: "Kommunalhaushalte" }, { label: "Statistik", val: "HSL-Finanztabellen" }],
    highlights: ["Veröffentlichte Ertrags- und Aufwandspläne", "Realsteuern und Schulden", "Planwerte und historische Statistik getrennt"],
  },
  {
    id: "wirtschaft", title: "Wirtschaft & Gewerbe", subtitle: "Wirtschaftsstruktur & Gemeindestatistik",
    href: "/wirtschaft", icon: Briefcase, color: "blue", badge: "HSL Gemeindestatistik",
    description: "Amtliche Wirtschaftstabellen für Bürstadt, Lampertheim, Biblis und Groß-Rohrheim. Unternehmensprofile werden dadurch nicht ersetzt.",
    kpis: [{ label: "Vergleich", val: "Vier Kommunen" }, { label: "Daten", val: "Amtliche Tabellen" }],
    highlights: ["Originalkennzahlen der Gemeindestatistik", "Berichtszeiträume je Tabelle", "Fehlwertzeichen bleiben erhalten"],
  },
];

const COMMUNES = [
  {
    name: "Bürstadt",
    zip: "68642",
    tagline: "Sonnenstadt & Heimat des KAMÜ Kulturzentrums",
  },
  {
    name: "Lampertheim",
    zip: "68623",
    tagline: "Spargelstadt im Ried mit Hofheim & Hüttenfeld",
  },
  {
    name: "Biblis",
    zip: "68647",
    tagline: "Energiewende & Gurkenstadt mit Nordheim & Wattenheim",
  },
  {
    name: "Groß-Rohrheim",
    zip: "68649",
    tagline: "Historisches Fachwerk & Riedgemeinde an der Bergstraße",
  },
  {
    name: "Einhausen",
    zip: "64683",
    tagline: "Gemeinde an der Weschnitz am Rande des Rieds",
  },
  {
    name: "Lorsch",
    zip: "64653",
    tagline: "Karolingerstadt & UNESCO-Weltkulturerbe",
  },
];

export default function RegionalatlasOverviewPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header / Navigation Bar */}
      <SiteHeader />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10 sm:space-y-12">
        {/* Unified Tab Bar Component */}
        <RegionalatlasTabs activeTab="uebersicht" />
        <Link href="/regionalatlas/bahn" className="block rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-300 hover:bg-emerald-500/15">
          <span className="font-semibold">Bahnhöfe &amp; Anlagenstatus</span>
          <span className="block mt-1 text-sm text-slate-300">DB-Infrastruktur erkunden: Bahnsteige, Zugänge, Aufzüge und Rolltreppen mit Quelle und Aktualität.</span>
        </Link>

        {/* HERO SECTION */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 shadow-2xl">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              <Layers className="w-4 h-4" />
              Regionalatlas Hessisches Ried
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 leading-tight">
              Kommunaldaten, Statistik &amp; Fakten im{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300">
                Hessischen Ried
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Der <strong>Regionalatlas</strong> bündelt verfügbare amtliche Struktur- und
              Bürgerdaten unserer Region an einem zentralen Ort: von{" "}
              <strong>Bodenrichtwerten &amp; Wohnungsbeständen</strong> über{" "}
              <strong>Demografie &amp; Schulentwicklungspläne</strong>,{" "}
              <strong>Gemeindehaushalte</strong>, <strong>Gewerbestatistiken</strong> bis hin zur{" "}
              <strong>Kreislaufwirtschaft &amp; Kulturleben</strong>.
            </p>

            {/* Quick Metrics Bar */}
            <div className="pt-2 flex flex-wrap gap-3 text-xs font-mono text-slate-300">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <Home className="w-4 h-4 text-amber-400" />
                <span>Wohnungsstatistik & Bodenrichtwerte</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <Users className="w-4 h-4 text-teal-400" />
                <span>Bevölkerungsstatistik für vier Kommunen</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <Coins className="w-4 h-4 text-emerald-400" />
                <span>Kommunalhaushalte transparent</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <Recycle className="w-4 h-4 text-purple-400" />
                <span>Regionale Veröffentlichungen & Kultur</span>
              </div>
            </div>
          </div>
        </section>

        {/* 5 CORE PILLARS GRID */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Themenwelten erkunden
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">
                Die fünf Fachbereiche des Regionalatlas
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md">
              Wähle einen Bereich, um interaktive Karten, Zeitreihendiagramme,
              Vergleichstabellen und Rohdaten herunterzuladen.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {THEMEN_BEREICHE.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col justify-between p-6 rounded-3xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/90 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 ${
                          item.id === "bauen-wohnen"
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                            : item.id === "demografie"
                            ? "bg-teal-500/15 text-teal-400 border border-teal-500/25"
                            : item.id === "haushalt"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                            : item.id === "wirtschaft"
                            ? "bg-blue-500/15 text-blue-400 border border-blue-500/25"
                            : "bg-pink-500/15 text-pink-400 border border-pink-500/25"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-slate-400">
                        {item.badge}
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs font-medium text-slate-400">
                        {item.subtitle}
                      </p>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {item.description}
                    </p>

                    {/* KPI Snapshot */}
                    <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-800/80 text-center">
                      {item.kpis.map((kpi, idx) => (
                        <div key={idx} className="space-y-0.5">
                          <span className="text-[10px] text-slate-400 block truncate">
                            {kpi.label}
                          </span>
                          <span className="text-xs font-bold text-slate-200 truncate block">
                            {kpi.val}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Highlights bullet list */}
                    <ul className="space-y-1.5 pt-1">
                      {item.highlights.map((highlight, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-2 text-xs text-slate-400"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
                          <span className="truncate">{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action Link */}
                  <div className="pt-6 mt-4 border-t border-slate-800/60">
                    <Link
                      href={item.href}
                      className="inline-flex w-full items-center justify-between px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/10 text-xs font-semibold text-slate-200 hover:text-emerald-300 transition-all"
                    >
                      <span>Fachbereich {item.title} öffnen</span>
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-400 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SATELLITE & EARTH OBSERVATION / DROUGHT MONITORING */}

        {/* REGIONAL COVERAGE / COMMUNES */}
        <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/50 border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Geografische Abdeckung
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                Städte &amp; Gemeinden im Hessischen Ried
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Regionale Orientierung; die Datenabdeckung ist je Quelle unterschiedlich.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {COMMUNES.map((com) => (
              <div
                key={com.name}
                className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5"
              >
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="font-bold text-sm text-slate-100">
                    {com.name}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {com.zip}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {com.tagline}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* OPEN DATA / DEVELOPER CALLOUT */}
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <h3 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                Alle Daten maschinenlesbar als Open Data verfügbar
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Transparenz steht bei uns an erster Stelle: Alle Indikatoren zu
                Bauen, Demografie, Haushalt, Wirtschaft und Statistik sind über
                unsere offenen REST-APIs sowie als CSV-/JSON-Downloads frei verfügbar
                – lizenziert für Bürger, Journalismus, Wissenschaft und Hackathons.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                href="/daten"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition-colors"
              >
                <Database className="w-4 h-4" />
                Zu den Offenen Daten &amp; API
              </Link>
              <Link
                href="/quellen"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs sm:text-sm transition-colors"
              >
                Datenquellen &amp; Takte
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
