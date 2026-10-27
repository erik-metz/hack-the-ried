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

const MAX_POSTCODE_FEATURES = 100;

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
        if (body.type !== "FeatureCollection" || !Array.isArray(body.features) || body.features.length > MAX_POSTCODE_FEATURES) {
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
        const card = detailCard(`Schädlingsmeldungen · ${name}`, `PLZ ${postcode} · Meldungen nach Gebiet`, []);
        const timestamp = document.createElement("p");
        timestamp.className = "schadlingsradar-timestamp";
        timestamp.textContent = `Datenstand: ${snapshot.generated
          ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.generated))
          : "unbekannt"}`;
        card.append(timestamp);

        const allSpecies = Object.entries(SPECIES_LABELS).map(([species, label]) => ({
          label,
          counts: reports[species] ?? { d7: 0, d30: 0, d90: 0, d365: 0, dalle: 0 },
        }));
        const totals = allSpecies.reduce(
          (sum, item) => ({ d7: sum.d7 + item.counts.d7, d30: sum.d30 + item.counts.d30, dalle: sum.dalle + item.counts.dalle }),
          { d7: 0, d30: 0, dalle: 0 },
        );
        const summary = document.createElement("div");
        summary.className = "schadlingsradar-summary";
        for (const [label, value] of [["Letzte 7 Tage", totals.d7], ["Letzte 30 Tage", totals.d30], ["Insgesamt", totals.dalle]] as const) {
          const item = document.createElement("div");
          item.className = "schadlingsradar-summary-item";
          const number = document.createElement("strong");
          number.textContent = String(value);
          const caption = document.createElement("span");
          caption.textContent = label;
          item.append(number, caption);
          summary.append(item);
        }
        card.append(summary);

        const activeSpecies = allSpecies.filter(({ counts }) =>
          counts.d7 > 0 || counts.d30 > 0 || counts.d90 > 0 || counts.d365 > 0 || counts.dalle > 0,
        );
        const results = document.createElement("div");
        results.className = "schadlingsradar-results";
        const heading = document.createElement("h3");
        heading.className = "schadlingsradar-section-title";
        heading.textContent = activeSpecies.length ? "Meldungen nach Schädlingsart" : "Keine Meldungen erfasst";
        results.append(heading);
        if (activeSpecies.length) {
          const list = document.createElement("ul");
          list.className = "schadlingsradar-species-list";
          for (const { label, counts } of activeSpecies) {
            const row = document.createElement("li");
            const speciesName = document.createElement("strong");
            speciesName.textContent = label;
            const values = document.createElement("span");
            values.textContent = `7 Tage ${counts.d7} · 30 Tage ${counts.d30} · 90 Tage ${counts.d90} · 12 Monate ${counts.d365} · Gesamt ${counts.dalle}`;
            row.append(speciesName, values);
            list.append(row);
          }
          results.append(list);
        } else {
          const empty = document.createElement("p");
          empty.className = "schadlingsradar-empty";
          empty.textContent = "Für dieses PLZ-Gebiet liegen derzeit keine Meldungen vor.";
          results.append(empty);
        }
        card.append(results);

        const details = document.createElement("details");
        details.className = "schadlingsradar-details";
        const detailsLabel = document.createElement("summary");
        detailsLabel.textContent = "Alle Schädlingsarten anzeigen";
        const allList = document.createElement("ul");
        allList.className = "schadlingsradar-species-list schadlingsradar-species-list-all";
        for (const { label, counts } of allSpecies) {
          const row = document.createElement("li");
          const speciesName = document.createElement("strong");
          speciesName.textContent = label;
          const values = document.createElement("span");
          values.textContent = `7 Tage ${counts.d7} · 30 Tage ${counts.d30} · 90 Tage ${counts.d90} · 12 Monate ${counts.d365} · Gesamt ${counts.dalle}`;
          row.append(speciesName, values);
          allList.append(row);
        }
        details.append(detailsLabel, allList);
        card.append(details);

        const note = document.createElement("p");
        note.className = "schadlingsradar-location-note";
        note.textContent = "Der Marker zeigt das PLZ-Gebiet, keinen Fundort.";
        card.append(note);
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "schadlingsradar-source-link";
        link.textContent = "Details beim Schädlingsradar öffnen";
        card.append(link);
        marker.bindPopup(card, { className: "schadlingsradar-popup", maxWidth: 390, minWidth: 290 });
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
