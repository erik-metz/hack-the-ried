"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { osmLocation, type BahnMarker } from "@/lib/bahnData";

export default function BahnMap({ markers, onSelect }: { markers: BahnMarker[]; onSelect: (id: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const viewport = useRef("");
  const callbacks = useRef(onSelect);
  const [missingTiles, setMissingTiles] = useState(false);

  useEffect(() => { callbacks.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { scrollWheelZoom: false }).setView([49.68, 8.46], 12);
    map.current = instance;
    L.tileLayer("/api/map-tiles/base/{z}/{x}/{y}.png", {
      minZoom: 8, maxZoom: 19, maxNativeZoom: 14,
      bounds: [[49.55, 8.30], [49.80, 8.65]],
      attribution: '© <a href="https://www.bkg.bund.de">BKG</a> · <a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a> · DB InfraGO (CC0)',
    }).on("tileerror", () => setMissingTiles(true)).addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(element.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !markers.length) return;
    const group = L.layerGroup().addTo(instance);
    for (const marker of markers) {
      // DOM text protects provider names and descriptions from HTML interpretation.
      const popup = document.createElement("div");
      for (const text of [marker.stationName, marker.name, marker.typeLabel, marker.statusLabel, marker.positionLabel]) {
        const line = document.createElement("p"); line.textContent = text; popup.append(line);
      }
      const location = document.createElement("a");
      location.href = osmLocation(marker.latitude, marker.longitude);
      location.target = "_blank"; location.rel = "noopener noreferrer";
      location.textContent = "Position auf OpenStreetMap öffnen";
      popup.append(location);
      const details = document.createElement("button");
      details.type = "button"; details.textContent = "Infrastrukturdetails anzeigen";
      details.style.display = "block"; details.style.marginTop = "8px";
      details.addEventListener("click", () => callbacks.current(marker.id));
      popup.append(details);
      const icon = document.createElement("span");
      icon.textContent = "⌖";
      icon.style.cssText = "display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#065f46;color:white;border:2px solid #6ee7b7;font-size:22px";
      L.marker([marker.latitude, marker.longitude], {
        title: `${marker.stationName} · ${marker.name}`,
        icon: L.divIcon({ html: icon, className: "", iconSize: [30, 30], iconAnchor: [15, 15] }),
      }).bindPopup(popup).addTo(group);
    }
    const signature = markers.map(marker => `${marker.id}:${marker.latitude}:${marker.longitude}`).join("|");
    if (signature !== viewport.current) {
      instance.fitBounds(L.latLngBounds(markers.map(marker => [marker.latitude, marker.longitude])), { padding: [36, 36], maxZoom: 18, animate: false });
      viewport.current = signature;
    }
    return () => { group.remove(); };
  }, [markers]);

  const outsideRied = markers.some(marker => marker.latitude < 49.55 || marker.latitude > 49.80 || marker.longitude < 8.30 || marker.longitude > 8.65);
  return <div className="space-y-2">
    {(outsideRied || missingTiles) && <p className="text-sm text-amber-300" role="status">Für diesen Ausschnitt ist die Hintergrundkarte teilweise nicht verfügbar. Die Objektpositionen bleiben sichtbar.</p>}
    <div ref={element} className="h-80 sm:h-96 rounded-xl border border-slate-700 bg-slate-800" role="region" aria-label="Karte der gemeldeten Bahnhofsinfrastruktur" />
    <p className="text-xs text-slate-400">Marker lassen sich mit der Tabulatortaste auswählen. Alle Positionen stehen auch in der Infrastruktur-Tabelle.</p>
  </div>;
}
