"use client";
import { publicApiUrl } from "@/lib/publicRequests";
import { pollVisible } from "@/lib/visiblePolling";

import { useEffect, useState } from "react";

interface SkyReading {
  value: number;
  unit: string;
  observed_at: string;
}

interface SkySnapshot {
  phase_name: string;
  observed_at: string;
  location: { region: string; latitude: number; longitude: number };
  readings: Record<string, SkyReading>;
}

function direction(degrees: number) {
  return ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8];
}

function point(azimuth: number, altitude: number) {
  const angle = (azimuth * Math.PI) / 180;
  const radius = 23 * (1 - Math.max(0, Math.min(90, altitude)) / 110);
  return { x: 32 + Math.sin(angle) * radius, y: 32 - Math.cos(angle) * radius };
}

function degrees(snapshot: SkySnapshot, key: string) {
  return snapshot.readings[key]?.value;
}

export default function MapSkyWidget() {
  const [snapshot, setSnapshot] = useState<SkySnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const stop = pollVisible(async signal => {
      const controller = { signal };
      if (!document.hidden) {
        try {
          const response = await fetch(publicApiUrl("sky"), { signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error("Unavailable");
          const body = await response.json() as SkySnapshot;
          if (!body.readings?.sun_azimuth || !body.readings?.moon_phase_angle) throw new Error("Incomplete");
          if (!controller.signal.aborted) {
            setSnapshot(body);
            setUnavailable(false);
          }
        } catch {
          if (!controller.signal.aborted) setUnavailable(true);
        }
      }
    }, 60_000);
    return stop;
  }, []);

  if (!snapshot) {
    return <div className="absolute left-3 top-3 z-[1000] rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-300 shadow-lg" role="status">
      {unavailable ? "Himmelsdaten für das Hessische Ried nicht verfügbar" : "Himmelsstand wird geladen …"}
    </div>;
  }

  const sunAz = degrees(snapshot, "sun_azimuth")!;
  const sunAlt = degrees(snapshot, "sun_altitude")!;
  const moonAz = degrees(snapshot, "moon_azimuth")!;
  const moonAlt = degrees(snapshot, "moon_altitude")!;
  const sun = point(sunAz, sunAlt);
  const moon = point(moonAz, moonAlt);
  const illumination = degrees(snapshot, "moon_illumination") ?? 0;
  const updatedAt = new Date(snapshot.observed_at).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

  return <section aria-label="Sonnen- und Mondstand im Hessischen Ried" className="absolute left-3 top-3 z-[1000] w-52 rounded-xl border border-slate-700/90 bg-slate-950/90 p-3 text-xs text-slate-100 shadow-xl backdrop-blur">
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 64 64" className="size-16 shrink-0" role="img" aria-label="Kompass mit berechneter Position von Sonne und Mond">
        <circle cx="32" cy="32" r="25" fill="#0f172a" stroke="#64748b" strokeWidth="1.5" />
        <path d="M32 7 A25 25 0 0 1 57 32 M57 32 A25 25 0 0 1 32 57 M32 57 A25 25 0 0 1 7 32 M7 32 A25 25 0 0 1 32 7" fill="none" stroke="#334155" strokeDasharray="2 3" />
        <text x="32" y="6" textAnchor="middle" fill="#cbd5e1" fontSize="5">N</text>
        <text x="59" y="34" textAnchor="middle" fill="#cbd5e1" fontSize="5">O</text>
        <text x="32" y="63" textAnchor="middle" fill="#cbd5e1" fontSize="5">S</text>
        <text x="5" y="34" textAnchor="middle" fill="#cbd5e1" fontSize="5">W</text>
        {sunAlt >= 0 && <circle cx="32" cy="32" style={{ transform: `translate(${sun.x - 32}px, ${sun.y - 32}px)`, transition: "transform 300s linear" }} r="4" fill="#fbbf24" stroke="#fff7ed" strokeWidth="1"><title>Sonne {Math.round(sunAz)}° {direction(sunAz)}, Höhe {Math.round(sunAlt)}°</title></circle>}
        {moonAlt >= 0 && <circle cx="32" cy="32" style={{ transform: `translate(${moon.x - 32}px, ${moon.y - 32}px)`, transition: "transform 300s linear" }} r="3.5" fill="#e2e8f0" stroke="#38bdf8" strokeWidth="1"><title>Mond {Math.round(moonAz)}° {direction(moonAz)}, Höhe {Math.round(moonAlt)}°</title></circle>}
      </svg>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-amber-200">☀ {sunAlt >= 0 ? `${Math.round(sunAlt)}° · ${direction(sunAz)}` : "unter dem Horizont"}</p>
        <p className="text-slate-200">☾ {moonAlt >= 0 ? `${Math.round(moonAlt)}° · ${direction(moonAz)}` : "unter dem Horizont"}</p>
        <p className="font-medium text-sky-200">{snapshot.phase_name}</p>
        <p className="text-slate-300">{Math.round(illumination)} % beleuchtet</p>
      </div>
    </div>
    <p className="mt-2 border-t border-slate-700 pt-1.5 text-[10px] text-slate-400">
      Hessisches Ried · Modellwert {updatedAt} Uhr
    </p>
    {unavailable && <p role="status" className="mt-1 text-[10px] text-amber-200">Aktualisierung derzeit nicht erreichbar; letzter Datenstand bleibt sichtbar.</p>}
  </section>;
}
