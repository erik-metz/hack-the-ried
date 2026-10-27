"use client";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { detailCard, placeMarker } from "@/lib/mapPresentation";
import { decodeFuel, formatFuelPrice, fuelFresh, FUEL_LABELS, type Fuel, type FuelSnapshot } from "@/lib/fuelData";

export default function MapFuelLayer({ map, clustered, onSelectStation }: { map: L.Map; clustered: boolean; onSelectStation: (id: string, fuel: Fuel) => void }) {
  const selection = useRef(onSelectStation);
  useEffect(() => { selection.current = onSelectStation; }, [onSelectStation]);
  const [snapshot, setSnapshot] = useState<FuelSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fuel: Fuel = "e10";
  const [zoom, setZoom] = useState(() => map.getZoom());
  useEffect(() => {
    const update = () => { setZoom(map.getZoom()); };
    map.on("moveend", update);
    return () => { map.off("moveend", update); };
  }, [map]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch("/api/fuel", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const data = decodeFuel(await response.json());
        if (!controller.signal.aborted) { setSnapshot(data); setNow(Date.now()); }
      } catch { /* Keep the last snapshot; freshness marks old prices. */ }
      if (!controller.signal.aborted) timer = setTimeout(load, 60_000);
    }
    void load();
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => { controller.abort(); clearTimeout(timer); clearInterval(clock); };
  }, []);
  const fresh = fuelFresh(snapshot, now);
  useEffect(() => {
    const group = (clustered ? L.markerClusterGroup({ maxClusterRadius: 65, disableClusteringAtZoom: 16, showCoverageOnHover: false,
      iconCreateFunction: cluster => L.divIcon({ html: placeMarker("fuel", String(cluster.getChildCount())), className: "map-place-icon", iconSize: [36, 36] }),
    }) : L.layerGroup()).addTo(map);
    for (const s of snapshot?.stations ?? []) {
      const status = fresh ? (s.is_open ? "Geöffnet laut Anbieter" : "Geschlossen laut Anbieter") : "Veraltet · Öffnungsstatus unbekannt";
      const label = zoom >= 15 ? `${formatFuelPrice(s[fuel])}${fresh ? "" : " · alt"}` : "";
      const marker = L.marker([s.latitude, s.longitude], { title: `${s.name} · ${status}`, alt: `${s.name} · ${status}`, keyboard: true,
        icon: L.divIcon({ html: placeMarker("fuel", label, !fresh), className: "map-place-icon", iconSize: [36, 36], iconAnchor: [18, 18] }),
      }).bindTooltip(detailCard(s.name, status, []))
        .bindPopup(detailCard(s.name, status, [s.brand, `${s.street} ${s.houseNumber}, ${s.postCode} ${s.place}`,
          ...Object.entries(FUEL_LABELS).map(([key, name]) => `${name}: ${formatFuelPrice(s[key as Fuel])}`),
          `Abgerufen: ${snapshot?.fetched_at ? new Date(snapshot.fetched_at).toLocaleString("de-DE") : "unbekannt"}`,
          "Quelle: Tankerkönig / MTS-K · CC BY 4.0",
        ]));
      marker.on("add", () => marker.getElement()?.setAttribute("aria-label", `${s.name} · ${status} · ${FUEL_LABELS[fuel]}: ${formatFuelPrice(s[fuel])}`));
      marker.on("click", () => selection.current(`fuel-${s.id}`, fuel));
      marker.addTo(group);
    }
    return () => { group.remove(); };
  }, [map, clustered, snapshot, fuel, fresh, zoom]);
  return null;
}
