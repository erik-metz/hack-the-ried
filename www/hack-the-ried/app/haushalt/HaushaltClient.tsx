"use client";

import { ElectionEvent } from "@/lib/electionsData";
import {
  FinanceBudget,
  FinanceExpenditure,
  MunicipalFinanceComparison,
} from "@/lib/financeData";
import { ConstructionPermit, DevelopmentPlan } from "@/lib/realestateData";
import {
  parseSubpageParams,
  serializeSubpageParams,
  updateUrlDebounced,
} from "@/lib/urlState";
import {
  ArrowRight,
  Award,
  Coins,
  Construction,
  ExternalLink,
  FileText,
  Landmark,
  MapPin,
  School,
  ShieldAlert,
  Trees,
  TrendingUp,
  Users,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const municipalities = ["Bürstadt", "Lampertheim", "Biblis", "Groß-Rohrheim"];
type BudgetTab = "haushalt" | "ausgaben" | "wahlen" | "bauen";

interface Props {
  budgets: FinanceBudget[];
  spending: FinanceExpenditure[];
  comparisons: MunicipalFinanceComparison[];
  elections: ElectionEvent[];
  devPlans: DevelopmentPlan[];
  permits: ConstructionPermit[];
}

export default function HaushaltClient({
  budgets,
  spending,
  comparisons,
  elections,
  devPlans,
  permits,
}: Props) {
  const [selectedMunicipality, setSelectedMunicipality] =
    useState<string>("Bürstadt");
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [activeTab, setActiveTab] = useState<
    "haushalt" | "ausgaben" | "wahlen" | "bauen"
  >("haushalt");
  const [mounted, setMounted] = useState(false);



  // Initial read from URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = parseSubpageParams(window.location.search, {
      tab: "haushalt",
      muni: "Bürstadt",
      year: "2024",
    });
    if (["haushalt", "ausgaben", "wahlen", "bauen"].includes(p.tab)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore the browser URL after hydration.
      setActiveTab(p.tab as BudgetTab);
    }
    const matchedMuni = municipalities.find(
      (m) => m.toLowerCase() === p.muni.toLowerCase()
    );
    if (matchedMuni) setSelectedMunicipality(matchedMuni);
    const y = parseInt(p.year, 10);
    if (!Number.isNaN(y) && y >= 2020 && y <= 2030) setSelectedYear(y);
    setMounted(true);
  }, []);

  // Listen to popstate
  useEffect(() => {
    const onPopState = () => {
      const p = parseSubpageParams(window.location.search, {
        tab: "haushalt",
        muni: "Bürstadt",
        year: "2024",
      });
      if (["haushalt", "ausgaben", "wahlen", "bauen"].includes(p.tab)) {
        setActiveTab(p.tab as BudgetTab);
      }
      const matchedMuni = municipalities.find(
        (m) => m.toLowerCase() === p.muni.toLowerCase()
      );
      if (matchedMuni) setSelectedMunicipality(matchedMuni);
      const y = parseInt(p.year, 10);
      if (!Number.isNaN(y) && y >= 2020 && y <= 2030) setSelectedYear(y);
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
        muni: selectedMunicipality,
        year: selectedYear,
      },
      { tab: "haushalt", muni: "Bürstadt", year: 2024 }
    );
    updateUrlDebounced(query);
  }, [mounted, activeTab, selectedMunicipality, selectedYear]);

  // Filtered Budget
  const currentBudget = useMemo(() => {
    return (
      budgets.find(
        (b) =>
          b.municipality.toLowerCase() === selectedMunicipality.toLowerCase() &&
          b.fiscal_year === selectedYear &&
          b.record_type === "plan"
      )
    );
  }, [budgets, selectedMunicipality, selectedYear]);

  // Filtered Spending
  const currentSpending = useMemo(() => {
    return spending.filter(
      (s) =>
        s.municipality.toLowerCase() === selectedMunicipality.toLowerCase() &&
        s.fiscal_year === selectedYear
    );
  }, [spending, selectedMunicipality, selectedYear]);

  // Total Spending calculated
  const totalBudgetedExpenses = useMemo(() => {
    return currentSpending.reduce(
      (acc, curr) => acc + curr.expense_budgeted_eur,
      0
    );
  }, [currentSpending]);

  // Filtered Elections
  const currentElections = useMemo(() => {
    return elections.filter(
      (e) => e.municipality.toLowerCase() === selectedMunicipality.toLowerCase()
    );
  }, [elections, selectedMunicipality]);

  const [selectedElectionId, setSelectedElectionId] = useState<string>(
    currentElections[0]?.id || "kw-2021-bst"
  );

  const activeElection = useMemo(() => {
    return (
      currentElections.find((e) => e.id === selectedElectionId) ||
      currentElections[0]
    );
  }, [selectedElectionId, currentElections]);

  // Filtered Dev Plans
  const currentDevPlans = useMemo(() => {
    return devPlans.filter(
      (d) => d.municipality.toLowerCase() === selectedMunicipality.toLowerCase()
    );
  }, [devPlans, selectedMunicipality]);

  const formatEuro = (val: number | null | undefined) => {
    if (val == null) return "–";
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "schools":
        return <School className="w-4 h-4 text-amber-400" />;
      case "roads_transport":
        return <Construction className="w-4 h-4 text-orange-400" />;
      case "social_childcare":
        return <Users className="w-4 h-4 text-cyan-400" />;
      case "culture_sport":
        return <Award className="w-4 h-4 text-purple-400" />;
      case "public_order":
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case "utilities":
        return <Trees className="w-4 h-4 text-emerald-400" />;
      default:
        return <Landmark className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-10">
      {/* Municipality & Year Selector Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
            Kommune:
          </span>
          {municipalities.map((muni) => (
            <button
              key={muni}
              type="button"
              onClick={() => {
                setSelectedMunicipality(muni);
                const nextElec = elections.find(
                  (e) => e.municipality.toLowerCase() === muni.toLowerCase()
                );
                if (nextElec) setSelectedElectionId(nextElec.id);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all ${
                selectedMunicipality === muni
                  ? "bg-emerald-500 text-slate-950 font-semibold shadow-lg shadow-emerald-500/20"
                  : "bg-slate-950/70 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
              }`}
            >
              {muni}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Haushaltsjahr:
          </span>
          {[2024, 2025].map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => setSelectedYear(yr)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                selectedYear === yr
                  ? "bg-slate-800 text-emerald-400 border border-emerald-500/40"
                  : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {currentBudget ? <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Budget */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Gesamthaushaltsvolumen</span>
            <Coins className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-100">
            {formatEuro(currentBudget.total_revenue_eur)}
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <span
              className={`font-semibold ${
                currentBudget.net_result_eur >= 0
                  ? "text-emerald-400"
                  : "text-amber-400"
              }`}
            >
              {currentBudget.net_result_eur >= 0 ? "+ " : ""}
              {formatEuro(currentBudget.net_result_eur)}
            </span>
            <span>
              Jahresergebnis (
              {currentBudget.record_type === "plan" ? "Plan" : "Ist"})
            </span>
          </div>
        </div>

        {/* Gewerbesteuer */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Gewerbesteuerertrag</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-100">
            {formatEuro(currentBudget.tax_gewerbesteuer_eur)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Hebesatz:{" "}
            <strong className="text-slate-200">
              {currentBudget.hebesatz_gewerbesteuer}%
            </strong>{" "}
            · Grundsteuer B:{" "}
            <strong className="text-slate-200">
              {currentBudget.hebesatz_grundsteuer_b}%
            </strong>
          </div>
        </div>

        {/* Debt per Capita */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Pro-Kopf-Verschuldung</span>
            <Landmark className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-100">
            {formatEuro(currentBudget.debt_per_capita_eur)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Gesamtschulden:{" "}
            <strong className="text-slate-200">
              {formatEuro(currentBudget.total_debt_eur)}
            </strong>
          </div>
        </div>

        {/* Election Turnout */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Wahlbeteiligung (Kommunalwahl)</span>
            <Vote className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-100">
            {activeElection
              ? `${activeElection.turnout_percent.toFixed(1)}%`
              : "–"}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Wähler:{" "}
            <strong className="text-slate-200">
              {activeElection
                ? activeElection.total_voters.toLocaleString("de-DE")
                : "–"}
            </strong>{" "}
            von{" "}
            {activeElection
              ? activeElection.eligible_voters.toLocaleString("de-DE")
              : "–"}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("haushalt")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "haushalt"
              ? "border-emerald-400 text-emerald-400 font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Coins className="w-4 h-4" /> Haushalt & Steuern
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ausgaben")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "ausgaben"
              ? "border-emerald-400 text-emerald-400 font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <School className="w-4 h-4" /> Produkthaushalt (Schulen, Straßen,
          Kitas)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("wahlen")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "wahlen"
              ? "border-emerald-400 text-emerald-400 font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Vote className="w-4 h-4" /> Wahlergebnisse & Bürgervertretung
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bauen")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "bauen"
              ? "border-emerald-400 text-emerald-400 font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Construction className="w-4 h-4" /> Bebauungspläne & Bauanträge
        </button>
      </div>

      {/* TAB 1: HAUSHALT & STEUERN */}
      {activeTab === "haushalt" && (
        <div className="space-y-8">
          {/* Revenue Breakdown */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  Steuereinnahmen & Ertragsstruktur ({selectedMunicipality}{" "}
                  {selectedYear})
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Zusammensetzung der städtischen Einnahmen aus Gewerbesteuer,
                  Einkommensteueranteil, Grundsteuern und Zuweisungen.
                </p>
              </div>
              <div className="text-xs bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
                Quelle: Doppischer Haushaltsplan {selectedMunicipality}
              </div>
            </div>

            {/* Visual Flow Bars */}
            <div className="space-y-3">
              {[
                {
                  label: "Einkommensteueranteil",
                  val: currentBudget.tax_income_share_eur || 0,
                  color: "bg-emerald-500",
                  pct: Math.round(
                    ((currentBudget.tax_income_share_eur || 0) /
                      currentBudget.total_revenue_eur) *
                      100
                  ),
                },
                {
                  label: "Gewerbesteuer (Netto)",
                  val: currentBudget.tax_gewerbesteuer_eur || 0,
                  color: "bg-blue-500",
                  pct: Math.round(
                    ((currentBudget.tax_gewerbesteuer_eur || 0) /
                      currentBudget.total_revenue_eur) *
                      100
                  ),
                },
                {
                  label: "Grundsteuer B (Bebaute Grundstücke)",
                  val: currentBudget.tax_grundsteuer_b_eur || 0,
                  color: "bg-amber-500",
                  pct: Math.round(
                    ((currentBudget.tax_grundsteuer_b_eur || 0) /
                      currentBudget.total_revenue_eur) *
                      100
                  ),
                },
                {
                  label: "Umsatzsteueranteil",
                  val: currentBudget.tax_vat_share_eur || 0,
                  color: "bg-purple-500",
                  pct: Math.round(
                    ((currentBudget.tax_vat_share_eur || 0) /
                      currentBudget.total_revenue_eur) *
                      100
                  ),
                },
                {
                  label: "Grundsteuer A (Land- & Forstwirtschaft)",
                  val: currentBudget.tax_grundsteuer_a_eur || 0,
                  color: "bg-teal-500",
                  pct:
                    Math.round(
                      ((currentBudget.tax_grundsteuer_a_eur || 0) /
                        currentBudget.total_revenue_eur) *
                        100
                    ) || 1,
                },
              ].map((item) => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="text-slate-200">
                      {formatEuro(item.val)}{" "}
                      <span className="text-slate-500">({item.pct}%)</span>
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(item.pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Tax Rates (Hebesätze) Comparison Table */}
            <div className="pt-4 border-t border-slate-800/80">
              <h4 className="text-sm font-bold text-slate-200 mb-3">
                Steuerhebesätze im interkommunalen Vergleich
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Kommune</th>
                      <th className="p-3">Gewerbesteuer</th>
                      <th className="p-3">Grundsteuer B</th>
                      <th className="p-3">Pro-Kopf-Schulden</th>
                      <th className="p-3">Rücklagen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {comparisons.map((c) => (
                      <tr
                        key={c.municipality}
                        className={
                          c.municipality === selectedMunicipality
                            ? "bg-emerald-500/10 font-semibold text-emerald-300"
                            : "text-slate-300 hover:bg-slate-800/30"
                        }
                      >
                        <td className="p-3">{c.municipality}</td>
                        <td className="p-3">{c.hebesatz_gewerbesteuer}%</td>
                        <td className="p-3">{c.hebesatz_grundsteuer_b}%</td>
                        <td className="p-3">
                          {formatEuro(c.debt_per_capita_eur)}
                        </td>
                        <td className="p-3">{formatEuro(c.reserves_eur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUKTHAUSHALT (SCHULEN, STRASSEN, KITAS) */}
      {activeTab === "ausgaben" && (
        <div className="space-y-8">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-100">
                Ausgaben nach Aufgabenbereichen ({selectedMunicipality}{" "}
                {selectedYear})
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Verteilung der laufenden Ausgaben und Investitionen auf Schulen,
                Kitas, Straßen und Kultur nach dem hessischen Produktrahmen.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentSpending.map((item) => {
                const pctOfTotal =
                  totalBudgetedExpenses > 0
                    ? Math.round(
                        (item.expense_budgeted_eur / totalBudgetedExpenses) *
                          100
                      )
                    : 0;
                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                          {getCategoryIcon(item.category_name)}
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 font-mono">
                            PB {item.product_area_code}
                          </div>
                          <h4 className="text-sm font-bold text-slate-200">
                            {item.title}
                          </h4>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                        {pctOfTotal}%
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {item.notes}
                    </p>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Laufender Etat:</span>
                      <strong className="text-slate-100">
                        {formatEuro(item.expense_budgeted_eur)}
                      </strong>
                    </div>

                    {item.investments_eur > 0 && (
                      <div className="flex items-center justify-between text-xs text-cyan-300">
                        <span>Investitionen / Baumaßnahmen:</span>
                        <strong>{formatEuro(item.investments_eur)}</strong>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WAHLEN & BÜRGERVERTRETUNG */}
      {activeTab === "wahlen" && (
        <div className="space-y-8">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  Wahlergebnisse & Mandate ({selectedMunicipality})
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Ergebnisse der Kommunal-, Bürgermeister- und Europawahlen
                  sowie Sitzverteilung in der Stadtverordnetenversammlung.
                </p>
              </div>

              {/* Election Selector */}
              <div className="flex flex-wrap gap-2">
                {currentElections.map((elec) => (
                  <button
                    key={elec.id}
                    type="button"
                    onClick={() => setSelectedElectionId(elec.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      selectedElectionId === elec.id
                        ? "bg-emerald-500 text-slate-950 font-bold"
                        : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {elec.election_type === "kommunalwahl"
                      ? "Kommunalwahl 2021"
                      : elec.election_type === "buergermeister"
                      ? "Bürgermeisterwahl 2023"
                      : "Europawahl 2024"}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Election Details */}
            {activeElection && (
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Wahlbezeichnung: </span>
                    <strong className="text-slate-100">
                      {activeElection.title}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Datum: </span>
                    <strong className="text-slate-100">
                      {activeElection.election_date}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Wahlbeteiligung: </span>
                    <strong className="text-emerald-400 font-bold">
                      {activeElection.turnout_percent}%
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Gültige Stimmen: </span>
                    <strong className="text-slate-100">
                      {activeElection.valid_votes.toLocaleString("de-DE")}
                    </strong>
                  </div>
                </div>

                {/* Party Bar Chart */}
                {activeElection.results_summary.parties && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-200">
                      Stimmanteile & Mandate
                    </h4>
                    <div className="space-y-2">
                      {activeElection.results_summary.parties.map((party) => (
                        <div key={party.name} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-slate-300 font-semibold">
                              {party.name}
                            </span>
                            <span className="text-slate-300">
                              {party.percent}% ·{" "}
                              {party.votes.toLocaleString("de-DE")} Stimmen
                              {party.seats ? ` · ${party.seats} Sitze` : ""}
                            </span>
                          </div>
                          <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${party.percent}%`,
                                backgroundColor: party.color,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mayoral Candidates */}
                {activeElection.results_summary.candidates && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {activeElection.results_summary.candidates.map((cand) => (
                      <div
                        key={cand.name}
                        className={`p-4 rounded-2xl border ${
                          cand.elected
                            ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-200"
                            : "bg-slate-950/70 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-slate-100">
                            {cand.name}
                          </h4>
                          {cand.elected && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                              Gewählt
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-2xl font-black text-slate-100">
                          {cand.percent}%
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {cand.votes.toLocaleString("de-DE")} Stimmen
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Map Hint */}
                <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-800/40 flex items-center justify-between">
                  <div className="text-xs text-purple-200">
                    💡 <strong>Wahlbezirke auf der Karte:</strong> Du kannst die
                    Stimmbezirke mit Wahlbeteiligung und Wahllokalen auch direkt
                    auf der interaktiven Karte einblenden (Schalter:{" "}
                    <strong>🗳️ Wahlbezirke</strong>).
                  </div>
                  <Link
                    href="/#dashboard"
                    className="text-xs text-purple-300 hover:text-purple-100 underline font-semibold shrink-0 ml-4"
                  >
                    Zur Karte →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: BEBAUUNGSPLÄNE & BAUANTRÄGE */}
      {activeTab === "bauen" && (
        <div className="space-y-8">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  Bebauungspläne & Stadtentwicklung ({selectedMunicipality})
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Rechtskräftige und in Aufstellung befindliche Bau-Pläne,
                  Neubaugebiete und Gewerbeflächen.
                </p>
              </div>
              <Link
                href="/#dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" /> Auf der Karte anzeigen
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentDevPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          plan.status === "rechtskraeftig"
                            ? "bg-emerald-950/50 border border-emerald-500/40 text-emerald-400"
                            : "bg-amber-950/50 border border-amber-500/40 text-amber-400"
                        }`}
                      >
                        {plan.status === "rechtskraeftig"
                          ? "Rechtskräftig"
                          : "Im Verfahren"}
                      </span>
                      <h4 className="text-sm font-bold text-slate-100 mt-1.5">
                        {plan.plan_name}
                      </h4>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>
                        Plan: <strong>{plan.plan_number}</strong>
                      </div>
                      <div>{plan.area_hectares} ha</div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <span>
                      Nutzung:{" "}
                      <strong className="text-slate-200">
                        {plan.target_use}
                      </strong>
                    </span>
                    {plan.document_url && (
                      <a
                        href={plan.document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                      >
                        Amtlicher Plan <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Permits & Construction stats */}
            <div className="pt-6 border-t border-slate-800/80">
              <h4 className="text-sm font-bold text-slate-200 mb-3">
                Baugenehmigungen & Fertigstellungen (Statistischer Bericht F II
                1)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {permits
                  .filter(
                    (p) =>
                      p.municipality.toLowerCase() ===
                      selectedMunicipality.toLowerCase()
                  )
                  .slice(0, 3)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="font-bold text-slate-300">
                        Jahr {p.year}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          Genehmigte Wohnungen:
                        </span>
                        <strong className="text-emerald-400">
                          {p.residential_dwellings_count}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          Fertiggestellte Wohnungen:
                        </span>
                        <strong className="text-blue-400">
                          {p.completions_dwellings_count}
                        </strong>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Open Data Callout */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            Open Data & Download aller Finanz- und Verwaltungsdaten
          </h4>
          <p className="text-sm text-slate-400 mt-1">
            Alle Haushaltspläne, Steuersätze und Wahlergebnisse stehen als
            offene CSV-, JSON- und REST-API-Schnittstellen zur Verfügung.
          </p>
        </div>
        <Link
          href="/daten"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/10"
        >
          Zum Open-Data-Portal <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      </> : <p role="status" className="text-slate-300">
        Für {selectedMunicipality} im Haushaltsjahr {selectedYear} liegt kein gespeicherter Haushaltsplan vor.
      </p>}
    </div>
  );
}
