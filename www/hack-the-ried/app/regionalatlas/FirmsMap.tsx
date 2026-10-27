"use client";

import { useEffect, useRef, useState } from "react";
import type { Detection } from "./FirmsSection";
import "leaflet/dist/leaflet.css";

const colors = { l: "#facc15", n: "#f97316", h: "#dc2626" };
export default function FirmsMap({ detections }: { detections: Detection[] }) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;
    import("leaflet").then(L => {
      if (cancelled || !element.current) return;
      map = L.map(element.current).setView([49.645, 8.455], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
      for (const detection of detections) {
        const label = document.createElement("span");
        label.textContent = `${detection.satellite} / ${detection.instrument} · ${new Date(detection.acquired_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · Konfidenz ${detection.confidence} · FRP ${detection.frp_mw} MW`;
        L.circleMarker([detection.latitude, detection.longitude], { radius: 6, color: colors[detection.confidence], fillOpacity: 0.8 }).bindPopup(label).addTo(map);
      }
    }).catch(() => { if (!cancelled) setError("Anomalienkarte aktuell nicht verfügbar."); });
    return () => { cancelled = true; map?.remove(); };
  }, [detections]);
  return <div className="space-y-2"><div ref={element} className="h-96 w-full rounded-xl" role="region" aria-label="Karte thermischer Anomalien von NASA FIRMS" />{error ? <p role="status">{error}</p> : null}<p className="text-sm text-slate-400">Konfidenz: niedrig gelb · nominal orange · hoch rot. Punktsymbole zeigen keine Brandfläche.</p></div>;
}
