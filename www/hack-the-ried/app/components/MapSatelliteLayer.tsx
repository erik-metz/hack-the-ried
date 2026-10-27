"use client";
import L from "leaflet";
import { updateMarkerDialogs } from "@/lib/mapDialogs";
import { useEffect, useRef, useState } from "react";
import { detailCard, placeMarker } from "@/lib/mapPresentation";
import { decodeSatellites, satelliteDetails, satelliteFresh, SATELLITE_FRESH_MS, type SatelliteSnapshot } from "@/lib/satelliteData";

export default function MapSatelliteLayer({ map, clustered }: { map: L.Map; clustered: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<SatelliteSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(0);
  const markers = useRef(new Map<string, L.Marker>());
  const group = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    const registry = markers.current;
    const layer = (clustered ? L.markerClusterGroup({
      maxClusterRadius: 65, disableClusteringAtZoom: 16, showCoverageOnHover: false,
      iconCreateFunction: cluster => L.divIcon({ html: placeMarker("satellites", String(cluster.getChildCount())),
        className: "map-place-icon", iconSize: [36, 36], iconAnchor: [18, 18] }),
    }) : L.layerGroup()).addTo(map);
    group.current = layer;
    return () => { layer.remove(); registry.clear(); group.current = null; };
  }, [map, clustered]);
  useEffect(() => {
    const stream = new EventSource("/api/satellites/stream");
    const controller = new AbortController();
    let lastEvent = 0, lastStamp = 0;
    const accept = (body: unknown) => {
      const data = decodeSatellites(body);
      const stamp = Date.parse(data.timestamp);
      if (stamp < lastStamp) return;
      lastStamp = stamp; lastEvent = Date.now();
      setSnapshot(data); setNow(Date.now()); setFailed(false);
    };
    stream.onmessage = event => {
      try { accept(JSON.parse(event.data)); } catch { setFailed(true); }
    };
    stream.onerror = () => setFailed(true);
    async function fallback() {
      if (Date.now()-lastEvent < SATELLITE_FRESH_MS) return;
      try {
        const response = await fetch("/api/satellites", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json(); if (!controller.signal.aborted) accept(data);
      } catch { if (!controller.signal.aborted) { setFailed(true); setSnapshot(null); } }
    }
    void fallback();
    const freshnessTimer = setInterval(() => setNow(Date.now()), 1000);
    const timer = setInterval(() => { if (!document.hidden) void fallback(); }, SATELLITE_FRESH_MS);
    return () => { stream.close(); controller.abort(); clearInterval(timer); clearInterval(freshnessTimer); };
  }, [map]);
  useEffect(() => {
    const layer = group.current;
    if (!layer) return;
    const positions = snapshot?.positions.filter(p => satelliteFresh(p, now)) ?? [];
    const retained = new Set(positions.map(p => p.id));
    for (const [id, marker] of markers.current) if (!retained.has(id)) { layer.removeLayer(marker); markers.current.delete(id); }
    const motions: { marker: L.Marker; from: L.LatLng; to: L.LatLng }[] = [];
    for (const p of positions) {
      let marker = markers.current.get(p.id);
      if (!marker) {
        marker = L.marker([p.latitude, p.longitude], { alt: `Satellit ${p.name} · berechnet`, keyboard: true,
          icon: L.divIcon({ html: placeMarker("satellites", p.name, true), className: "map-place-icon", iconSize: [36, 36], iconAnchor: [18, 18] }),
        }).addTo(layer);
        markers.current.set(p.id, marker);
      }
      const from = marker.getLatLng(), to = L.latLng(p.latitude, p.longitude);
      if (!clustered && Math.abs(from.lng-to.lng) < 180 && from.distanceTo(to) < 100000) motions.push({ marker, from, to });
      else marker.setLatLng(to);
      const popup = detailCard(`🛰 ${p.name}`, "Berechnete Satellitenposition", satelliteDetails(p));
      const tooltip = detailCard(p.name, `${p.altitude_km.toFixed(0)} km · berechnet`, []);
      updateMarkerDialogs(marker, popup, tooltip);
    }
    const updateVisible = () => setVisible(positions.filter(p => map.getBounds().contains([p.latitude, p.longitude])).length);
    updateVisible(); map.on("moveend", updateVisible);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let frame = 0;
    const animate = (time: number) => {
      const fraction = reduced ? 1 : Math.min(1, (time-started)/900);
      for (const { marker, from, to } of motions) marker.setLatLng([from.lat+(to.lat-from.lat)*fraction, from.lng+(to.lng-from.lng)*fraction]);
      if (fraction < 1 && !document.hidden) frame = requestAnimationFrame(animate);
    };
    if (motions.length) frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); map.off("moveend", updateVisible); };
  }, [map, snapshot, now, clustered]);
  const fresh = snapshot && Date.parse(snapshot.timestamp)+SATELLITE_FRESH_MS > now;
  return <p role="status">🛰 {failed || !fresh || !snapshot.available ? "Satellitendaten derzeit nicht verfügbar." : visible ? `${visible} berechnete Satelliten-Bodenpositionen im Kartenausschnitt.` : "Zurzeit keine Satelliten-Bodenposition im Kartenausschnitt."}
    {fresh && snapshot.catalog_count > 0 ? ` ${snapshot.catalog_count.toLocaleString("de-DE")} Satelliten mit Bahndaten erfasst.` : ""}
    {fresh && snapshot.last_import ? ` Letzter Import: ${new Date(snapshot.last_import).toLocaleString("de-DE")}.` : ""}</p>;
}
