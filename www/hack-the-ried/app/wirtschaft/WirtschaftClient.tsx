"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  TrendingUp,
  TrendingDown,
  Percent,
  Coins,
  MapPin,
  ExternalLink,
  Users,
  Search,
  CheckCircle2,
  Factory,
  Sparkles,
  Rocket,
  ShieldCheck,
  Award,
  ChevronRight,
  Info,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import {
  Company,
  EconomyOverview,
  MunicipalityTaxRate,
  BusinessRegistration,
  IndustryEmployment,
  StartupInitiative,
} from "@/lib/economyData";
import {
  parseSubpageParams,
  serializeSubpageParams,
  updateUrlDebounced,
} from "@/lib/urlState";

interface Props {
  overview: EconomyOverview;
  companies: Company[];
  taxRates: MunicipalityTaxRate[];
  registrations: BusinessRegistration[];
  industryEmployment: IndustryEmployment[];
  startupInitiatives: StartupInitiative[];
}

export default function WirtschaftClient({
  overview,
  companies,
  taxRates,
  registrations,
  industryEmployment,
  startupInitiatives,
}: Props) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "companies" | "taxes" | "registrations" | "industry" | "startups"
  >("overview");

  // Filter states for Companies
  const [companySearch, setCompanySearch] = useState("");
  const [companyMuniFilter, setCompanyMuniFilter] = useState("all");
  const [companySectorFilter, setCompanySectorFilter] = useState("all");
  const [mounted, setMounted] = useState(false);

  // Initial read from URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = parseSubpageParams(window.location.search, {
      tab: "overview",
      muni: "all",
      sector: "all",
      q: "",
    });
    if (["overview", "companies", "taxes", "registrations", "industry", "startups"].includes(p.tab)) {
      setActiveTab(p.tab as any);
    }
    if (p.muni) setCompanyMuniFilter(p.muni);
    if (p.sector) setCompanySectorFilter(p.sector);
    if (p.q) setCompanySearch(p.q);
    setMounted(true);
  }, []);

  // Listen to popstate
  useEffect(() => {
    const onPopState = () => {
      const p = parseSubpageParams(window.location.search, {
        tab: "overview",
        muni: "all",
        sector: "all",
        q: "",
      });
      if (["overview", "companies", "taxes", "registrations", "industry", "startups"].includes(p.tab)) {
        setActiveTab(p.tab as any);
      }
      setCompanyMuniFilter(p.muni || "all");
      setCompanySectorFilter(p.sector || "all");
      setCompanySearch(p.q || "");
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
        muni: companyMuniFilter,
        sector: companySectorFilter,
        q: companySearch,
      },
      { tab: "overview", muni: "all", sector: "all", q: "" }
    );
    updateUrlDebounced(query);
  }, [mounted, activeTab, companyMuniFilter, companySectorFilter, companySearch]);

  // Filter states for Taxes
  const [taxRegionFilter, setTaxRegionFilter] = useState<"all" | "ried" | "bergstrasse" | "odenwald">("all");
  const [taxSearch, setTaxSearch] = useState("");

  // Filtered Companies
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const matchesSearch =
        companySearch === "" ||
        c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
        c.industry_sector.toLowerCase().includes(companySearch.toLowerCase()) ||
        (c.description ?? "").toLowerCase().includes(companySearch.toLowerCase());
      const matchesMuni = companyMuniFilter === "all" || c.municipality_id === companyMuniFilter;
      const matchesSector =
        companySectorFilter === "all" ||
        c.industry_sector.toLowerCase().includes(companySectorFilter.toLowerCase());
      return matchesSearch && matchesMuni && matchesSector;
    });
  }, [companies, companySearch, companyMuniFilter, companySectorFilter]);

  // Unique Municipalities & Sectors for Filter Dropdowns
  const companyMunicipalities = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => {
      if (c.municipality_id) {
        map.set(c.municipality_id, c.municipality_name ?? c.municipality_id);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [companies]);

  // Regional taxonomy helper
  const getSubregion = (muniId: string) => {
    const ried = ["buerstadt", "lampertheim", "biblis", "gross-rohrheim", "einhausen", "lorsch"];
    const bergstrasse = ["bensheim", "heppenheim", "zwingenberg", "viernheim"];
    if (ried.includes(muniId)) return "Hessisches Ried";
    if (bergstrasse.includes(muniId)) return "Bergstraße";
    return "Odenwald";
  };

  // Filtered Tax Rates
  const filteredTaxRates = useMemo(() => {
    return taxRates.filter((t) => {
      const matchesSearch =
        taxSearch === "" || t.municipality_name.toLowerCase().includes(taxSearch.toLowerCase());
      const region = getSubregion(t.municipality_id);
      let matchesRegion = true;
      if (taxRegionFilter === "ried") matchesRegion = region === "Hessisches Ried";
      else if (taxRegionFilter === "bergstrasse") matchesRegion = region === "Bergstraße";
      else if (taxRegionFilter === "odenwald") matchesRegion = region === "Odenwald";
      return matchesSearch && matchesRegion;
    });
  }, [taxRates, taxSearch, taxRegionFilter]);

  // Multi-year County Registrations Timeline
  const countyHistory = useMemo(() => {
    return registrations
      .filter((r) => r.region_code === "kreis-bergstrasse")
      .sort((a, b) => a.year - b.year);
  }, [registrations]);

  // Municipality Registrations 2024
  const muniRegistrations2024 = useMemo(() => {
    return registrations
      .filter((r) => r.region_type === "municipality" && r.year === 2024)
      .sort((a, b) => b.registrations_total - a.registrations_total);
  }, [registrations]);

  return (
    <div className="space-y-8">
      {/* KPI HERO SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Gewerbeanmeldungen</span>
            <Building2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100">
            {overview.county_registrations_total.toLocaleString("de-DE")}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Kreis Bergstraße ({overview.year})</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Netto-Gewerbesaldo</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100">
            +{overview.county_net_balance.toLocaleString("de-DE")}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Saldo aus An- und Abmeldungen
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Gewerbesteuer-Spanne</span>
            <Percent className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100">
            {overview.min_hebesatz_gewerbesteuer}% – {overview.max_hebesatz_gewerbesteuer}%
          </div>
          <div className="mt-1 text-xs text-amber-300/90 font-medium">
            Bürstadt 380% · Lampertheim 400%
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Beschäftigte (SVB)</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100">
            {overview.county_total_employees.toLocaleString("de-DE")}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {companies.length} Top-Arbeitgeber erfasst
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "overview"
              ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
              : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Standort-Übersicht
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("taxes")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "taxes"
              ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
              : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <Coins className="w-4 h-4" />
          Gewerbesteuer-Radar (22 Gemeinden)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("registrations")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "registrations"
              ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
              : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Gewerbeanmeldungen & Saldo
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("companies")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "companies"
              ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
              : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <Factory className="w-4 h-4" />
          Top-Arbeitgeber & Betriebe ({filteredCompanies.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("industry")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "industry"
              ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
              : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <Layers className="w-4 h-4" />
          Branchenstruktur
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("startups")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "startups"
              ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
              : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <Rocket className="w-4 h-4" />
          Start-ups & Förderprogramme
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* Key Municipalities Comparison in Ried */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                  Wirtschaftsprofil der Ried- und Bergstraßen-Städte
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Direkter Vergleich von Gewerbesteuer-Hebesätzen, Steuereinnahmen und Gründungsdynamik (Jahr {overview.year}).
                </p>
              </div>
              <Link
                href="/?highlight=companies"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-200 transition-colors shrink-0"
              >
                <MapPin className="w-4 h-4 text-emerald-400" />
                Standorte auf Karte ansehen
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {overview.key_municipalities.map((muni) => {
                const isRiedCore = ["buerstadt", "lampertheim", "biblis", "gross-rohrheim"].includes(muni.municipality_id);
                return (
                  <div
                    key={muni.municipality_id}
                    className={`rounded-2xl p-5 border transition-all ${
                      isRiedCore
                        ? "bg-slate-950/70 border-emerald-500/30 hover:border-emerald-500/60"
                        : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-lg text-slate-100">{muni.name}</h4>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold font-mono ${
                        muni.hebesatz_gewerbesteuer <= 380
                          ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                          : muni.hebesatz_gewerbesteuer <= 400
                          ? "bg-amber-500/10 border border-amber-500/30 text-amber-300"
                          : "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                      }`}>
                        Hebesatz {muni.hebesatz_gewerbesteuer}%
                      </span>
                    </div>

                    <div className="mt-4 space-y-2.5 text-xs text-slate-300">
                      <div className="flex justify-between pb-1.5 border-b border-slate-800/80">
                        <span className="text-slate-400">Gewerbesteuer-Ertrag:</span>
                        <span className="font-semibold font-mono text-slate-200">
                          {(muni.revenue_gewerbesteuer_eur / 1_000_000).toFixed(2)} Mio. €
                        </span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-800/80">
                        <span className="text-slate-400">Steuereinnahmen p.c.:</span>
                        <span className="font-semibold font-mono text-slate-200">
                          {muni.tax_revenue_per_capita_eur.toFixed(0)} € / Einw.
                        </span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-800/80">
                        <span className="text-slate-400">Grundsteuer B Hebesatz:</span>
                        <span className="font-semibold font-mono text-slate-200">{muni.hebesatz_grundsteuer_b}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Gewerbeanmeldungen (Saldo):</span>
                        <span className="font-semibold font-mono text-emerald-400">
                          {muni.registrations_total} (+{muni.net_balance})
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Special Focus Cards: Economic Clusters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <Percent className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base text-slate-100">Attraktive Steuerhebesätze</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Bürstadt gehört mit einem <strong>Gewerbesteuer-Hebesatz von 380%</strong> zu den steuerlich attraktivsten Wirtschaftsstandorten der Metropolregionen Rhein-Main und Rhein-Neckar.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Factory className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base text-slate-100">Chemie & Kontraktlogistik</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Direkte Autobahnanbindung (A67 / A5 / B47) begünstigt spezialisierte Pharma- und Medizintechnik-Logistik (ERDT, FIEGE) sowie Weltmarktführer der Spezialchemie (BASF Lampertheim, SurTec).
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Rocket className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base text-slate-100">Gründerregion Bergstraße</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Mit der <strong>WFB Wirtschaftsförderung</strong>, dem jährlichen <strong>Gründerpreis Bergstraße</strong> und Landeszuschüssen (Hessen Ideen, WIBank) existiert ein eng vernetztes Start-up-Ökosystem.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GEWERBESTEUER-RADAR */}
      {activeTab === "taxes" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Coins className="w-5 h-5 text-emerald-400" />
                  Gewerbesteuer-Hebesätze & Steuereinnahmen
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Vollständiger Vergleich aller 22 Städte und Gemeinden im Kreis Bergstraße (Datenquelle: Hessisches Statistisches Landesamt / Realsteuervergleich).
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Gemeinde suchen..."
                    value={taxSearch}
                    onChange={(e) => setTaxSearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-44"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setTaxRegionFilter("all")}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      taxRegionFilter === "all" ? "bg-slate-800 text-slate-100 font-semibold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Alle
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxRegionFilter("ried")}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      taxRegionFilter === "ried" ? "bg-slate-800 text-slate-100 font-semibold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Hessisches Ried
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxRegionFilter("bergstrasse")}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      taxRegionFilter === "bergstrasse" ? "bg-slate-800 text-slate-100 font-semibold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Bergstraße
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxRegionFilter("odenwald")}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      taxRegionFilter === "odenwald" ? "bg-slate-800 text-slate-100 font-semibold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Odenwald
                  </button>
                </div>
              </div>
            </div>

            {/* Steuereffekt-Infobox */}
            <div className="rounded-2xl bg-emerald-950/20 border border-emerald-500/20 p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-200/90 leading-relaxed">
                <strong>So wirkt sich der Hebesatz auf Unternehmen aus:</strong> Die effektive Gewerbesteuerbelastung berechnet sich aus dem einheitlichen Steuermessbetrag von 3,5% multipliziert mit dem kommunalen Hebesatz. Bei <strong>380% (Bürstadt)</strong> beträgt die effektive Gewerbesteuer <strong>13,30%</strong>, während sie bei 410% (Viernheim) bei 14,35% und bei 420% bei 14,70% liegt.
              </div>
            </div>

            {/* Sortable Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Gemeinde</th>
                    <th className="py-3.5 px-4 font-semibold">Teilregion</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Gewerbesteuer</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Grundsteuer B</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Ertrag GewSt</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Steuerkraft p.c.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                  {filteredTaxRates.map((t) => {
                    const region = getSubregion(t.municipality_id);
                    const isBuerstadt = t.municipality_id === "buerstadt";
                    return (
                      <tr
                        key={t.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isBuerstadt ? "bg-emerald-950/20 font-medium" : ""
                        }`}
                      >
                        <td className="py-3 px-4 flex items-center gap-2">
                          {isBuerstadt && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                          <span className="font-semibold text-slate-200">{t.municipality_name}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs">{region}</td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`px-2.5 py-1 rounded-md font-mono font-bold text-xs ${
                              t.hebesatz_gewerbesteuer <= 380
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : t.hebesatz_gewerbesteuer <= 400
                                ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {t.hebesatz_gewerbesteuer}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {t.hebesatz_grundsteuer_b}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-200">
                          {t.revenue_gewerbesteuer_eur
                            ? `${(t.revenue_gewerbesteuer_eur / 1_000_000).toFixed(2)} Mio. €`
                            : "–"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {t.tax_revenue_per_capita_eur ? `${t.tax_revenue_per_capita_eur.toFixed(0)} €` : "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: REGISTRATIONS & NET GROWTH */}
      {activeTab === "registrations" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Gewerbegründungen & Netto-Unternehmenswachstum
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Entwicklung der Gewerbeanmeldungen, -abmeldungen und des Netto-Saldos im Kreis Bergstraße nach amtlichen Daten von Statistik Hessen (HSL Bericht D I 1).
              </p>
            </div>

            {/* Visual Timeline Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {countyHistory.map((h) => (
                <div key={h.year} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-bold text-sm text-slate-100">Jahr {h.year}</span>
                    <span className="text-emerald-400 font-mono font-bold">+{h.net_balance} Netto</span>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Anmeldungen:</span>
                      <span className="font-semibold text-slate-200">{h.registrations_total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Davon Neugründungen:</span>
                      <span className="text-slate-300">{h.new_foundations}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Abmeldungen:</span>
                      <span className="font-semibold text-rose-300">{h.deregistrations_total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Davon Aufgaben:</span>
                      <span className="text-slate-300">{h.liquidations}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Municipality Detailed Breakdown */}
            <div className="pt-4 border-t border-slate-800">
              <h4 className="font-bold text-base text-slate-200 mb-3">
                Gewerbebilanz nach Kommunen (Berichtsjahr 2024)
              </h4>
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Gemeinde</th>
                      <th className="py-3 px-4 font-semibold text-right">Anmeldungen gesamt</th>
                      <th className="py-3 px-4 font-semibold text-right">Echte Neugründungen</th>
                      <th className="py-3 px-4 font-semibold text-right">Zuzüge</th>
                      <th className="py-3 px-4 font-semibold text-right">Abmeldungen</th>
                      <th className="py-3 px-4 font-semibold text-right">Netto-Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                    {muniRegistrations2024.map((m) => {
                      const isRied = ["buerstadt", "lampertheim", "biblis", "gross-rohrheim"].includes(m.region_code);
                      return (
                        <tr key={m.region_code} className={`hover:bg-slate-800/40 ${isRied ? "bg-emerald-950/10" : ""}`}>
                          <td className="py-3 px-4 font-semibold text-slate-200 capitalize">
                            {m.region_code.replace("-", " ")}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-100">{m.registrations_total}</td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-400">{m.new_foundations}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-400">{m.relocations_in}</td>
                          <td className="py-3 px-4 text-right font-mono text-rose-300">{m.deregistrations_total}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            +{m.net_balance}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MAJOR COMPANIES & EMPLOYERS */}
      {activeTab === "companies" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Factory className="w-5 h-5 text-emerald-400" />
                  Bedeutende regionale Arbeitgeber & Industrieunternehmen
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Öffentlich gelistete Unternehmen, Mitarbeitergrößenklassen und geschätzte Umsätze aus Bundesanzeiger & Northdata.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Unternehmen suchen..."
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-44"
                  />
                </div>

                <select
                  value={companyMuniFilter}
                  onChange={(e) => setCompanyMuniFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Alle Standorte</option>
                  {companyMunicipalities.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Company Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCompanies.map((comp) => (
                <div
                  key={comp.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-base text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {comp.name}
                        </h4>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>
                            {comp.municipality_name ?? comp.municipality_id}
                            {comp.district ? ` · ${comp.district}` : ""}
                          </span>
                        </div>
                      </div>
                      {comp.is_headquarters && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-300 uppercase tracking-wider shrink-0">
                          Hauptsitz
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                      {comp.description}
                    </p>

                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Branche:</span>
                        <span className="font-medium text-slate-300 text-right truncate max-w-[170px]">
                          {comp.industry_sector}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Beschäftigte:</span>
                        <span className="font-semibold text-sky-400">{comp.employee_range}</span>
                      </div>
                      {comp.turnover_estimated_range && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Geschätzter Umsatz:</span>
                          <span className="font-semibold text-emerald-400">{comp.turnover_estimated_range}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                    {comp.website ? (
                      <a
                        href={comp.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                      >
                        Website <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span />
                    )}

                    <Link
                      href={`/?highlight=${comp.id}`}
                      className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                    >
                      Auf Karte zeigen <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INDUSTRY STRUCTURE (WZ 2008) */}
      {activeTab === "industry" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                Branchen- und Beschäftigungsstruktur im Kreis Bergstraße
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Verteilung der sozialversicherungspflichtig Beschäftigten am Arbeitsort nach Wirtschaftsbereichen (Klassifikation der Wirtschaftszweige WZ 2008).
              </p>
            </div>

            <div className="space-y-4">
              {industryEmployment.map((sec) => (
                <div key={sec.sector_code} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-xs">
                        WZ {sec.sector_code}
                      </span>
                      <h4 className="font-bold text-slate-200 text-sm sm:text-base">{sec.sector_name}</h4>
                    </div>
                    <div className="text-right font-mono text-sm sm:text-base">
                      <span className="font-bold text-slate-100">{sec.employees_count.toLocaleString("de-DE")}</span>
                      <span className="text-slate-400 text-xs ml-2">({sec.share_percent.toFixed(1)}%)</span>
                    </div>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden mt-2">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                      style={{ width: `${Math.min(sec.share_percent * 2.5, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: STARTUPS & INNOVATION */}
      {activeTab === "startups" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-emerald-400" />
                Start-up-Ökosystem & Förderprogramme in Südhessen
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Regionale Anlaufstellen, Beratungsangebote, Gründerpreise und Finanzierungsprogramme für Gründerinnen, Gründer und Nachfolger.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {startupInitiatives.map((init) => (
                <div
                  key={init.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-emerald-500/40 transition-all space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                        {init.organizer}
                      </span>
                      {init.funding_bracket && (
                        <span className="text-xs font-mono text-amber-300 font-semibold">
                          {init.funding_bracket}
                        </span>
                      )}
                    </div>

                    <h4 className="text-lg font-bold text-slate-100">{init.name}</h4>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{init.description}</p>

                    {init.target_group && (
                      <div className="text-xs text-slate-400">
                        <span className="text-slate-500">Zielgruppe:</span> {init.target_group}
                      </div>
                    )}
                  </div>

                  {init.url && (
                    <div className="pt-3 border-t border-slate-800/80">
                      <a
                        href={init.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        Offizielle Website besuchen <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
