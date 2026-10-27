"use client";

import {
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Landmark,
  MapPin,
  Pill,
  PlusCircle,
  Recycle,
  Search,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type CulturalEvent,
  type RegionalFacility,
  type SocialKpiSummary,
  type ZakbWasteStat,
  generateIcsCalendar,
} from "@/lib/regionalStats";
import {
  parseSubpageParams,
  serializeSubpageParams,
  updateUrlDebounced,
} from "@/lib/urlState";
import EventCalendarWidget from "./EventCalendarWidget";
import { EVENT_TIME_ZONE, eventDay, eventTimeText, eventIsPast, eventOnDay, filterCalendarEvents } from "@/lib/eventCalendar";

interface Props {
  summaries: SocialKpiSummary[];
  wasteStats: ZakbWasteStat[];
  facilities: RegionalFacility[];
  events: CulturalEvent[];
  now: number;
  eventsUnavailable?: boolean;
}

export default function StatistikClient({
  summaries,
  wasteStats,
  facilities,
  events,
  now: initialNow,
  eventsUnavailable = false,
}: Props) {
  const [selectedMuni, setSelectedMuni] = useState<string>("Bürstadt");
  const [activeTab, setActiveTab] = useState<
    "all" | "employment" | "healthcare" | "waste" | "culture" | "tourism"
  >("all");
  const [facilityCategoryFilter, setFacilityCategoryFilter] =
    useState<string>("all");
  const [mounted, setMounted] = useState(false);

  // Initial read from URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const p = parseSubpageParams(window.location.search, {
        tab: "all",
        muni: "Bürstadt",
        cat: "all",
      });
      if (["all", "employment", "healthcare", "waste", "culture", "tourism"].includes(p.tab)) {
        setActiveTab(p.tab as typeof activeTab);
      }
      if (p.muni) setSelectedMuni(p.muni);
      if (p.cat) setFacilityCategoryFilter(p.cat);
      setMounted(true);

    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Listen to popstate
  useEffect(() => {
    const onPopState = () => {
      const p = parseSubpageParams(window.location.search, {
        tab: "all",
        muni: "Bürstadt",
        cat: "all",
      });
      if (["all", "employment", "healthcare", "waste", "culture", "tourism"].includes(p.tab)) {
        setActiveTab(p.tab as typeof activeTab);
      }
      setSelectedMuni(p.muni || "Bürstadt");
      setFacilityCategoryFilter(p.cat || "all");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Sync to URL
  useEffect(() => {
    if (!mounted) return;
    const query = serializeSubpageParams(
      {
        tab: activeTab,
        muni: selectedMuni,
        cat: facilityCategoryFilter,
      },
      { tab: "all", muni: "Bürstadt", cat: "all" }
    );
    updateUrlDebounced(query);
  }, [mounted, activeTab, selectedMuni, facilityCategoryFilter]);

  const muniList = useMemo(() => {
    return summaries.map((s) => s.municipality);
  }, [summaries]);

  const currentSummary = useMemo(() => {
    return (
      summaries.find((s) => s.municipality === selectedMuni)
    );
  }, [summaries, selectedMuni]);

  const hessenBenchmark = useMemo(() => {
    return summaries.find((s) => s.municipality === "Hessen");
  }, [summaries]);

  const currentWaste = useMemo(() => wasteStats.filter(
    (w) => w.municipality.toLowerCase() === selectedMuni.toLowerCase()
  ), [wasteStats, selectedMuni]);

  const totalWasteFraction = useMemo(() => {
    return currentWaste.find((w) => w.fraction === "total");
  }, [currentWaste]);

  const filteredFacilities = useMemo(() => {
    return facilities.filter((f) => {
      const matchMuni =
        selectedMuni === "Kreis Bergstraße" ||
        selectedMuni === "Hessen" ||
        f.municipality.toLowerCase() === selectedMuni.toLowerCase();
      const matchCat =
        facilityCategoryFilter === "all" ||
        f.category === facilityCategoryFilter ||
        (facilityCategoryFilter === "culture" && f.category === "culture_sports");
      return matchMuni && matchCat;
    });
  }, [facilities, selectedMuni, facilityCategoryFilter]);

  const [eventSearch, setEventSearch] = useState<string>("");
  const [eventCategoryFilter, setEventCategoryFilter] = useState<string>("all");
  const [eventMuniFilter, setEventMuniFilter] = useState<string>("all");
  const [eventTimeHorizon, setEventTimeHorizon] = useState<
    "upcoming" | "weekend" | "month" | "archive"
  >("upcoming");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [eventViewMode, setEventViewMode] = useState<"cards" | "calendar">("cards");
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  const handleDownloadIcs = (evt: CulturalEvent) => {
    try {
      const icsData = generateIcsCalendar(evt);
      const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${evt.id}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback
    }
  };

  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const calendarEvents = useMemo(() => filterCalendarEvents(events, {
    municipality: eventMuniFilter, category: eventCategoryFilter,
    search: eventSearch, horizon: eventTimeHorizon, now,
  }), [events, eventMuniFilter, eventCategoryFilter, eventSearch, eventTimeHorizon, now]);
  const filteredEvents = useMemo(() => selectedCalendarDate
    ? calendarEvents.filter(event => eventOnDay(event, selectedCalendarDate))
    : calendarEvents, [calendarEvents, selectedCalendarDate]);

  return (
    <div className="space-y-12">
      {currentSummary ? <>
      {/* 1. Municipal Switcher Bar */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg backdrop-blur-sm">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Region auswählen
          </div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            {selectedMuni}
            {selectedMuni === "Bürstadt" && (
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Kulturzentrum KAMÜ & Partnerstadt
              </span>
            )}
          </h2>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {muniList.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMuni(m)}
              className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                selectedMuni === m
                  ? "bg-emerald-500 text-slate-950 shadow-md font-semibold"
                  : "bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Key Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Unemployment */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-3 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Arbeitslosenquote
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-slate-100">
              {currentSummary.unemployment_rate !== null
                ? `${currentSummary.unemployment_rate.toFixed(1)} %`
                : "–"}
            </div>
            <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
              <TrendingDown className="w-3.5 h-3.5" />
              Hessen-Vergleichswert ({hessenBenchmark?.unemployment_rate ?? "–"}%)
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Arbeitslose gesamt:</span>
            <span className="font-semibold text-slate-200">
              {currentSummary.unemployed_count?.toLocaleString("de-DE") ?? "–"}
            </span>
          </div>
        </div>

        {/* Card 2: Healthcare Supply */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-3 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ärztliche Versorgung
            </span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
              <Stethoscope className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-slate-100">
              {currentSummary.gp_doctors_per_10k !== null
                ? `${currentSummary.gp_doctors_per_10k.toFixed(1)}`
                : "–"}
              <span className="text-sm font-normal text-slate-400 ml-1">/ 10k Einw.</span>
            </div>
            <p className="text-xs text-cyan-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Versorgungsgrad: {currentSummary.versorgungsgrad_pct?.toFixed(1) ?? "–"}%
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Apotheken vor Ort:</span>
            <span className="font-semibold text-slate-200">
              {currentSummary.pharmacies_count ?? "–"} Betriebe
            </span>
          </div>
        </div>

        {/* Card 3: ZAKB Recycling */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-3 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              ZAKB Recyclingquote
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <Recycle className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-slate-100">
              {totalWasteFraction?.recycling_rate_percent != null
                ? `${totalWasteFraction.recycling_rate_percent.toFixed(1)} %`
                : "–"}
            </div>
            <p className="text-xs text-amber-400 flex items-center gap-1 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              Wertstoffrückgewinnung ZAKB
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Abfallaufkommen:</span>
            <span className="font-semibold text-slate-200">
              {totalWasteFraction?.kg_per_capita != null
                ? `${totalWasteFraction.kg_per_capita.toFixed(1)} kg / Einw.`
                : "–"}
            </span>
          </div>
        </div>

        {/* Card 4: Clubs & Culture */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-3 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Vereine & Gemeinschaft
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-slate-100">
              {currentSummary.total_clubs_count !== null
                ? `${currentSummary.total_clubs_count}`
                : "–"}
              <span className="text-sm font-normal text-slate-400 ml-1">Vereine</span>
            </div>
            <p className="text-xs text-purple-300 flex items-center gap-1 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              {currentSummary.sports_clubs_count ?? "–"} Sport · {currentSummary.cultural_clubs_count ?? "–"} Kultur
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Kulturzentrum:</span>
            <span className="font-semibold text-purple-300">
              KAMÜ Bürstadt
            </span>
          </div>
        </div>
      </div>

      {/* 3. Section: Arbeitsmarkt & Soziale Sicherung (Benchmark Comparison) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              <Briefcase className="w-4 h-4" /> Arbeitsmarkt & Bürgergeld
            </div>
            <h3 className="text-xl font-bold text-slate-100">
              Arbeitslosigkeit & Soziale Sicherung im Vergleich
            </h3>
          </div>
          <span className="text-xs text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
            Arbeitsmarktdaten der gespeicherten Veröffentlichung
          </span>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
          Die Kennzahlen werden für die jeweils ausgewählte Kommune angezeigt.
          Fehlende Angaben werden nicht durch Werte anderer Kommunen ersetzt.

        </p>

        {/* Comparison Bars */}
        <div className="space-y-4 pt-2">
          {summaries.map((s) => {
            const rate = s.unemployment_rate;
            const maxRate = 7.0;
            const pctWidth = rate == null ? 0 : Math.min(100, Math.max(0, (rate / maxRate) * 100));
            const isCurrent = s.municipality === selectedMuni;

            return (
              <div
                key={s.municipality}
                className={`p-3.5 rounded-xl border transition-all ${
                  isCurrent
                    ? "bg-slate-900 border-emerald-500/50 shadow-md"
                    : "bg-slate-950/40 border-slate-850 opacity-80"
                }`}
              >
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-semibold text-slate-200 flex items-center gap-2">
                    {s.municipality}
                    {isCurrent && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Aktive Auswahl
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {rate != null ? `${rate.toFixed(1)} %` : "–"}
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      rate != null && rate > 5.0
                        ? "bg-amber-500"
                        : isCurrent
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : "bg-emerald-500/70"
                    }`}
                    style={{ width: `${pctWidth}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>SGB II Empfänger: {s.sgb2_recipients?.toLocaleString("de-DE") ?? "–"}</span>
                  <span>Quote: {s.sgb2_quota_pct?.toFixed(1) ?? "–"}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Section: ZAKB Abfallmengen & Recycling (Kreislaufwirtschaft) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
              <Recycle className="w-4 h-4" /> ZAKB Kreislaufwirtschaft & Bilanzen
            </div>
            <h3 className="text-xl font-bold text-slate-100">
              Abfallströme & Verwertungsquoten ({selectedMuni})
            </h3>
          </div>
          <Link
            href="/#karte"
            className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium"
          >
            <MapPin className="w-3.5 h-3.5" /> Wertstoffhöfe auf der Karte
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Recycling Highlights */}
          <div className="md:col-span-1 bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Regionale ZAKB Bilanz
              </div>
              <div className="text-4xl font-extrabold text-amber-400">
                {totalWasteFraction?.recycling_rate_percent?.toFixed(1) ?? "–"} %
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Angezeigt werden ausschließlich gespeicherte Abfallbilanzen der
                ausgewählten Kommune. Ohne Veröffentlichung bleibt die Angabe offen.
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-800 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Jahrestonnage gesamt:</span>
                <span className="font-mono font-bold">
                  {totalWasteFraction?.weight_tons.toLocaleString("de-DE") ?? "–"} t
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Pro-Kopf-Menge:</span>
                <span className="font-mono font-bold">
                  {totalWasteFraction?.kg_per_capita.toFixed(1) ?? "–"} kg / Einw.
                </span>
              </div>
            </div>
          </div>

          {/* Fraction Breakdown */}
          <div className="md:col-span-2 space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Zusammensetzung nach Fraktionen (kg pro Einwohner & Jahr)
            </h4>

            <div className="space-y-2.5">
              {currentWaste
                .filter((w) => w.fraction !== "total")
                .map((w) => {
                  const fractionLabels: Record<string, { label: string; color: string }> = {
                    biomuell: { label: "Biomüll (Grüne Tonne & Grünschnitt)", color: "bg-lime-500" },
                    restmuell: { label: "Restmüll (Graue Tonne)", color: "bg-slate-500" },
                    papier: { label: "Altpapier & Kartonage (Blaue Tonne)", color: "bg-sky-500" },
                    wertstoffe: { label: "Wertstoffe / Gelber Sack", color: "bg-amber-500" },
                    sperrmuell: { label: "Sperrmüll & Altholz", color: "bg-orange-500" },
                  };
                  const fInfo = fractionLabels[w.fraction] ?? {
                    label: w.fraction,
                    color: "bg-teal-500",
                  };
                  const totalKg = totalWasteFraction?.kg_per_capita ?? Number.NaN;
                  const pct = totalKg > 0 ? Math.round((w.kg_per_capita / totalKg) * 100) : null;

                  return (
                    <div
                      key={w.fraction}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-200">{fInfo.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-100">
                            {w.kg_per_capita.toFixed(1)} kg
                          </span>
                          <span className="text-[11px] text-slate-400">({pct} %)</span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${fInfo.color}`}
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Section: Einrichtungen & POIs (Healthcare, KAMÜ, Tourismus) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              <Building2 className="w-4 h-4" /> Regionale Einrichtungen & Kultur
            </div>
            <h3 className="text-xl font-bold text-slate-100">
              Ärzte, Apotheken, Kultur & Sehenswürdigkeiten
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFacilityCategoryFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                facilityCategoryFilter === "all"
                  ? "bg-slate-100 text-slate-950 border-slate-100 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-850 hover:text-white"
              }`}
            >
              Alle
            </button>
            <button
              onClick={() => setFacilityCategoryFilter("healthcare")}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                facilityCategoryFilter === "healthcare"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-850 hover:text-white"
              }`}
            >
              <Pill className="w-3 h-3" /> Gesundheit
            </button>
            <button
              onClick={() => setFacilityCategoryFilter("culture")}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                facilityCategoryFilter === "culture"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-850 hover:text-white"
              }`}
            >
              <Sparkles className="w-3 h-3" /> Kultur & Sport
            </button>
            <button
              onClick={() => setFacilityCategoryFilter("tourism")}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                facilityCategoryFilter === "tourism"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500 font-semibold"
                  : "bg-slate-950 text-slate-400 border-slate-850 hover:text-white"
              }`}
            >
              <Landmark className="w-3 h-3" /> Tourismus
            </button>
          </div>
        </div>

        {/* Facilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFacilities.map((f) => {
            const isKamue = f.id === "fac-kamue-kulturzentrum";
            const isNotdienst = f.extra_attributes?.emergency_duty;

            return (
              <div
                key={f.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                  isKamue
                    ? "bg-purple-950/20 border-purple-500/40 hover:border-purple-400"
                    : isNotdienst
                    ? "bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-400"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                        f.category === "healthcare"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : f.category === "culture_sports"
                          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {f.extra_attributes?.badge || f.category}
                    </span>

                    {isNotdienst && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                        Notdienst aktiv
                      </span>
                    )}
                  </div>

                  <h4 className="font-bold text-slate-100 text-base leading-snug">
                    {f.name}
                  </h4>

                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                    {f.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{f.street_address}, {f.municipality}</span>
                  </div>

                  {f.phone && (
                    <div className="text-[11px] text-slate-400">
                      Tel: <span className="font-mono text-slate-300">{f.phone}</span>
                    </div>
                  )}

                  {f.website && (
                    <a
                      href={f.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 pt-1"
                    >
                      Website besuchen
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      </> : <p role="status" className="text-sm text-slate-400">Die regionalen Kennzahlen sind derzeit nicht verfügbar. Der Veranstaltungskalender wird unabhängig geladen.</p>}

      {/* 6. Section: Kultur- & Veranstaltungskalender (KAMÜ Spotlight & Ried Events) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden">
        {/* Background glow decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider">
              <Calendar className="w-4 h-4" /> Was ist los im Ried?
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-100">
              Ried-Veranstaltungskalender & Kultur
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Geprüfte Termine aus Bürstadt, Lampertheim, Biblis & Groß-Rohrheim.
              Termine aus kommunalen Kalendern sowie angebundenen Vereins- und Ortsteilkalendern.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setShowSubmitModal(true);
                setSubmitSuccess(false);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5 text-purple-400" />
              Event melden
            </button>
            <a
              href="https://kamue.me"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 text-purple-300 hover:text-purple-200 text-xs font-semibold transition-colors shadow-sm"
            >
              KAMÜ Tickets
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {eventsUnavailable && <p role="alert" className="text-sm text-amber-300">Die Veranstaltungsdaten sind derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.</p>}

        {/* Search & Filter Control Bar */}
        <div className="space-y-3 bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800/80">
          {/* Top row: Live Search & View Mode Switch */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Veranstaltung, Verein oder Ort suchen (z. B. Kerwe, Spargel, CHAKO, Repair)..."
                className="w-full bg-slate-900 border border-slate-750 focus:border-purple-500 rounded-xl pl-9 pr-9 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
              />
              {eventSearch && (
                <button
                  type="button"
                  onClick={() => setEventSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  title="Suche leeren"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setEventViewMode("cards")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  eventViewMode === "cards"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ⊞ Kacheln
              </button>
              <button
                type="button"
                onClick={() => setEventViewMode("calendar")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  eventViewMode === "calendar"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📅 Kalender
              </button>
            </div>
          </div>

          {/* Second row: Time Horizon Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/60">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-purple-400" /> Zeitraum:
            </span>
            {[
              { id: "upcoming", label: "Alle Zukünftigen" },
              { id: "weekend", label: "Dieses Wochenende" },
              { id: "month", label: "Diesen Monat" },
              { id: "archive", label: "📁 Historisches Archiv" },
            ].map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => {
                  setEventTimeHorizon(th.id as typeof eventTimeHorizon);
                  setSelectedCalendarDate(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  eventTimeHorizon === th.id
                    ? "bg-purple-950 text-purple-200 border border-purple-600 font-bold"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800"
                }`}
              >
                {th.label}
              </button>
            ))}
          </div>

          {/* Third row: Municipality & Category Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400" /> Ort:
              </span>
              {[
                { id: "all", label: "Alle Orte" },
                { id: "Bürstadt", label: "Bürstadt" },
                { id: "Lampertheim", label: "Lampertheim" },
                { id: "Biblis", label: "Biblis" },
                { id: "Groß-Rohrheim", label: "Groß-Rohrheim" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setEventMuniFilter(m.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                    eventMuniFilter === m.id
                      ? "bg-emerald-950 text-emerald-200 border border-emerald-600 font-bold"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="h-4 w-[1px] bg-slate-800 hidden md:block" />

            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Rubrik:</span>
              {[
                { id: "all", label: "Alle Rubriken" },
                { id: "festival", label: "Feste & Kerwe" },
                { id: "concert", label: "Konzerte" },
                { id: "theater", label: "Theater & Comedy" },
                { id: "market", label: "Märkte" },
                { id: "sports", label: "Sport & Vereine" },
                { id: "civic", label: "Civic & ZAKB" },
                { id: "workshop", label: "Workshops & KAMÜ" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEventCategoryFilter(c.id)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] transition-colors ${
                    eventCategoryFilter === c.id
                      ? "bg-slate-200 text-slate-950 font-bold shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Optional Calendar Widget View */}
        {eventViewMode === "calendar" && (
          <div className="animate-in fade-in duration-200">
            <EventCalendarWidget
              events={calendarEvents}
              now={now}
              selectedDate={selectedCalendarDate}
              onSelectDate={(d) => setSelectedCalendarDate(d)}
            />
          </div>
        )}

        {/* Filter Summary & Hits Count */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <div>
            Gefunden: <strong className="text-slate-200">{filteredEvents.length}</strong>{" "}
            {filteredEvents.length === 1 ? "Veranstaltung" : "Veranstaltungen"}
            {selectedCalendarDate && (
              <span className="ml-2 px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[11px]">
                am {selectedCalendarDate}
              </span>
            )}
            {eventTimeHorizon === "archive" && (
              <span className="ml-2 px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                Historisches Archiv
              </span>
            )}
          </div>

          {(eventSearch ||
            eventCategoryFilter !== "all" ||
            eventMuniFilter !== "all" ||
            selectedCalendarDate ||
            eventTimeHorizon !== "upcoming") && (
            <button
              type="button"
              onClick={() => {
                setEventSearch("");
                setEventCategoryFilter("all");
                setEventMuniFilter("all");
                setEventTimeHorizon("upcoming");
                setSelectedCalendarDate(null);
              }}
              className="text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Filter zurücksetzen
            </button>
          )}
        </div>

        {/* Event Cards Grid */}
        {!eventsUnavailable && (filteredEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEvents.map((evt) => {
              const startDate = new Date(evt.start_time);
              const dayStr = eventDay(evt.start_time).slice(-2);
              const monthStr = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: EVENT_TIME_ZONE })
                .format(startDate)
                .toUpperCase();
              const isPast = eventIsPast(evt, now);

              return (
                <div
                  key={evt.id}
                  className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-all hover:border-slate-700 ${
                    isPast
                      ? "bg-slate-950/50 border-slate-850 opacity-80"
                      : "bg-slate-950/80 border-slate-800 shadow-md"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Date Pill + Category & Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-12 h-12 rounded-xl bg-purple-950/70 border border-purple-800/60 flex flex-col items-center justify-center shrink-0 shadow-inner">
                          <span className="text-[10px] uppercase font-bold text-purple-300 leading-none">
                            {monthStr}
                          </span>
                          <span className="text-base font-extrabold text-white leading-none mt-0.5">
                            {dayStr}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs text-slate-300 font-semibold">
                            <Clock className="w-3 h-3 text-purple-400" />
                            {eventTimeText(evt)}
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium">
                            {evt.municipality}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 capitalize">
                          {evt.category}
                        </span>
                        {evt.is_free && (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            Eintritt frei
                          </span>
                        )}
                        {evt.status === "cancelled" && <span className="text-[10px] font-semibold text-red-300 bg-red-950/50 border border-red-800 px-2 py-0.5 rounded-full">Abgesagt</span>}
                        {evt.status === "postponed" && <span className="text-[10px] font-semibold text-amber-300">Verschoben</span>}
                        {isPast && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                            Archiv
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h4 className="text-base font-bold text-slate-100 leading-snug">
                        {evt.title}
                      </h4>
                      {evt.description && (
                        <p className="text-xs text-slate-300 leading-relaxed mt-1.5 line-clamp-3">
                          {evt.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bottom: Location, Organizer & Action Buttons */}
                  <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-3">
                    <div className="flex flex-col text-xs text-slate-400 space-y-0.5">
                      <div className="text-slate-200 font-medium flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{evt.venue_name}</span>
                        {evt.street_address && (
                          <span className="text-slate-400 text-[11px]">
                            ({evt.street_address})
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-[11px] pl-5">
                        Veranstalter: {evt.organizer}
                        {evt.source && (
                          <span className="ml-1.5 text-slate-500 font-mono text-[10px]">
                            · {evt.source.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      {/* .ICS Calendar Download Button */}
                      <button
                        type="button"
                        onClick={() => handleDownloadIcs(evt)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                        title="Termin in Apple-, Google- oder Outlook-Kalender speichern (.ics)"
                      >
                        <Download className="w-3 h-3 text-purple-400" />
                        In Kalender (.ics)
                      </button>

                      {/* External details link (if verified) */}
                      {(evt.ticket_url || evt.event_url) && (
                        <a
                          href={evt.ticket_url || evt.event_url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-800/70 text-purple-200 hover:text-white text-xs font-semibold transition-colors shrink-0"
                        >
                          {evt.is_free ? "Details & Ort" : "Tickets & Info"}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-950/40 border border-slate-800 rounded-2xl space-y-3">
            <Calendar className="w-8 h-8 text-purple-400/60 mx-auto" />
            <h4 className="text-base font-bold text-slate-200">
              Keine Termine für diesen Filter gefunden
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Versuchen Sie, den Suchbegriff anzupassen oder schalten Sie auf{" "}
              <strong className="text-purple-300">„Historisches Archiv“</strong> bzw.{" "}
              <strong className="text-purple-300">„Alle Zukünftigen“</strong> um.
            </p>
            <button
              type="button"
              onClick={() => {
                setEventSearch("");
                setEventCategoryFilter("all");
                setEventMuniFilter("all");
                setEventTimeHorizon("upcoming");
                setSelectedCalendarDate(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 text-xs font-semibold transition-colors"
            >
              Filter zurücksetzen
            </button>
          </div>
        ))}

        {/* Modal: Veranstaltung melden / vorschlagen */}
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-750 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 relative">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="absolute right-5 top-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-400 uppercase tracking-wider">
                  <PlusCircle className="w-4 h-4" /> Ried-Community
                </div>
                <h3 className="text-lg font-bold text-slate-100">
                  Veranstaltung einreichen
                </h3>
                <p className="text-xs text-slate-400">
                  Ihr Verein, Ihre Initiative oder Gemeinde plant ein Event im Ried?
                  Reichen Sie Ihren Termin hier zur Prüfung in unserer Datenbank ein.
                </p>
              </div>

              {submitSuccess ? (
                <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-800 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="text-sm font-bold text-emerald-200">
                    Vielen Dank für Ihre Einreichung!
                  </h4>
                  <p className="text-xs text-slate-300">
                    Ihr Termin wird geprüft und bei nächster Synchronisation im regionalen
                    Kalender eingepflegt.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="mt-2 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs"
                  >
                    Schließen
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubmitSuccess(true);
                  }}
                  className="space-y-3 text-xs"
                >
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Titel der Veranstaltung *</label>
                    <input
                      required
                      type="text"
                      placeholder="z. B. TV Bürstadt Sommerfest"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-300 font-medium">Kommune *</label>
                      <select
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                      >
                        <option value="Bürstadt">Bürstadt</option>
                        <option value="Lampertheim">Lampertheim</option>
                        <option value="Biblis">Biblis</option>
                        <option value="Groß-Rohrheim">Groß-Rohrheim</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-300 font-medium">Datum *</label>
                      <input
                        required
                        type="date"
                        defaultValue="2026-10-15"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-300 font-medium">Veranstalter / Verein *</label>
                      <input
                        required
                        type="text"
                        placeholder="z. B. Turnverein 1891 Bürstadt"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-300 font-medium">Kategorie</label>
                      <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500">
                        <option value="festival">Feste & Kerwe</option>
                        <option value="concert">Konzert & Musik</option>
                        <option value="theater">Theater & Comedy</option>
                        <option value="sports">Sport</option>
                        <option value="market">Markt</option>
                        <option value="civic">Verein & Soziales</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Website / Info-Link (optional)</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Kurze Beschreibung</label>
                    <textarea
                      rows={2}
                      placeholder="Worum geht es bei der Veranstaltung? Eintritt frei?"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowSubmitModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md"
                    >
                      Termin vorschlagen
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 7. Bottom Navigation Link to Map */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-teal-950/40 border border-slate-800 p-6 sm:p-8 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h4 className="text-lg font-bold text-slate-100">
            Standorte auf der interaktiven Karte erkunden
          </h4>
          <p className="text-sm text-slate-400">
            Apotheken, Ärzte, Kulturzentren und Tourismus-Attraktionen sind auch
            auf unserer Live-Karte mit Filtern verfügbar.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 font-bold hover:bg-emerald-300 transition-colors shrink-0 shadow-lg"
        >
          <MapPin className="w-4 h-4" />
          Zur Karte wechseln
        </Link>
      </div>
    </div>
  );
}
