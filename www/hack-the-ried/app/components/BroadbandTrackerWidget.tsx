"use client";

import { useEffect, useState } from "react";
import {
  Globe,
  Wifi,
  BatteryCharging,
  Route,
} from "lucide-react";
import {
  type EvChargingStation,
  type RoadSegment,
  type WifiHotspot,
} from "@/lib/infrastructureData";

interface HouseholdCoverage {
  id: string;
  municipality: string;
  referenceMonth: string;
  fttbHPct: number | null;
  gigabitPct: number | null;
}
const percentage = (value: number | null) => value === null ? "Nicht ausgewiesen" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })}%`;

export default function BroadbandTrackerWidget() {
  const [broadbandAreas, setBroadbandAreas] = useState<HouseholdCoverage[]>([]);
  const [evChargers, setEvChargers] = useState<EvChargingStation[]>([]);
  const [roadSegments, setRoadSegments] = useState<RoadSegment[]>([]);
  const [wifiHotspots, setWifiHotspots] = useState<WifiHotspot[]>([]);
  const [wifiAvailable, setWifiAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [bbRes, evRes, roadRes, wifiRes] = await Promise.all([
          fetch("/api/infrastructure/broadband", { cache: "no-store" }),
          fetch("/api/infrastructure/ev-charging", { cache: "no-store" }),
          fetch("/api/infrastructure/road-conditions", { cache: "no-store" }),
          fetch("/api/infrastructure/wifi", { cache: "no-store" }),
        ]);

        if (!cancelled) {
          if (bbRes.ok) {
            const d = await bbRes.json();
            setBroadbandAreas(d.contract_version === "bba-households-v1" && Array.isArray(d.areas) ? d.areas : []);
          } else { setBroadbandAreas([]); }
          if (evRes.ok) {
            const d = await evRes.json();
            setEvChargers(Array.isArray(d.stations) ? d.stations : []);
          } else { setEvChargers([]); }
          if (roadRes.ok) {
            const d = await roadRes.json();
            setRoadSegments(Array.isArray(d.segments) ? d.segments : []);
          } else { setRoadSegments([]); }
          setWifiAvailable(wifiRes.ok);
          if (wifiRes.ok) {
            const d = await wifiRes.json();
            setWifiHotspots(Array.isArray(d.hotspots) ? d.hotspots : []);
          } else { setWifiHotspots([]); }
        }
      } catch {
        if (!cancelled) { setBroadbandAreas([]); setEvChargers([]); setRoadSegments([]); setWifiHotspots([]); setWifiAvailable(false); }
      }
    }

    void loadData();
    const timer = setInterval(() => { if (!document.hidden) void loadData(); }, 60000);
    return () => {
      clearInterval(timer);
      cancelled = true;
    };
  }, []);

  if (!broadbandAreas.length && !evChargers.length && !roadSegments.length && !wifiHotspots.length) return <p role="status" className="p-6 text-slate-400">Infrastruktur: noch keine gespeicherten Daten verfügbar.</p>;

  const totalSockets = evChargers.reduce((sum, e) => sum + e.totalPoints, 0);
  const freeSockets = evChargers.reduce((sum, e) => sum + (e.availablePoints ?? 0), 0);
  const fastChargers = evChargers.filter((e) => e.isFastCharger).length;

  const avgRoadGrade = roadSegments.length > 0
    ? roadSegments.reduce((sum, r) => sum + r.conditionGrade, 0) / roadSegments.length
    : 0;
  const goodRoadPct = roadSegments.length > 0
    ? Math.round((roadSegments.filter((r) => r.conditionGrade <= 2.5).length / roadSegments.length) * 100)
    : 0;

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <Globe className="size-3.5" /> Vernetzte Infrastruktur
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-slate-100">
          Breitband, E-Mobilität & Straßenzustand
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Transparente Einblicke in digitale Lebensadern: Glasfaserverfügbarkeit, Ladesäulen und Straßenzustand.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Panel 1: Broadband & Fibre Rollout */}
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Globe className="size-4 text-purple-400" />
                <span>Glasfaserverfügbarkeit (FTTB/H)</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                Gigabit-Status
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Anteil der Privathaushalte mit technisch verfügbarem Gebäude- oder Wohnungsanschluss. Keine Vertragsquote oder gemessene Geschwindigkeit.
            </p>

            <div className="space-y-2.5 pt-1">
              {broadbandAreas.map((area) => (
                <div key={area.id} className="space-y-1">
                  <div className="flex justify-between text-xs gap-2">
                    <span className="text-slate-300 font-medium">{area.municipality}</span>
                    <span className="text-purple-300">{percentage(area.fttbHPct)}</span>
                  </div>
                  {area.fttbHPct !== null ? (
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-full bg-purple-500" style={{ width: `${area.fttbHPct}%` }} />
                    </div>
                  ) : null}
                  <p className="text-[11px] text-slate-400">Gigabit, alle Technologien: {percentage(area.gigabitPct)} · Stand {area.referenceMonth}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-2 flex items-center justify-between">
            <a href="https://gigabitgrundbuch.bund.de" target="_blank" rel="noopener noreferrer">Quelle: Breitbandatlas | Gigabit-Grundbuch</a>
            <span className="text-purple-400">Gemeindestatistik</span>
          </div>
        </div>

        {/* Panel 2: EV Charging Stations */}
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <BatteryCharging className="size-4 text-emerald-400" />
                <span>Öffentliche E-Ladesäulen</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                BNetzA
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <div className="text-xl font-extrabold text-emerald-400">
                  {evChargers.some(e => e.availablePoints === null) ? "–" : freeSockets} <span className="text-xs font-normal text-slate-400">/ {totalSockets}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Freie Ladepunkte</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <div className="text-xl font-extrabold text-sky-400">
                  {fastChargers}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Registrierte Schnellladeeinrichtungen</div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-300">
              {evChargers.slice(0, 3).map((ev) => (
                <div key={ev.id} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/40">
                  <span className="truncate max-w-[150px] font-medium">{ev.name.replace(/^(Entega|Stadtwerke|Pfalzwerke|EnBW)\s+Ladesäule\s+/i, "")}</span>
                  <span className="shrink-0 flex items-center gap-1">
                    <span className={`size-1.5 rounded-full ${(ev.availablePoints ?? 0) > 0 ? "bg-emerald-400" : "bg-red-400"}`} />
                    <span className="text-[11px] font-mono text-slate-400">{ev.availablePoints === null ? "Belegung unbekannt" : `${ev.availablePoints}/${ev.totalPoints} frei`}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-2 flex items-center justify-between">
            <span>Gespeicherte Standorte im Kartengebiet</span>
            <span className="text-emerald-400">Auf Karte aktiv</span>
          </div>
        </div>

        {/* Panel 3: Road Quality Monitoring (ZAKB AI Fleet) */}
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Route className="size-4 text-lime-400" />
                <span>KI-Straßenzustand (ZAKB)</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-lime-400 bg-lime-500/10 border border-lime-500/20 px-2 py-0.5 rounded-full">
                Smarter Kreis
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Erfasst über Smartphone-Kameras an Windschutzscheiben der ZAKB-Müllfahrzeuge während der Regeltouren.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <div className="text-xl font-extrabold text-lime-400">
                  {roadSegments.length ? avgRoadGrade.toFixed(1) : "–"}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Ø Zustandsnote</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <div className="text-xl font-extrabold text-emerald-400">
                  {roadSegments.length ? `${goodRoadPct}%` : "–"}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Guter Zustand (≤2.5)</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Wifi className="size-3.5 text-cyan-400" />
                <span>Freies WLAN ({wifiAvailable ? wifiHotspots.length : "–"} Hotspots)</span>
              </div>
              <span className="text-[11px] text-cyan-400 font-medium">Hessen-WLAN & Freifunk</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-2 flex items-center justify-between">
            <span>Förderung: Starke Heimat Hessen</span>
            <span className="text-lime-400">Farbkodiert auf Karte</span>
          </div>
        </div>
      </div>
    </div>
  );
}
