"use client";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { publicMapTileUrl } from "@/lib/publicMapData";
import "leaflet/dist/leaflet.css";

interface SensorLocationMapProps {
  latitude: number;
  longitude: number;
  name: string;
}

export default function SensorLocationMap({ latitude, longitude, name }: SensorLocationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [tilesMissing, setTilesMissing] = useState(false);

  useEffect(() => {
    if (!container.current) return;

    const location: L.LatLngExpression = [latitude, longitude];
    const map = L.map(container.current, { scrollWheelZoom: false, dragging: true }).setView(location, 16);
    L.tileLayer(publicMapTileUrl("base"), {
      minZoom: 8,
      maxZoom: 19,
      maxNativeZoom: 14,
      bounds: [[49.55, 8.30], [49.80, 8.65]],
      attribution: '© <a href="https://www.bkg.bund.de">BKG</a> · <a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>',
    })
      .on("tileerror", () => setTilesMissing(true))
      .addTo(map);

    const marker = L.marker(location, { title: name, alt: `Standort von ${name}`, keyboard: true }).addTo(map);
    const popup = document.createElement("div");
    const label = document.createElement("p");
    label.textContent = name;
    popup.append(label);
    const link = document.createElement("a");
    link.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=18/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "In OpenStreetMap öffnen";
    popup.append(link);
    marker.bindPopup(popup);

    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      map.remove();
    };
  }, [latitude, longitude, name]);

  return (
    <div className="space-y-2">
      {tilesMissing && (
        <p className="text-sm text-amber-300" role="status">
          Die Hintergrundkarte ist gerade nicht verfügbar. Der Standortmarker bleibt sichtbar.
        </p>
      )}
      <div
        ref={container}
        className="h-64 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 sm:h-80"
        role="region"
        aria-label={`Karte mit Standortmarker für ${name}`}
      />
    </div>
  );
}
