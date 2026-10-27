"use client";

import {
  Activity,
  ArrowRight,
  Building2,
  Coins,
  Download,
  ExternalLink,
  Filter,
  Info,
  Layers,
  Leaf,
  MapPin,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export type StatRecord = {
  municipality_id: string;
  name: string;
  values: {
    label: string;
    value: number | null;
    source_marker: string | null;
    cell: string;
  }[];
};

export type StatTable = {
  id: string;
  title: string;
  records: StatRecord[];
};

export type StatisticsData = {
  publisher?: string;
  notice?: string;
  edition: string;
  publication_month: string;
  source_url: string;
  tables: StatTable[];
};

interface Props {
  domain: string;
  title: string;
  data: StatisticsData | null;
}

const MUNICIPALITIES = [
  { id: "all", label: "Alle Kommunen (Vergleich)" },
  { id: "buerstadt", label: "Bürstadt" },
  { id: "lampertheim", label: "Lampertheim" },
  { id: "biblis", label: "Biblis" },
  { id: "gross-rohrheim", label: "Groß-Rohrheim" },
];

function getDomainIcon(domain: string) {
  switch (domain) {
    case "demographics":
      return <Users className="w-5 h-5 text-teal-400" />;
    case "finance":
      return <Coins className="w-5 h-5 text-emerald-400" />;
    case "realestate":
      return <Building2 className="w-5 h-5 text-blue-400" />;
    case "environment":
      return <Leaf className="w-5 h-5 text-emerald-400" />;
    case "economy":
      return <TrendingUp className="w-5 h-5 text-amber-400" />;
    case "social":
      return <Activity className="w-5 h-5 text-violet-400" />;
    case "elections":
      return <Vote className="w-5 h-5 text-indigo-400" />;
    default:
      return <Layers className="w-5 h-5 text-emerald-400" />;
  }
}

function cleanMunicipalityName(name: string): string {
  return name.replace(/, Stadt$/, "").trim();
}

function normalizeMuniId(muniId: string, name: string): string {
  const lower = (muniId + " " + name).toLowerCase();
  if (lower.includes("buerstadt") || lower.includes("bürstadt")) return "buerstadt";
  if (lower.includes("lampertheim")) return "lampertheim";
  if (lower.includes("biblis")) return "biblis";
  if (lower.includes("gross-rohrheim") || lower.includes("groß-rohrheim")) return "gross-rohrheim";
  return muniId;
}

export default function OfficialStatisticsClient({ domain, title, data }: Props) {
  const [selectedMuni, setSelectedMuni] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"matrix" | "cards">("matrix");
  const [selectedTableId, setSelectedTableId] = useState<string>("all");

  const isElections = domain === "elections";

  // Filter tables and records by search query and municipality
  const filteredTables = useMemo(() => {
    if (!data?.tables) return [];
    const query = searchQuery.trim().toLowerCase();

    return data.tables
      .filter((table) => selectedTableId === "all" || table.id === selectedTableId)
      .map((table) => {
        // Filter records by municipality
        let records = table.records;
        if (selectedMuni !== "all") {
          records = records.filter((r) => normalizeMuniId(r.municipality_id, r.name) === selectedMuni);
        }

        // If search query is present, filter values within records or keep records matching search
        if (query) {
          records = records
            .map((rec) => ({
              ...rec,
              values: rec.values.filter(
                (v) =>
                  v.label.toLowerCase().includes(query) ||
                  rec.name.toLowerCase().includes(query) ||
                  table.title.toLowerCase().includes(query)
              ),
            }))
            .filter((rec) => rec.values.length > 0);
        }

        return {
          ...table,
          records,
        };
      })
      .filter((table) => table.records.length > 0);
  }, [data, selectedMuni, searchQuery, selectedTableId]);

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-4">
        <Info className="w-8 h-8 text-amber-400 mx-auto" />
        <p role="status" className="text-slate-300 font-medium">
          Aktuell keine gespeicherte Veröffentlichung verfügbar.
        </p>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Die amtlichen Statistiken für diesen Bereich werden beim nächsten Synchronisationslauf des Daten-Workers aktualisiert.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* HEADER META CARD */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              {getDomainIcon(domain)}
              <span>{data.publisher ?? "Hessisches Statistisches Landesamt (HSL)"}</span>
              <span>·</span>
              <span>{data.edition}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">{title}</h2>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Amtliche statistische Erhebungen für die hessischen Ried-Kommunen Bürstadt, Lampertheim, Biblis und Groß-Rohrheim.
              Veröffentlichung: <span className="text-emerald-400 font-medium">{data.publication_month}</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Originalveröffentlichung</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition-colors"
            >
              <span>Zur Live-Karte</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {data.notice && (
          <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400">
            {data.notice}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
        Die Bezugszeiträume und Einheiten stehen in den jeweiligen Tabellentiteln
        und Kennzahlen. Das Veröffentlichungsdatum ist kein gemeinsamer Stichtag.
        Amtliche Fehlwertzeichen bleiben erhalten; fehlende Angaben sind keine Nullwerte.
      </section>

      {/* CONTROLS: MUNICIPALITY SELECTOR + SEARCH + VIEW TOGGLE */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Municipality Selector Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Kommune:
            </span>
            {MUNICIPALITIES.map((muni) => {
              const active = selectedMuni === muni.id;
              return (
                <button
                  key={muni.id}
                  onClick={() => setSelectedMuni(muni.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                      : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {muni.label}
                </button>
              );
            })}
          </div>

          {/* Search & View Mode Switcher */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Kennzahl suchen"
                placeholder="Kennzahl suchen..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ×
                </button>
              )}
            </div>

            <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800 shrink-0">
              <button
                onClick={() => setViewMode("matrix")}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  viewMode === "matrix"
                    ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Vergleich
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  viewMode === "cards"
                    ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Karten
              </button>
            </div>
          </div>
        </div>

        {/* Table Selector Tabs if multiple tables exist */}
        {data.tables.length > 1 && (
          <div className="flex flex-wrap gap-2 pt-1 border-b border-slate-800 pb-3">
            <button
              onClick={() => setSelectedTableId("all")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedTableId === "all"
                  ? "bg-slate-800 text-emerald-400 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Alle Tabellen ({data.tables.length})
            </button>
            {data.tables.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTableId(t.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors truncate max-w-[240px] ${
                  selectedTableId === t.id
                    ? "bg-slate-800 text-emerald-400 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title={t.title}
              >
                {t.title}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* MAIN DATA TABLES / COMPARISON VIEW */}
      {filteredTables.length === 0 ? (
        <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
          Keine Daten für die gewählten Filter gefunden.
        </div>
      ) : (
        <div className="space-y-8">
          {filteredTables.map((table) => {
            // If viewMode is matrix and not elections, we show a clean side-by-side comparative table
            if (viewMode === "matrix" && !isElections && table.records.length > 1) {
              // Gather unique labels across records
              const allLabels: string[] = [];
              for (const rec of table.records) {
                for (const val of rec.values) {
                  if (!allLabels.includes(val.label)) {
                    allLabels.push(val.label);
                  }
                }
              }

              return (
                <section
                  key={table.id}
                  className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 sm:p-8 space-y-6 shadow-xl"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      {table.title}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {table.records.length} Kommunen im Vergleich
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-4 min-w-[240px]">Indikator / Kennzahl</th>
                          {table.records.map((r) => (
                            <th key={r.municipality_id} className="py-3 px-4 text-right min-w-[120px]">
                              {cleanMunicipalityName(r.name)}
                            </th>
                          ))}
                          <th className="py-3 px-4 min-w-[160px] text-center hidden md:table-cell">
                            Verteilung
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {allLabels.map((label, labelIdx) => {
                          // Find values for each municipality
                          const valuesForLabel = table.records.map((r) => {
                            const found = r.values.find((v) => v.label === label);
                            return found ?? null;
                          });

                          // Calculate max numeric value for proportional visual bar
                          const numericValues = valuesForLabel.map((entry) => entry?.value).filter(
                            (v): v is number => typeof v === "number" && !isNaN(v) && v > 0
                          );
                          const maxVal = numericValues.length ? Math.max(...numericValues) : 0;

                          return (
                            <tr key={labelIdx} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4 font-medium text-slate-300 text-xs sm:text-sm">
                                {label}
                              </td>
                              {table.records.map((r, rIdx) => {
                                const entry = valuesForLabel[rIdx];
                                const val = entry?.value;
                                return (
                                  <td
                                    key={r.municipality_id}
                                    className="py-3 px-4 text-right tabular-nums text-xs sm:text-sm font-semibold text-slate-200"
                                  >
                                    {val === null || val === undefined
                                      ? entry?.source_marker || "–"
                                      : val.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                                  </td>
                                );
                              })}
                              {/* Inline mini distribution bar */}
                              <td className="py-3 px-4 hidden md:table-cell">
                                {maxVal > 0 ? (
                                  <div className="flex items-center gap-1.5 h-3 w-full bg-slate-950/60 rounded-full p-0.5 border border-slate-800">
                                    {table.records.map((r, rIdx) => {
                                      const entry = valuesForLabel[rIdx];
                                const val = entry?.value;
                                      const pct =
                                        typeof val === "number" && maxVal > 0
                                          ? Math.min(100, Math.round((val / maxVal) * 100))
                                          : 0;
                                      const colors = [
                                        "bg-emerald-400",
                                        "bg-teal-400",
                                        "bg-blue-400",
                                        "bg-indigo-400",
                                      ];
                                      return (
                                        <div
                                          key={r.municipality_id}
                                          className={`h-full rounded-full ${colors[rIdx % colors.length]}`}
                                          style={{ width: `${Math.max(0, pct / table.records.length)}%` }}
                                          title={`${cleanMunicipalityName(r.name)}: ${val ?? "–"}`}
                                        />
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-600 block text-center">–</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            }

            // Cards / Focus Municipality View: Clean card grid
            return (
              <section
                key={table.id}
                className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 sm:p-8 space-y-6 shadow-xl"
              >
                <div className="border-b border-slate-800 pb-4">
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    {table.title}
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {table.records.map((record) => (
                    <div
                      key={record.municipality_id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h4 className="font-bold text-base text-slate-100 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-400" />
                          {record.name}
                        </h4>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                          {record.municipality_id}
                        </span>
                      </div>

                      <dl className="grid grid-cols-1 gap-2.5 text-xs sm:text-sm">
                        {record.values.map((value) => (
                          <div
                            key={value.cell}
                            className="flex items-baseline justify-between gap-4 py-1.5 border-b border-slate-800/40 last:border-0 hover:bg-slate-900/40 px-2 rounded-lg transition-colors"
                          >
                            <dt className="text-slate-400 text-xs max-w-[65%] truncate" title={value.label}>
                              {value.label}
                            </dt>
                            <dd className="tabular-nums font-semibold text-slate-200 shrink-0">
                              {value.value === null || value.value === undefined
                                ? value.source_marker || "–"
                                : value.value.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* QUICK JUMP NAVIGATION LINKS */}
      <section className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-slate-800 text-xs sm:text-sm text-slate-400">
        <div className="flex items-center gap-4">
          <Link href="/wahlen" className="text-emerald-400 hover:underline">
            Wahlergebnisse
          </Link>
          <span>·</span>
          <Link href="/demografie" className="text-emerald-400 hover:underline">
            Demografie
          </Link>
          <span>·</span>
          <Link href="/haushalt" className="text-emerald-400 hover:underline">
            Finanzen &amp; Haushalt
          </Link>
          <span>·</span>
          <Link href="/bauen-wohnen" className="text-emerald-400 hover:underline">
            Bauen &amp; Wohnen
          </Link>
        </div>
        <Link href="/" className="text-emerald-400 hover:underline flex items-center gap-1">
          <span>Zurück zur Übersicht &amp; Karte</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </section>
    </div>
  );
}
