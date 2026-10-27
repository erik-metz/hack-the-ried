"use client";
import L from "leaflet";
import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { detailCard } from "@/lib/mapPresentation";

type Report = { id: string; category?: string | null; status?: string | null; reportedAt?: string | null; url: string };
type Snapshot = FeatureCollection & { source?: string; license?: string; attribution?: string };
const STATUS_COLORS: Record<string, string> = { open: "#f97316", checked: "#eab308", approved: "#3b82f6", solved: "#22c55e", closed: "#64748b" };

export default function MapMaengelmelderLayer({ map }: { map: L.Map }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/collected/civic/maengelmelder", { signal: controller.signal, cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("unavailable"); return response.json(); })
      .then((body: Snapshot) => {
        if (body.type !== "FeatureCollection" || !Array.isArray(body.features) || body.features.length > 1000) throw new Error("invalid");
        setSnapshot(body); setFailed(false);
      })
      .catch(() => { if (!controller.signal.aborted) { setSnapshot(null); setFailed(true); } });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const paneName = "maengelmelder";
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = "455";
    const layer = L.geoJSON(snapshot, {
      pane: paneName,
      pointToLayer: (feature, latlng) => {
        const color = STATUS_COLORS[String(feature.properties?.status ?? "").toLowerCase()] ?? "#a855f7";
        const icon = L.divIcon({ className: "", iconSize: [24, 24], iconAnchor: [12, 12], html: `<span style="display:block;width:20px;height:20px;border:3px solid white;border-radius:50%;background:${color};box-shadow:0 1px 5px #0009"></span>` });
        return L.marker(latlng, { pane: paneName, icon, title: `Mängelmeldung ${String(feature.properties?.id ?? "")}` });
      },
      onEachFeature: (feature, marker) => {
        const p = feature.properties as Report;
        const card = detailCard(`Mängelmeldung ${p.id}`, "Öffentlicher Mängelmelder", [p.category ? `Kategorie: ${p.category}` : "Kategorie: unbekannt", p.status ? `Status: ${p.status}` : "Status: unbekannt", p.reportedAt ? `Gemeldet: ${p.reportedAt}` : "", "Mängelmelder.de · CC BY-SA"].filter(Boolean));
        const link = document.createElement("a");
        link.href = p.url; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = "Originalmeldung öffnen";
        card.append(link);
        marker.bindPopup(card, { maxWidth: 320 });
      },
    }).addTo(map);
    const attribution = '<a href="https://www.xn--mngelmelder-l8a.de/" target="_blank" rel="noreferrer">Mängelmelder.de · CC BY-SA</a>';
    map.attributionControl?.addAttribution(attribution);
    return () => { layer.remove(); map.attributionControl?.removeAttribution(attribution); };
  }, [map, snapshot]);
  return <section className="space-y-1" aria-label="Mängelmelder">
    <strong>Mängelmelder im Ried</strong>
    <p>Öffentliche Meldungen aus dem gesamten Kartenausschnitt. Kategorien und Status werden angezeigt; Beschreibung, Adresse und Fotos werden nicht übernommen.</p>
    <p role="status">{failed ? "Mängelmeldungen derzeit nicht verfügbar." : snapshot ? `${snapshot.features.length} Meldungen · Datenstand bei letzter Erfassung.` : "Mängelmeldungen werden geladen …"}</p>
    <p><a className="underline" href="https://www.xn--mngelmelder-l8a.de/" target="_blank" rel="noreferrer">Mängelmelder.de</a> · Inhalte CC BY-SA</p>
  </section>;
}
