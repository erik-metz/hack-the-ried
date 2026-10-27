"use client";
import L from "leaflet";
import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { CONTEXT_LAYERS, CONTEXT_REGION, contextColor, contextRows, type ContextLayerId } from "@/lib/contextLayers";
import { detailCard } from "@/lib/mapPresentation";

export default function MapContextLayer({ map, id }: { map: L.Map; id: ContextLayerId }) {
  const config = CONTEXT_LAYERS[id];
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(() => map.getZoom());
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on("zoomend", update);
    return () => { map.off("zoomend", update); };
  }, [map]);
  const visible = zoom >= config.minZoom;
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/context-layers?layer=${id}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const body = await response.json();
        if (body.type !== "FeatureCollection" || !Array.isArray(body.features)) throw new Error("Invalid response");
        if (!controller.signal.aborted) { setData(body); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
    }
    void load();
    return () => controller.abort();
  }, [id, visible, attempt]);
  useEffect(() => {
    if (!data || !visible) return;
    const paneName = `context-${id}`;
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    // Context polygons stay below station and vehicle overlays.
    pane.style.zIndex = String(id === "floodrisk" ? 330 : id === "census" ? 320 : 310);
    const renderer = L.canvas({ pane: paneName });
    const layer = L.geoJSON(data, {
      pane: paneName,
      style: feature => ({ renderer, color: contextColor(id, feature?.properties ?? {}), weight: 1, fillOpacity: .28 }),
      onEachFeature: (feature, polygon) => polygon.bindPopup(detailCard(config.title, config.note, [...contextRows(id, feature.properties ?? {}), config.attribution])),
    }).addTo(map);
    const attribution = `<a href="https://opendata-esridech.hub.arcgis.com/maps/${config.item}">${config.attribution}</a>`;
    map.attributionControl?.addAttribution(attribution);
    return () => { layer.remove(); renderer.remove(); map.attributionControl?.removeAttribution(attribution); };
  }, [map, id, data, visible, config]);
  return <section className="space-y-1 border-t border-slate-700 pt-2" aria-label={config.title}>
    <strong>{config.title}</strong>
    <p>{config.legend}</p>
    <p>{config.note}</p>
    <p>Regionaler Ausschnitt: Bürstadt, Lampertheim, Biblis und Groß-Rohrheim; Randflächen können darüber hinausreichen.</p>
    <p><a className="underline" href={`https://opendata-esridech.hub.arcgis.com/maps/${config.item}`} target="_blank" rel="noreferrer">{config.attribution}</a> · <a className="underline" href={config.license} target="_blank" rel="noreferrer">Lizenz</a> · Geometrien für die Anzeige vereinfacht.</p>
    <p role="status">{!visible ? `Anzeige ab Zoom ${config.minZoom}.` : failed ? "Quelldaten derzeit nicht vollständig verfügbar." : data ? `${data.features.length} Flächen geladen.` : "Flächen werden geladen …"}</p>
    {failed ? <button className="underline" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Erneut versuchen</button> : null}
    <button className="underline" onClick={() => { map.fitBounds([[CONTEXT_REGION[1], CONTEXT_REGION[0]], [CONTEXT_REGION[3], CONTEXT_REGION[2]]]); map.setZoom(Math.max(map.getZoom(), config.minZoom)); }}>Zum Ried-Ausschnitt</button>
  </section>;
}
