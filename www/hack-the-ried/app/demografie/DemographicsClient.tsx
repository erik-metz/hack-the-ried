"use client";

import { demographicView, statNumber, signedStat } from "@/lib/topicAggregates";

import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Baby,
  Building2,
  ExternalLink,
  GraduationCap,
  MapPin,
  School,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type DemographicSummary,
  type EducationalFacility,
} from "@/lib/demographicsData";
import {
  parseSubpageParams,
  serializeSubpageParams,
  updateUrlDebounced,
} from "@/lib/urlState";

interface Props {
  summaries: DemographicSummary[];
  facilities: EducationalFacility[];
  ageStructure: Record<string, import("@/lib/demographicsData").AgeStructure[]>;
  commuters: import("@/lib/demographicsData").CommuterFlow[];
  municipalities: import("@/lib/demographicsData").Municipality[];
}

export default function DemographicsClient({ summaries, facilities, ageStructure, commuters, municipalities }: Props) {
  const [selectedMuni, setSelectedMuni] = useState<string>("all");
  const [facilitySearch, setFacilitySearch] = useState<string>("");
  const [facilityTypeFilter, setFacilityTypeFilter] = useState<string>("all");
  const [mounted, setMounted] = useState(false);

  // Initial read from URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = parseSubpageParams(window.location.search, {
      muni: "all",
      q: "",
      type: "all",
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser URL after hydration.
    if (p.muni) setSelectedMuni(p.muni);
    if (p.q) setFacilitySearch(p.q);
    if (p.type) setFacilityTypeFilter(p.type);
    setMounted(true);
  }, []);

  // Listen to popstate
  useEffect(() => {
    const onPopState = () => {
      const p = parseSubpageParams(window.location.search, {
        muni: "all",
        q: "",
        type: "all",
      });
      setSelectedMuni(p.muni || "all");
      setFacilitySearch(p.q || "");
      setFacilityTypeFilter(p.type || "all");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Sync to URL
  useEffect(() => {
    if (!mounted) return;
    const query = serializeSubpageParams(
      {
        muni: selectedMuni,
        q: facilitySearch,
        type: facilityTypeFilter,
      },
      { muni: "all", q: "", type: "all" }
    );
    updateUrlDebounced(query);
  }, [mounted, selectedMuni, facilitySearch, facilityTypeFilter]);

  const activeSummary = useMemo(() => demographicView(summaries, municipalities, selectedMuni),
    [summaries, municipalities, selectedMuni]);

  // AgeStructure has no reference year; cross-municipality comparability is unknown.
  const activeAgeCohorts = useMemo(() => selectedMuni === "all" ? [] : ageStructure[selectedMuni] ?? [],
    [selectedMuni, ageStructure]);

  const activeCommuters = useMemo(() => {
    if (selectedMuni === "all") {
      return commuters;
    }
    return commuters.filter((c) => c.home_municipality_id === selectedMuni);
  }, [selectedMuni, commuters]);

  const outboundCommuters = useMemo(
    () => activeCommuters.filter((c) => c.direction === "outbound"),
    [activeCommuters]
  );
  const inboundCommuters = useMemo(
    () => activeCommuters.filter((c) => c.direction === "inbound"),
    [activeCommuters]
  );

  const filteredFacilities = useMemo(() => {
    return facilities.filter((f) => {
      const matchMuni =
        selectedMuni === "all" ? true : f.municipality_id === selectedMuni;
      const matchType =
        facilityTypeFilter === "all"
          ? true
          : facilityTypeFilter === "kita"
          ? f.facility_type === "kita" || f.facility_type === "krippe"
          : facilityTypeFilter === "grundschule"
          ? f.facility_type === "grundschule"
          : f.facility_type === "gesamtschule" || f.facility_type === "gymnasium";
      const q = facilitySearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        (f.district && f.district.toLowerCase().includes(q)) ||
        f.address.toLowerCase().includes(q) ||
        f.operator.toLowerCase().includes(q);
      return matchMuni && matchType && matchSearch;
    });
  }, [facilities, selectedMuni, facilityTypeFilter, facilitySearch]);

  const facilityTypeBadge = (type: string) => {
    switch (type) {
      case "kita":
      case "krippe":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Baby className="w-3 h-3" /> Kita / Betreuung
          </span>
        );
      case "grundschule":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <School className="w-3 h-3" /> Grundschule
          </span>
        );
      case "gesamtschule":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
            <GraduationCap className="w-3 h-3" /> Integrierte Gesamtschule (IGS)
          </span>
        );
      case "gymnasium":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
            <GraduationCap className="w-3 h-3" /> Gymnasium
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            Bildungseinrichtung
          </span>
        );
    }
  };

  return (
    <div className="space-y-12">
      {/* MUNICIPALITY SELECTOR BAR */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>Region / Kommune auswählen:</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Bezugsjahr: {activeSummary.year ?? "nicht verfügbar"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Kommune auswählen">
          <button
            type="button"
            onClick={() => setSelectedMuni("all")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedMuni === "all"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-950/60 border border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60"
            }`}
          >
            Alle Kommunen (Ried gesamt)
          </button>
          {municipalities.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedMuni(m.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedMuni === m.id
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "bg-slate-950/60 border border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {selectedMuni === "all" && <p className="text-sm text-slate-400">
        Gesamtwerte setzen vollständige Angaben für Bürstadt, Lampertheim, Biblis und Groß-Rohrheim
        im selben Jahr voraus. Der regionale Ausländeranteil ist aus kommunalen Anteilen näherungsweise gewichtet. Fehlende Angaben bleiben offen. Die Haushaltsgröße wird ohne Haushaltszahlen nicht zusammengefasst.
      </p>}
      {/* KPI SCORECARD GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Einwohner */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Gesamtbevölkerung</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100">
            {statNumber(activeSummary.total_population, 0)}
          </div>
          <p className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Siedlungsdichte:</span>
            <span className="font-semibold text-slate-300">{statNumber(activeSummary.population_density)} Einw./km²</span>
          </p>
        </div>

        {/* Card 2: Ausländeranteil */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Ausländische Bürger</span>
            <Building2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100">
            {selectedMuni === "all" && activeSummary.foreign_share_pct != null ? "≈ " : ""}{statNumber(activeSummary.foreign_share_pct)}%
          </div>
          <p className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Haushaltsgröße:</span>
            <span className="font-semibold text-slate-300">Ø {statNumber(activeSummary.avg_household_size)} Pers./HH</span>
          </p>
        </div>

        {/* Card 3: Wanderungssaldo */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Wanderungssaldo</span>
            <ArrowRightLeft className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
            {signedStat(activeSummary.net_migration)}
          </div>
          <p className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Zuzüge / Fortzüge:</span>
            <span className="font-semibold text-slate-300">
              {statNumber(activeSummary.inflow)} / {statNumber(activeSummary.outflow)}
            </span>
          </p>
        </div>

        {/* Card 4: Bildung & Kitas */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Schulen & Kitas</span>
            <GraduationCap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100">
            {activeSummary.schools_count != null && activeSummary.kitas_count != null ? statNumber(activeSummary.schools_count + activeSummary.kitas_count, 0) : "–"}
          </div>
          <p className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Einrichtungen:</span>
            <span className="font-semibold text-slate-300">
              {statNumber(activeSummary.schools_count)} Schulen · {statNumber(activeSummary.kitas_count)} Kitas
            </span>
          </p>
        </div>
      </div>

      {/* SECTION 1: ALTERSSTRUKTUR */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
              Altersstruktur & Generationen im Ried
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Demografische Aufteilung der Bevölkerung nach Alterskohorten (HSL Statistik)
            </p>
          </div>
          <div className="text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full self-start">
            Fokus: {activeSummary.name}
          </div>
        </div>

        <div className="space-y-4">
          {activeAgeCohorts.length === 0 && <p role="status" className="text-sm text-slate-400">Keine vergleichbare Altersstruktur verfügbar. Bitte eine Kommune auswählen; ohne Bezugsjahre wird kein Gesamtwert berechnet.</p>}
          {activeAgeCohorts.map((item) => (
            <div key={item.cohort} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200">{item.label}</span>
                  <span className="text-xs text-slate-400 hidden sm:inline">({item.description})</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-emerald-400">{statNumber(item.count, 0)}</span>
                  <span className="text-xs text-slate-400 ml-1.5 font-mono">({statNumber(item.percentage)}%)</span>
                </div>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-3.5 border border-slate-800 overflow-hidden shadow-inner flex">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                  style={{ width: `${Number.isFinite(item.percentage) ? Math.min(Math.max(item.percentage, 0), 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400">
          Altersdaten haben in diesem Datensatz kein Bezugsjahr. Einzelkommunen werden
          mit ihren veröffentlichten Angaben angezeigt; eine regionale Summe wird nicht gebildet.
        </p>
      </section>

      {/* SECTION 2: PENDLERATLAS & MOBILITÄT */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-teal-400" />
              Pendleratlas: Wo das Ried arbeitet & lebt
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Sozialversicherungspflichtige Pendlerverflechtungen (Bundesagentur für Arbeit)
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">Berichtsjahr je Pendlerbeziehung</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Outbound Commuters */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/20">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Auspendler (Wohnort Ried → Arbeitsort)</h3>
                  <p className="text-xs text-slate-400">Erfasste Beziehungen zu anderen Arbeitsorten</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-orange-400">
                {outboundCommuters.length} erfasste Beziehungen
              </span>
            </div>

            <div className="space-y-2">
              {outboundCommuters.slice(0, 7).map((c, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs text-slate-500 font-mono font-bold">#{idx + 1}</span>
                    <span className="font-semibold text-slate-200">{c.partner_name}</span>
                    {selectedMuni === "all" && (
                      <span className="text-[11px] text-slate-500">
                        (aus {c.home_municipality_id})
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-100">
                    {statNumber(c.commuter_count, 0)} Pendler · {c.year}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Inbound Commuters */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
                  <ArrowDownRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Einpendler (Arbeitsort Ried ← Wohnort)</h3>
                  <p className="text-xs text-slate-400">Fachkräfte, die ins Ried einpendeln</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-teal-400">
                {inboundCommuters.length} erfasste Beziehungen
              </span>
            </div>

            <div className="space-y-2">
              {inboundCommuters.slice(0, 7).map((c, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs text-slate-500 font-mono font-bold">#{idx + 1}</span>
                    <span className="font-semibold text-slate-200">{c.partner_name}</span>
                    {selectedMuni === "all" && (
                      <span className="text-[11px] text-slate-500">
                        (nach {c.home_municipality_id})
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-100">
                    {statNumber(c.commuter_count, 0)} Pendler · {c.year}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: SCHULEN & KITAS */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-amber-400" />
              Bildungs- & Betreuungslandschaft
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Schul- und Kitakapazitäten, Schülerzahlen und Träger im Ried
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Einrichtung suchen…"
                value={facilitySearch}
                onChange={(e) => setFacilitySearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setFacilityTypeFilter("all")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  facilityTypeFilter === "all"
                    ? "bg-slate-100 text-slate-950 font-bold"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Alle ({filteredFacilities.length})
              </button>
              <button
                type="button"
                onClick={() => setFacilityTypeFilter("kita")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  facilityTypeFilter === "kita"
                    ? "bg-amber-400 text-slate-950 font-bold"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Kitas & Krippen
              </button>
              <button
                type="button"
                onClick={() => setFacilityTypeFilter("grundschule")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  facilityTypeFilter === "grundschule"
                    ? "bg-emerald-400 text-slate-950 font-bold"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Grundschulen
              </button>
              <button
                type="button"
                onClick={() => setFacilityTypeFilter("weiterfuehrend")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  facilityTypeFilter === "weiterfuehrend"
                    ? "bg-sky-400 text-slate-950 font-bold"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Weiterführend
              </button>
            </div>
          </div>
        </div>

        {/* Facilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFacilities.map((f) => {
            const cap = f.capacity ?? null;
            const enr = f.current_enrollment ?? null;
            const rate = f.utilization_rate ?? (cap !== null && cap > 0 && enr !== null ? Math.round((enr / cap) * 100) : null);
            return (
              <div
                key={f.id}
                className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-3.5 hover:border-slate-700 transition-colors flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-100 text-base leading-snug">{f.name}</h3>
                    {facilityTypeBadge(f.facility_type)}
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{f.address}</span>
                  </p>
                  {f.operator_name && (
                    <p className="text-xs text-slate-500">
                      Träger: <strong className="text-slate-400">{f.operator_name}</strong>
                    </p>
                  )}
                </div>

                {/* Capacity Progress Meter */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Auslastung / Belegung</span>
                    <span className="font-mono font-bold text-slate-200">
                      {enr ?? "–"} / {cap ?? "–"} Plätze ({rate === null ? "–" : `${rate}%`})
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (rate ?? 0) >= 98
                          ? "bg-rose-500"
                          : (rate ?? 0) >= 93
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                      }`}
                      style={{ width: `${Math.min(rate ?? 0, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <span>
                      Alter: {f.min_age_years}–{f.max_age_years} Jahre
                    </span>
                    {f.website_url ? (
                      <a
                        href={f.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        Webseite <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span>Stand {f.reporting_year}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredFacilities.length === 0 && (
          <p className="text-center py-8 text-sm text-slate-400">
            Keine Einrichtungen entsprechen den aktuellen Filtern.
          </p>
        )}
      </section>
    </div>
  );
}
