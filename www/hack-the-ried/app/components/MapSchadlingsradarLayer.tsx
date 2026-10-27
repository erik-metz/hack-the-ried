"use client";

import L from "leaflet";
import { useEffect, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import { detailCard } from "@/lib/mapPresentation";

type PeriodCounts = { d7: number; d30: number; d90: number; d365: number; dalle: number };
type PostcodeFeature = GeoJSON.Feature<Point, {
  postcode: string;
  name: string;
  reports: Record<string, PeriodCounts>;
  url: string;
}>;
type Snapshot = FeatureCollection<Point> & {
  source?: string;
  attribution?: string;
  generated?: string;
  features: PostcodeFeature[];
};

const SPECIES_LABELS: Record<string, string> = {
  ratten: "Ratten",
  maeuse: "Mäuse",
  wespen: "Wespen",
  hornissen: "Hornissen",
  "asiatische-hornisse": "Asiatische Hornissen",
  schaben: "Schaben",
  bettwanzen: "Bettwanzen",
  tauben: "Tauben",
  ameisen: "Ameisen",
  marder: "Marder",
  eichenprozessionsspinner: "Eichenprozessionsspinner",
  tigermuecke: "Tigermücken",
};

function totalForPeriod(reports: Record<string, PeriodCounts>, period: keyof PeriodCounts) {
  return Object.values(reports).reduce((total, counts) => total + counts[period], 0);
}

export default function MapSchadlingsradarLayer({ map }: { map: L.Map }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/collected/civic/schaedlingsradar", { signal: controller.signal, cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("unavailable"); return response.json(); })
      .then((body: Snapshot) => {
        if (body.type !== "FeatureCollection" || !Array.isArray(body.features) || body.features.length > 20) {
          throw new Error("invalid");
        }
        setSnapshot(body);
        setFailed(false);
      })
      .catch(() => { if (!controller.signal.aborted) { setSnapshot(null); setFailed(true); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const paneName = "schadlingsradar";
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = "456";
    const layer = L.geoJSON(snapshot, {
      pane: paneName,
      pointToLayer: (feature, latlng) => {
        const counts = feature.properties?.reports as Record<string, PeriodCounts> | undefined;
        const total = counts ? totalForPeriod(counts, "d30") : 0;
        const color = total > 0 ? "#84cc16" : "#64748b";
        const badge = document.createElement("span");
        badge.style.cssText = `display:flex;width:32px;height:32px;align-items:center;justify-content:center;border:2px solid white;border-radius:50%;background:${color};color:white;font-size:12px;font-weight:700;box-shadow:0 1px 5px #0009`;
        badge.textContent = String(total);
        const icon = L.divIcon({
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          html: badge,
        });
        return L.marker(latlng, { pane: paneName, icon, title: `Schädlingsmeldungen ${String(feature.properties?.postcode ?? "")}` });
      },
      onEachFeature: (feature, marker) => {
        const { name, postcode, reports, url } = feature.properties;
        const card = detailCard(`Schädlingsmeldungen · ${name}`, `PLZ ${postcode} · Meldungen, keine Tierzahlen`, [
          `Datenstand: ${snapshot.generated ? new Date(snapshot.generated).toLocaleString("de-DE") : "unbekannt"}`,
          "Marker zeigt das Gebiet, keinen Fundort",
        ]);
        const table = document.createElement("div");
        table.className = "mt-2 space-y-1";
        const heading = document.createElement("p");
        heading.className = "font-semibold";
        heading.textContent = "Meldungen nach Schädlingsart";
        table.append(heading);
        for (const [species, label] of Object.entries(SPECIES_LABELS)) {
          const counts = reports[species] ?? { d7: 0, d30: 0, d90: 0, d365: 0, dalle: 0 };
          const row = document.createElement("p");
          row.textContent = `${label}: 7T ${counts.d7} · 30T ${counts.d30} · 90T ${counts.d90} · 12M ${counts.d365} · gesamt ${counts.dalle}`;
          table.append(row);
        }
        card.append(table);
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "PLZ-Lage beim Schädlingsradar öffnen";
        card.append(link);
        marker.bindPopup(card, { maxWidth: 360 });
        marker.bindTooltip(`${name} · ${postcode} · ${totalForPeriod(reports, "d30")} Meldungen (30 Tage)`, { direction: "top", offset: [0, -12] });
      },
    }).addTo(map);
    const attribution = '<a href="https://www.schaedlingsradar.de/lage/" target="_blank" rel="noreferrer">Daten: Schädlingsradar · aggregiert nach PLZ</a>';
    map.attributionControl?.addAttribution(attribution);
    return () => { layer.remove(); map.attributionControl?.removeAttribution(attribution); };
  }, [map, snapshot]);

  if (failed) return <p role="status">Schädlingsradar-Daten sind derzeit nicht verfügbar.</p>;
  if (!snapshot) return <p role="status">Schädlingsradar-Daten werden geladen …</p>;
  return <p>Schädlingsmeldungen je PLZ · Stand {snapshot.generated ? new Date(snapshot.generated).toLocaleString("de-DE") : "unbekannt"}. Marker zeigen PLZ-Gebiete, keine Fundorte.</p>;
}
