"use client";
import L from "leaflet";
import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { detailCard } from "@/lib/mapPresentation";
import { publicMapDataUrl } from "@/lib/publicMapData";

type Report = { id?: string; category?: string | null; status?: string | null; reportedAt?: string | null; url?: string };
type ReportDetails = { id: string; category: string | null; status: string | null; reportedAt: string | null; description: string | null; images: { preview: string; original: string }[] };
type Snapshot = FeatureCollection & { source?: string; license?: string; attribution?: string };
const STATUS_COLORS: Record<string, string> = { open: "#f97316", checked: "#eab308", approved: "#3b82f6", solved: "#22c55e", closed: "#64748b" };

export default function MapMaengelmelderLayer({ map }: { map: L.Map }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(publicMapDataUrl("maengelmelder"), { signal: controller.signal, cache: "no-store" })
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
        const reportId = p.id ?? String(feature.id ?? "");
        const card = detailCard(`Mängelmeldung ${reportId}`, "Öffentlicher Mängelmelder", ["Mängelmelder.de · CC BY-SA"]);
        const detail = document.createElement("div");
        detail.className = "mt-2 space-y-2";
        const loading = document.createElement("p");
        loading.textContent = "Beschreibung und Fotos werden geladen …";
        detail.append(loading);
        card.append(detail);
        const link = document.createElement("a");
        link.href = p.url ?? `https://www.xn--mngelmelder-l8a.de/bms/${encodeURIComponent(reportId)}`; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = "Originalmeldung öffnen";
        card.append(link);
        marker.bindPopup(card, { maxWidth: 320 });
        let loaded = false;
        let pending = false;
        marker.on("popupopen", () => {
          if (loaded || pending) return;
          pending = true;
          fetch(`/api/maengelmelder/${encodeURIComponent(reportId)}`)
            .then(response => { if (!response.ok) throw new Error("Details nicht verfügbar"); return response.json() as Promise<ReportDetails>; })
            .then(report => {
              detail.replaceChildren();
              const rows = [
                report.category ? `Kategorie: ${report.category}` : "",
                report.status ? `Status: ${report.status}` : "",
                report.reportedAt ? `Gemeldet: ${new Date(report.reportedAt).toLocaleString("de-DE")}` : "",
              ].filter(Boolean);
              for (const value of rows) {
                const row = document.createElement("p");
                row.textContent = value;
                detail.append(row);
              }
              if (report.description?.trim()) {
                const description = document.createElement("p");
                description.className = "whitespace-pre-wrap break-words";
                description.textContent = report.description;
                detail.append(description);
              }
              for (const photo of report.images ?? []) {
                const anchor = document.createElement("a");
                anchor.href = photo.original; anchor.target = "_blank"; anchor.rel = "noreferrer";
                const image = document.createElement("img");
                image.src = photo.preview; image.alt = `Foto zu Mängelmeldung ${reportId}`; image.loading = "lazy";
                image.className = "max-h-56 w-full rounded object-contain";
                anchor.append(image);
                detail.append(anchor);
              }
              if (!detail.childElementCount) {
                const empty = document.createElement("p");
                empty.textContent = "Für diese Meldung sind keine Beschreibung oder Fotos veröffentlicht.";
                detail.append(empty);
              }
              loaded = true;
            })
            .catch(() => { loading.textContent = "Meldungsdetails derzeit nicht verfügbar. Bitte Originalmeldung öffnen."; })
            .finally(() => { pending = false; });
        });
      },
    }).addTo(map);
    const attribution = '<a href="https://www.xn--mngelmelder-l8a.de/" target="_blank" rel="noreferrer">Mängelmelder.de · CC BY-SA</a>';
    map.attributionControl?.addAttribution(attribution);
    return () => { layer.remove(); map.attributionControl?.removeAttribution(attribution); };
  }, [map, snapshot]);
  return <section className="space-y-1" aria-label="Mängelmelder">
    <strong>Mängelmelder · Worms bis nördlich Darmstadt</strong>
    <p>Öffentliche Meldungen aus Worms, dem Hessischen Ried und dem Raum Darmstadt. Beschreibung und öffentliche Fotos erscheinen beim Öffnen einer Meldung.</p>
    <p role="status">{failed ? "Mängelmeldungen derzeit nicht verfügbar." : snapshot ? `${snapshot.features.length} Meldungen · Datenstand bei letzter Erfassung.` : "Mängelmeldungen werden geladen …"}</p>
    <p><a className="underline" href="https://www.xn--mngelmelder-l8a.de/" target="_blank" rel="noreferrer">Mängelmelder.de</a> · Inhalte CC BY-SA</p>
  </section>;
}
