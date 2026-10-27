"use client";

import { useEffect } from "react";
import L from "leaflet";
import { acquisitionTime, inFirmsWindow, latestRasterScenes, type EarthScene, type EarthObservationMode } from "@/lib/earthObservation";

type Detection = { latitude: number; longitude: number; acquired_at: string; confidence: "l" | "n" | "h"; frp_mw: number };
const colors = { l: "#facc15", n: "#f97316", h: "#dc2626" };

export default function MapEarthObservationLayer({ map, mode }: { map: L.Map; mode: EarthObservationMode }) {
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const legend = new L.Control({ position: "bottomleft" });
    let status = "Satellitendaten werden geladen …";
    let legendElement: HTMLDivElement | undefined;
    const setStatus = (message: string) => {
      status = message;
      if (legendElement) legendElement.textContent = message;
    };
    const description = mode === "ecostress" ? "Oberflächentemperatur: −10 °C dunkelblau · 20 °C gelb · 60 °C dunkelrot"
      : mode === "firms" ? "Thermische Auffälligkeiten · keine bestätigten Brände"
      : mode === "ndvi" ? "Vegetationskontrast (NDVI): −1 niedrig · +1 hoch" : "Echtfarben · Copernicus Sentinel-2";
    legend.onAdd = () => {
      const element = L.DomUtil.create("div", "rounded bg-slate-950 p-2 text-xs text-white");
      element.setAttribute("role", "status");
      element.style.maxWidth = "min(320px, 65vw)";
      L.DomEvent.disableClickPropagation(element);
      legendElement = element;
      element.textContent = status;
      return element;
    };
    legend.addTo(map);
    let disposed = false;
    let controller: AbortController | undefined;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      group.clearLayers();
      setStatus(`${description} · Daten werden geladen …`);
      try {
        const endpoint = mode === "firms" ? "/api/firms?days=3" : mode === "ecostress" ? "/api/ecostress/scenes" : "/api/satellite/scenes";
        const response = await fetch(endpoint, { signal: request.signal, cache: "no-store" });
        if (!response.ok) throw new Error("API unavailable");
        const data = await response.json();
        if (disposed || request.signal.aborted) return;
        const now = Date.now();
        if (mode === "firms") {
          if (data.status !== "success" || !Array.isArray(data.detections)) {
            setStatus(`${description} · Daten derzeit nicht verfügbar.`);
            return;
          }
          const fetched = Date.parse(data.last_successful_fetch_at ?? "");
          if (!Number.isFinite(fetched) || fetched > now || now - fetched > 2 * 60 * 60 * 1000) {
            setStatus(`${description} · Abruf veraltet oder unbekannt.`);
            return;
          }
          for (const point of data.detections as Detection[]) {
            if (!inFirmsWindow(point.acquired_at, now) || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || !colors[point.confidence]) continue;
            const label = document.createElement("span");
            label.textContent = `Thermische Auffälligkeit · FRP ${point.frp_mw} MW · keine bestätigte Brandmeldung`;
            L.circleMarker([point.latitude, point.longitude], { radius: 6, color: colors[point.confidence], fillOpacity: 0.8 }).bindPopup(label).addTo(group);
          }
          setStatus(`${description} · Letzte 3 UTC-Kalendertage · ${group.getLayers().length} Meldungen · Abruf: ${new Date(fetched).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`);
        } else {
          if (!Array.isArray(data.scenes)) throw new Error("Invalid scene response");
          const scenes = latestRasterScenes(data.scenes as EarthScene[], mode, now);
          if (!scenes.length) {
            setStatus(`${description} · Kein auswertbares archiviertes Raster verfügbar.`);
            return;
          }
          const acquisition = acquisitionTime(scenes[0]);
          setStatus(`${description} · Letzte auswertbare Aufnahme: ${new Date(acquisition).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} · keine Liveaufnahme`);
          for (const scene of scenes) {
            const id = encodeURIComponent(scene.id);
            const url = mode === "ecostress" ? `/api/ecostress/tiles/${id}/{z}/{x}/{y}` : `/api/satellite/tiles/${id}/{z}/{x}/{y}.png?layer=${mode}`;
            const tiles = L.tileLayer(url, { maxZoom: 19, opacity: mode === "rgb" ? 1 : 0.82, bounds: [[49.54, 8.33], [49.75, 8.58]], attribution: mode === "ecostress" ? "NASA ECOSTRESS" : "ESA / Copernicus Sentinel-2" });
            tiles.on("tileerror", () => {
              if (!disposed && !request.signal.aborted) setStatus(`${description} · Aufnahme: ${acquisition.slice(0, 10)} · Einzelne Bildkacheln konnten nicht geladen werden.`);
            });
            tiles.addTo(group);
          }
        }
      } catch {
        if (!disposed && !request.signal.aborted) setStatus(`${description} · Daten konnten nicht geladen werden.`);
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer); legend.remove(); group.remove(); };
  }, [map, mode]);
  return null;
}
