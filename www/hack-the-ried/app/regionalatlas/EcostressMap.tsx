"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export default function EcostressMap({ sceneId }: { sceneId: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;
    import("leaflet").then(L => {
      if (cancelled || !element.current) return;
      map = L.map(element.current).setView([49.645, 8.455], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
      }).addTo(map);
      L.tileLayer(`/api/ecostress/tiles/${encodeURIComponent(sceneId)}/{z}/{x}/{y}`, {
        attribution: "NASA ECOSTRESS V003", maxZoom: 19, opacity: 0.8,
      }).on("tileerror", () => { if (!cancelled) setError("Temperaturkacheln aktuell nicht verfügbar."); }).addTo(map);
    }).catch(() => { if (!cancelled) setError("Karte aktuell nicht verfügbar."); });
    return () => { cancelled = true; map?.remove(); };
  }, [sceneId]);
  return <div className="space-y-2">
    <div ref={element} className="h-96 w-full rounded-xl" role="region" aria-label="Karte der ECOSTRESS-Oberflächentemperatur" />
    {error ? <p role="status">{error}</p> : null}
    <p className="text-sm text-slate-400">Feste Farbskala: −10 °C dunkelblau · 0 °C blau · 20 °C gelb · 40 °C orange · 60 °C dunkelrot. Werte außerhalb werden an den Farbgrenzen dargestellt. Ungültige Pixel sind transparent. Vergrößern erhöht die räumliche Auflösung nicht.</p>
  </div>;
}
