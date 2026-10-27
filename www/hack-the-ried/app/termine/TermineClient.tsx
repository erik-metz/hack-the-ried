"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  Clock,
  MapPin,
  ExternalLink,
  Download,
  Search,
  X,
  Filter,
  Sparkles,
  Ticket,
  PlusCircle,
  Activity,
  Wind,
  Volume2,
  Trash2,
  Car,
  Building2,
  Users,
  Compass,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  type CulturalEvent,
  generateIcsCalendar,
  generateGoogleCalendarUrl,
} from "@/lib/regionalStats";
import {
  parseSubpageParams,
  serializeSubpageParams,
  updateUrlDebounced,
} from "@/lib/urlState";
import EventCalendarWidget from "../statistik/EventCalendarWidget";

import { EVENT_TIME_ZONE, eventTimeText, eventIsPast, eventOnDay, filterCalendarEvents } from "@/lib/eventCalendar";

interface TermineClientProps {
  initialEvents: CulturalEvent[];
  now: number;
  eventsUnavailable?: boolean;
}

const CATEGORY_META: Record<
  string,
  { label: string; color: string; badge: string; icon: string }
> = {
  festival: {
    label: "Feste & Kerwen",
    color: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    badge: "bg-amber-400",
    icon: "🎪",
  },
  market: {
    label: "Märkte & Messen",
    color: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    badge: "bg-orange-400",
    icon: "🛍️",
  },
  concert: {
    label: "Konzerte & Musik",
    color: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    badge: "bg-purple-400",
    icon: "🎵",
  },
  theater: {
    label: "Kultur & Theater",
    color: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    badge: "bg-pink-400",
    icon: "🎭",
  },
  sports: {
    label: "Sport & Aktivität",
    color: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    badge: "bg-sky-400",
    icon: "🏃",
  },
  civic: {
    label: "Vereine & Bürgertreffs",
    color: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    badge: "bg-teal-400",
    icon: "🤝",
  },
  workshop: {
    label: "Workshops & Bildung",
    color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    badge: "bg-emerald-400",
    icon: "💡",
  },
  exhibition: {
    label: "Ausstellungen & Museen",
    color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    badge: "bg-indigo-400",
    icon: "🖼️",
  },
};

const MUNICIPALITIES = [
  { id: "all", label: "Alle Kommunen" },
  { id: "Bürstadt", label: "Bürstadt" },
  { id: "Lampertheim", label: "Lampertheim" },
  { id: "Biblis", label: "Biblis" },
  { id: "Groß-Rohrheim", label: "Groß-Rohrheim" },
];

