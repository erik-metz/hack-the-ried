"use client";

import { useEffect, useState } from "react";
import { Zap, Sun, Leaf, Flame } from "lucide-react";
import { type LiveEnergySummary } from "@/lib/infrastructureData";

export default function CleanEnergyWidget() {
  const [data, setData] = useState<LiveEnergySummary | null>(null);
  const [sourceTime, setSourceTime] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchEnergy() {
      try {
        const res = await fetch("/api/infrastructure/energy", { cache: "no-store" });
        if (!res.ok) throw new Error("Unavailable");
        if (res.ok) {
          const json = await res.json();
          if (!Array.isArray(json.facilities)) throw new Error("Invalid energy data");
          if (!cancelled) {
            setData(json);
            setSourceTime(res.headers.get("x-source-updated-at"));
          }
        }
      } catch {
        if (!cancelled) { setData(null); setSourceTime(null); }
      }
    }

    void fetchEnergy();
    const timer = setInterval(() => { if (!document.hidden) void fetchEnergy(); }, 60000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!data) return <p role="status" className="p-6 text-slate-400">Energie: keine aktuellen gespeicherten Messwerte verfügbar.</p>;

  const totalCapKw = data.totalInstalledCapacityKw;
  const currentMw = data.currentTotalPowerMw;
  const todayKwh = data.todayTotalEnergyKwh;
  const todayCo2Kg = data.todayCo2AvoidedKg;
  const solarKw = data.byTypeKw["solar_pv"] ?? null;
  const biogasKw = data.byTypeKw["biogas"] != null && data.byTypeKw["landfill_gas"] != null
    ? data.byTypeKw["biogas"] + data.byTypeKw["landfill_gas"] : null;

  return (
    <div className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 sm:p-8 space-y-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Zap className="size-3.5" /> Erneuerbare Energien im Ried
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-100">
            Regionale Ökostrom- & Biogaserzeugung
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gespeicherte Erzeugungsmessungen aus den angebundenen Quellen.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-full text-xs self-start sm:self-auto">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300 font-medium">
            {sourceTime ? `Messstand: ${new Date(sourceTime).toLocaleString("de-DE")}` : "Gespeicherte Messwerte"}
          </span>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Live Power Output */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Momentanleistung</span>
            <Zap className="size-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400">
            {currentMw == null ? "—" : currentMw.toFixed(2)} <span className="text-sm font-normal text-slate-400">MW</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {totalCapKw == null ? "Installierte Leistung unbekannt" : `${(totalCapKw / 1000).toFixed(1)} MW installiert`}
          </div>
        </div>

        {/* KPI 2: Solar PV Generation */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Photovoltaik (Solar)</span>
            <Sun className="size-4 text-amber-300" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100">
            {solarKw == null ? "—" : solarKw >= 1000 ? `${(solarKw / 1000).toFixed(2)} MW` : `${Math.round(solarKw)} kW`}
          </div>
          <div className="text-[11px] text-amber-400/80">
            Leistung aus gespeicherten Messwerten
          </div>
        </div>

        {/* KPI 3: Biogas & Deponiegas Baseload */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Biogas / Deponiegas</span>
            <Flame className="size-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
            {biogasKw == null ? "—" : biogasKw >= 1000 ? `${(biogasKw / 1000).toFixed(2)} MW` : `${Math.round(biogasKw)} kW`}
          </div>
          <div className="text-[11px] text-emerald-400/80">
            Leistung aus gespeicherten Messwerten
          </div>
        </div>

        {/* KPI 4: CO2 Avoided Today */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>CO₂-Einsparung heute</span>
            <Leaf className="size-4 text-teal-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-teal-400">
            {todayCo2Kg == null || !data.co2Method ? "—" : todayCo2Kg >= 1000 ? `${(todayCo2Kg / 1000).toFixed(1)} t` : `${todayCo2Kg} kg`}
          </div>
          <div className="text-[11px] text-slate-500">
            {todayKwh == null ? "Tagesertrag unbekannt" : `${todayKwh.toLocaleString("de-DE")} kWh Ökostrom heute`}
            {data.co2Method && <p>Berechnung: {data.co2Method}</p>}
          </div>
        </div>
      </div>

      {/* Facilities Breakdown List */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Erfasste Erzeugungsanlagen & Energieparks
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.facilities.map((fac) => {
            const isBio = fac.facilityType === "biogas" || fac.facilityType === "landfill_gas";
            return (
              <div
                key={fac.id}
                className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/70 hover:border-slate-700 transition-colors flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{isBio ? "🌱" : "☀️"}</span>
                    <span className="text-xs font-bold text-slate-200 truncate">{fac.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {fac.operator} · {fac.municipality}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-xs font-bold ${isBio ? "text-emerald-400" : "text-amber-400"}`}>
                    {fac.currentPowerKw == null ? "—" : fac.currentPowerKw >= 1000
                      ? `${(fac.currentPowerKw / 1000).toFixed(2)} MW`
                      : `${Math.round(fac.currentPowerKw)} kW`}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Kap: {fac.installedCapacityKw == null ? "—" : fac.installedCapacityKw >= 1000 ? `${(fac.installedCapacityKw / 1000).toFixed(1)} MW` : `${fac.installedCapacityKw} kW`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