export default function TermineClient({ initialEvents, now: initialNow, eventsUnavailable = false }: TermineClientProps) {
  const [events, setEvents] = useState<CulturalEvent[]>(initialEvents);
  const [selectedMuni, setSelectedMuni] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [timeHorizon, setTimeHorizon] = useState<
    "upcoming" | "weekend" | "month" | "archive"
  >("upcoming");
  const [viewMode, setViewMode] = useState<"calendar" | "cards" | "list">("calendar");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Submission Modal State
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [submitSubmitting, setSubmitSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState("");
  const [formOrganizer, setFormOrganizer] = useState("");
  const [formMuni, setFormMuni] = useState("Bürstadt");
  const [formVenue, setFormVenue] = useState("");
  const [formStreet, setFormStreet] = useState("");
  const [formPostal, setFormPostal] = useState("68642");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("18:00");
  const [formEndTime, setFormEndTime] = useState("21:00");
  const [formCategory, setFormCategory] = useState("civic");
  const [formDesc, setFormDesc] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formIsFree, setFormIsFree] = useState(true);
  const [formVisitors, setFormVisitors] = useState("");

  const [mounted, setMounted] = useState(false);

  // URL state synchronization
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const p = parseSubpageParams(window.location.search, {
        muni: "all",
        cat: "all",
        horizon: "upcoming",
        view: "calendar",
      });
      if (p.muni) setSelectedMuni(p.muni);
      if (p.cat) setSelectedCategory(p.cat);
      if (["upcoming", "weekend", "month", "archive"].includes(p.horizon)) {
        setTimeHorizon(p.horizon as typeof timeHorizon);
      }
      if (["calendar", "cards", "list"].includes(p.view)) {
        setViewMode(p.view as typeof viewMode);
      }
      setMounted(true);

    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const query = serializeSubpageParams(
      {
        muni: selectedMuni,
        cat: selectedCategory,
        horizon: timeHorizon,
        view: viewMode,
      },
      { muni: "all", cat: "all", horizon: "upcoming", view: "calendar" }
    );
    updateUrlDebounced(query);
  }, [mounted, selectedMuni, selectedCategory, timeHorizon, viewMode]);

  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const calendarEvents = useMemo(() => filterCalendarEvents(events, {
    municipality: selectedMuni, category: selectedCategory,
    search: searchQuery, horizon: timeHorizon, now,
  }), [events, selectedMuni, selectedCategory, searchQuery, timeHorizon, now]);
  const filteredEvents = useMemo(() => selectedCalendarDate
    ? calendarEvents.filter(event => eventOnDay(event, selectedCalendarDate))
    : calendarEvents, [calendarEvents, selectedCalendarDate]);
  const stats = useMemo(() => {
    const upcomingCount = filterCalendarEvents(events, { municipality: "all", category: "all", search: "", horizon: "upcoming", now }).length;
    const pastCount = filterCalendarEvents(events, { municipality: "all", category: "all", search: "", horizon: "archive", now }).length;
    return { upcomingCount, pastCount, orgs: new Set(events.map(event => event.organizer)).size };
  }, [events, now]);

  const handleDownloadIcs = (evt: CulturalEvent) => {
    try {
      const icsData = generateIcsCalendar(evt);
      const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${evt.id || "event"}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate ICS", err);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitSubmitting(true);
    setSubmitError(null);

    try {
      const startIso = `${formDate}T${formStartTime}:00+02:00`;
      const endIso = formEndTime ? `${formDate}T${formEndTime}:00+02:00` : null;

      const payload = {
        title: formTitle,
        organizer: formOrganizer,
        municipality: formMuni,
        venue_name: formVenue || formMuni,
        street_address: formStreet || null,
        postal_code: formPostal || null,
        start_time: startIso,
        end_time: endIso,
        category: formCategory,
        description: formDesc || null,
        event_url: formUrl || null,
        is_free: formIsFree,
        expected_visitors: formVisitors ? parseInt(formVisitors, 10) : null,
      };

      const res = await fetch("/api/events/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Fehler beim Übermitteln des Termins");
      }

      const created: CulturalEvent = await res.json();
      setEvents((prev) => [created, ...prev]);
      setSubmitSuccess(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Unerwarteter Fehler beim Einreichen.");
    } finally {
      setSubmitSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {eventsUnavailable && <p role="alert" className="text-sm text-amber-300">Die Veranstaltungsdaten sind derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.</p>}
      {/* 1. Hero Header & Quick Stats */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-925 to-slate-950 border border-slate-800 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold uppercase tracking-wider">
              <CalendarDays className="w-3.5 h-3.5 text-purple-400" />
              Veranstaltungskalender & Bürgerleben
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 tracking-tight leading-tight">
              Was ist los im <span className="text-purple-400">Ried</span>?
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Zentrale Plattform für Termine, Vereinsfeste, Kultur und Märkte in{" "}
              <strong>Bürstadt, Lampertheim, Biblis & Groß-Rohrheim</strong>. Mit 1-Klick-Kalenderexport
              und direkter Korrelation zu den regionalen Umweltsensoren.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowSubmitModal(true);
                setSubmitSuccess(false);
                setSubmitError(null);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-purple-600/20 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              Termin einreichen
            </button>
            <a
              href="https://kamue.me"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-750 text-slate-200 text-xs sm:text-sm font-medium transition-all"
            >
              <span>KAMÜ Kultur</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-8 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-900/80 rounded-2xl p-3 sm:p-4 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-medium">Anstehende Termine</div>
            <div className="text-2xl sm:text-3xl font-bold text-purple-400 mt-1">{stats.upcomingCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Konzerte, Feste & Treffs</div>
          </div>
          <div className="bg-slate-900/80 rounded-2xl p-3 sm:p-4 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-medium">Archivierte Events</div>
            <div className="text-2xl sm:text-3xl font-bold text-amber-400 mt-1">{stats.pastCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Historische Referenzdaten</div>
          </div>
          <div className="bg-slate-900/80 rounded-2xl p-3 sm:p-4 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-medium">Veranstalter & Vereine</div>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-1">{stats.orgs}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Ehrenamt & Kommunen</div>
          </div>
          <div className="bg-slate-900/80 rounded-2xl p-3 sm:p-4 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-medium">Ried-Kommunen</div>
            <div className="text-2xl sm:text-3xl font-bold text-sky-400 mt-1">4</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Gemeinsamer Kalender</div>
          </div>
        </div>
      </section>

      {/* 2. Control Bar: Search, Municipality Tabs, Time Horizon & View Switcher */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
        {/* Row 1: Search & View Mode Switcher */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Veranstaltung, Verein, Ort oder Straße suchen (z. B. Kerwe, Spargel, Konzert, Repair)..."
              className="w-full bg-slate-950 border border-slate-750 focus:border-purple-500 rounded-xl pl-9 pr-9 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title="Suche leeren"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "calendar"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📅 Kalender
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "cards"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⊞ Kacheln
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "list"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ☰ Liste
            </button>
          </div>
        </div>

        {/* Row 2: Municipalities & Time Horizon */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-slate-800/60">
          {/* Municipalities */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {MUNICIPALITIES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMuni(m.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedMuni === m.id
                    ? "bg-purple-500/20 text-purple-200 border border-purple-500/40 shadow-sm"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-850"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Time Horizon */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-[11px] text-slate-500 uppercase font-mono mr-1">Zeitraum:</span>
            {[
              { id: "upcoming", label: "Anstehend" },
              { id: "weekend", label: "Wochenende" },
              { id: "month", label: "Diesen Monat" },
              { id: "archive", label: "Archiv (Vergangene)" },
            ].map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setTimeHorizon(h.id as typeof timeHorizon);
                  setSelectedCalendarDate(null);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  timeHorizon === h.id
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                    : "text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800/80"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              selectedCategory === "all"
                ? "bg-slate-200 text-slate-950 font-bold"
                : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            Alle Kategorien ({events.length})
          </button>
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const count = events.filter((e) => e.category === key).length;
            const isSelected = selectedCategory === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedCategory(key)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all border ${
                  isSelected
                    ? `${meta.color} font-bold ring-1 ring-purple-500/50`
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
                <span className="text-[10px] opacity-75 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected Day Filter Badge */}
      {selectedCalendarDate && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-purple-900/30 border border-purple-500/40 text-xs text-purple-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              Gefiltert auf Datum:{" "}
              <strong>
                {new Date(selectedCalendarDate).toLocaleDateString("de-DE", { timeZone: EVENT_TIME_ZONE,
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCalendarDate(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-white font-medium transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Filter aufheben
          </button>
        </div>
      )}

      {/* 3. Main Views: Calendar, Cards or List */}
      {viewMode === "calendar" && (
        <div className="space-y-6">
          <EventCalendarWidget
            events={calendarEvents}
            now={now}
            selectedDate={selectedCalendarDate}
            onSelectDate={(d) => setSelectedCalendarDate(d)}
          />

          {/* Events matching the calendar selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>
                {filteredEvents.length}{" "}
                {filteredEvents.length === 1 ? "Veranstaltung" : "Veranstaltungen"}{" "}
                {selectedCalendarDate ? "an diesem Tag" : "in der Auswahl"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEvents.map((evt) => (
                <EventCard
                  key={evt.id}
                  event={evt}
                  now={now}
                  onDownloadIcs={() => handleDownloadIcs(evt)}
                />
              ))}
            </div>

            {filteredEvents.length === 0 && (
              <div className="text-center py-12 rounded-2xl bg-slate-900/30 border border-slate-800/60 p-6 space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">
                  Keine Termine für diese Auswahl gefunden
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Versuchen Sie den Datumsfilter aufzuheben oder die Kommune / Kategorie zu ändern.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === "cards" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              {filteredEvents.length}{" "}
              {filteredEvents.length === 1 ? "Veranstaltung" : "Veranstaltungen"} gefunden
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map((evt) => (
              <EventCard
                key={evt.id}
                event={evt}
                now={now}
                onDownloadIcs={() => handleDownloadIcs(evt)}
              />
            ))}
          </div>

          {filteredEvents.length === 0 && (
            <div className="text-center py-16 rounded-2xl bg-slate-900/30 border border-slate-800/60 p-6 space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Keine Termine gefunden
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Passen Sie die Filter an oder wechseln Sie in das Archiv.
              </p>
            </div>
          )}
        </div>
      )}

      {viewMode === "list" && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[11px] font-mono">
                <tr>
                  <th className="py-3.5 px-4">Datum & Uhrzeit</th>
                  <th className="py-3.5 px-4">Veranstaltung</th>
                  <th className="py-3.5 px-4">Ort / Kommune</th>
                  <th className="py-3.5 px-4">Kategorie</th>
                  <th className="py-3.5 px-4">Veranstalter</th>
                  <th className="py-3.5 px-4 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredEvents.map((evt) => {
                  const start = new Date(evt.start_time);
                  const isPast = eventIsPast(evt, now);
                  const meta = CATEGORY_META[evt.category] || CATEGORY_META.civic;

                  return (
                    <tr
                      key={evt.id}
                      className={`hover:bg-slate-850/50 transition-colors ${
                        isPast ? "opacity-75" : ""
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-100">
                          {start.toLocaleDateString("de-DE", { timeZone: EVENT_TIME_ZONE,
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {eventTimeText(evt)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100 max-w-md line-clamp-1">
                          {evt.title}
                          {evt.status === "cancelled" && <span className="ml-2 text-red-300">Abgesagt</span>}
                          {evt.status === "postponed" && <span className="ml-2 text-amber-300">Verschoben</span>}
                        </div>
                        {evt.description && (
                          <div className="text-[11px] text-slate-400 line-clamp-1 max-w-md mt-0.5">
                            {evt.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-slate-200 font-medium">{evt.municipality}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {evt.venue_name}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${meta.color}`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-xs max-w-[160px] truncate">
                        {evt.organizer}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDownloadIcs(evt)}
                            title="Als .ics herunterladen"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-400 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={generateGoogleCalendarUrl(evt)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="In Google Kalender öffnen"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-400 transition-colors"
                          >
                            <CalendarIcon className="w-3.5 h-3.5" />
                          </a>
                          {(evt.event_url || evt.ticket_url) && (
                            <a
                              href={evt.event_url || evt.ticket_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Details aufrufen"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredEvents.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">
                Keine Termine für diese Auswahl vorhanden.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Sensor & Environmental Correlations Section ("Zusammenhänge") */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-925 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-2 border-b border-slate-800 pb-5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            <Activity className="w-4 h-4" /> Smart City & Sensorik im Ried
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
            Zusammenhänge: Veranstaltungen & LoRaWAN-Sensordaten
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
            Warum werden alle Termine (auch vergangene) in der zentralen Datenbank gespeichert?
            Großveranstaltungen, Bürgerfeste und Kerwen beeinflussen das urbane Mikroklima,
            Verkehrsströme und Abfallmengen im Hessischen Ried direkt:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <Wind className="w-4 h-4 shrink-0" />
              <span>Feinstaub (PM2.5 & PM10)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Bei Festen wie der <strong>Bürstädter Kerwe</strong> oder dem{" "}
              <strong>Spargelfest Lampertheim</strong> führen Essensstände, Imbiss-Holzkohlegrills und
              zusätzlicher PKW-Suchverkehr zu messbaren Feinstaubspitzen an unseren Innenstadt-Sensorknoten.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
              <Volume2 className="w-4 h-4 shrink-0" />
              <span>Akustik & Schallpegel</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Open-Air-Konzerte (z. B. <em>ROSENGARTEN ROCKT</em> oder Live-Bühnen am Altrhein)
              erzeugen temporäre Geräuschpegel-Ausschläge. Historische Zeitstempel ermöglichen den Abgleich
              mit sensorischen Lärmmessungen.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Kreislaufwirtschaft & ZAKB</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Nach Festwochenenden registriert der ZAKB signifikante Mengensprünge bei Altglas und
              Verpackungswertstoffen. Die Verknüpfung belegt den Mehrbedarf an Entsorgungsinfrastruktur.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
              <Car className="w-4 h-4 shrink-0" />
              <span>Verkehr & Bahnübergänge</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Straßensperrungen während des <em>Bürstädter Fastnachtsumzugs</em> oder des{" "}
              <em>Stadtlaufs</em> verlagern Fahrzeugströme und beeinflussen die Taktzeiten und Schließdauer
              der Riedbahn-Bahnübergänge.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Mikroklima & Hitze-Resilienz</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Die BME280/SHT31-Sensoren zeigen städtische Hitzeinseln. An Hitzetagen über 32 °C verschieben
              sich Besucherfrequenzen bei Freiluftveranstaltungen messbar in die Abendstunden.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
              <Compass className="w-4 h-4 shrink-0" />
              <span>Georeferenzierte POIs</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Jeder Veranstaltungsort ist mit Geokoordinaten hinterlegt. Dadurch können Besucher direkt von
              der Karte aus sehen, welche Sensorknoten sich in Laufdistanz zur Veranstaltung befinden.
            </p>
          </div>
        </div>
      </section>

      {/* 5. "Termin einreichen" Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {submitSuccess ? (
              <div className="text-center py-8 space-y-4">
                <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
                <h3 className="text-xl font-bold text-slate-100">Termin erfolgreich eingereicht!</h3>
                <p className="text-xs sm:text-sm text-slate-300">
                  Vielen Dank für Ihren Beitrag zum Veranstaltungskalender im Ried. Der Termin wurde
                  erfasst und ist sofort in der Übersicht verfügbar.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                >
                  Schließen
                </button>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-slate-100">
                    Termin für Verein oder Initiative melden
                  </h3>
                  <p className="text-xs text-slate-400">
                    Kostenfreier Eintrag für Vereine, Bürgerinitiativen und Kulturschaffende im Ried.
                  </p>
                </div>

                {submitError && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
                    {submitError}
                  </div>
                )}

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Titel der Veranstaltung *
                    </label>
                    <input
                      type="text"
                      required
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="z. B. Tag der offenen Tür Feuerwehr"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Veranstalter / Verein *
                      </label>
                      <input
                        type="text"
                        required
                        value={formOrganizer}
                        onChange={(e) => setFormOrganizer(e.target.value)}
                        placeholder="z. B. TSG Bürstadt"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Kommune *
                      </label>
                      <select
                        value={formMuni}
                        onChange={(e) => setFormMuni(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      >
                        <option value="Bürstadt">Bürstadt</option>
                        <option value="Lampertheim">Lampertheim</option>
                        <option value="Biblis">Biblis</option>
                        <option value="Groß-Rohrheim">Groß-Rohrheim</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Veranstaltungsort
                      </label>
                      <input
                        type="text"
                        value={formVenue}
                        onChange={(e) => setFormVenue(e.target.value)}
                        placeholder="z. B. Bürgerhaus oder Vereinsheim"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Kategorie
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      >
                        <option value="civic">Vereine & Bürgertreffs</option>
                        <option value="festival">Feste & Kerwen</option>
                        <option value="concert">Konzerte & Musik</option>
                        <option value="theater">Kultur & Theater</option>
                        <option value="sports">Sport & Aktivität</option>
                        <option value="market">Märkte & Messen</option>
                        <option value="workshop">Workshops & Bildung</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Datum *</label>
                      <input
                        type="date"
                        required
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Beginn *</label>
                      <input
                        type="time"
                        required
                        value={formStartTime}
                        onChange={(e) => setFormStartTime(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Ende</label>
                      <input
                        type="time"
                        value={formEndTime}
                        onChange={(e) => setFormEndTime(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Beschreibung</label>
                    <textarea
                      rows={2}
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Worum geht es? Besonderheiten, Programm..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Weblink / Tickets
                      </label>
                      <input
                        type="url"
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Erwartete Besucher (ca.)
                      </label>
                      <input
                        type="number"
                        value={formVisitors}
                        onChange={(e) => setFormVisitors(e.target.value)}
                        placeholder="z. B. 200"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="isFreeCheck"
                      checked={formIsFree}
                      onChange={(e) => setFormIsFree(e.target.checked)}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="isFreeCheck" className="text-slate-300 cursor-pointer">
                      Eintritt frei (kostenlose Veranstaltung)
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={submitSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {submitSubmitting ? "Wird eingetragen..." : "Termin eintragen"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual Event Card Component
 */
function EventCard({
  event,
  onDownloadIcs,
  now,
}: {
  event: CulturalEvent;
  now: number;
  onDownloadIcs: () => void;
}) {
  const start = new Date(event.start_time);
  const isPast = eventIsPast(event, now);
  const meta = CATEGORY_META[event.category] || CATEGORY_META.civic;

  const dateDay = start.toLocaleDateString("de-DE", { timeZone: EVENT_TIME_ZONE, day: "2-digit" });
  const dateMonth = start.toLocaleDateString("de-DE", { timeZone: EVENT_TIME_ZONE, month: "short" }).toUpperCase();
  const dateWeekday = start.toLocaleDateString("de-DE", { timeZone: EVENT_TIME_ZONE, weekday: "short" });


  return (
    <div
      className={`group flex flex-col justify-between bg-slate-900/80 border rounded-2xl p-5 hover:border-purple-500/50 transition-all duration-200 shadow-lg relative overflow-hidden ${
        isPast ? "border-slate-800/50 opacity-80" : "border-slate-800"
      }`}
    >
      <div className="space-y-4">
        {/* Top: Date Badge, Municipality & Category */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center w-12 h-13 rounded-xl bg-purple-950/60 border border-purple-500/30 text-center shrink-0">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                {dateMonth}
              </span>
              <span className="text-lg font-black text-slate-100 leading-none">
                {dateDay}
              </span>
              <span className="text-[9px] text-slate-400 font-mono">{dateWeekday}</span>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-400">{event.municipality}</div>
              <div className="text-xs text-slate-300 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>
                  {eventTimeText(event)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-semibold border ${meta.color}`}
            >
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </span>

            {event.status === "cancelled" && <span className="text-xs text-red-300">Abgesagt</span>}
            {event.status === "postponed" && <span className="text-xs text-amber-300">Verschoben</span>}
            {isPast ? (
              <span className="text-[10px] font-mono text-amber-400/80 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                Archiv
              </span>
            ) : (
              event.is_free === true && (
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
                  Eintritt frei
                </span>
              )
            )}
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-slate-100 group-hover:text-purple-300 transition-colors line-clamp-2">
            {event.title}
          </h3>
          {event.description && (
            <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
              {event.description}
            </p>
          )}
        </div>

        {/* Location & Organizer Info */}
        <div className="space-y-1 pt-2 border-t border-slate-800/60 text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="truncate">
              {event.venue_name}
              {event.street_address ? `, ${event.street_address}` : ""}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <Users className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">Veranstalter: {event.organizer}</span>
          </div>

          {event.expected_visitors && (
            <div className="text-[10px] text-slate-500 font-mono">
              Ca. {event.expected_visitors.toLocaleString("de-DE")} Besucher erwartet
            </div>
          )}
        </div>
      </div>

      {/* Card Actions */}
      <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDownloadIcs}
            title="Termin als .ics exportieren"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-300 text-xs font-medium transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>.ics</span>
          </button>

          <a
            href={generateGoogleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            title="In Google Kalender speichern"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 text-xs font-medium transition-colors"
          >
            <CalendarIcon className="w-3 h-3" />
            <span>Google</span>
          </a>

          {event.latitude && event.longitude && (
            <Link
              href={`/?lat=${event.latitude}&lng=${event.longitude}&zoom=15`}
              title="Auf der Ried-Karte anzeigen"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white text-slate-400 text-xs transition-colors"
            >
              <Compass className="w-3 h-3" />
            </Link>
          )}
        </div>

        {(event.event_url || event.ticket_url) && (
          <a
            href={event.ticket_url || event.event_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
          >
            <span>Details</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
