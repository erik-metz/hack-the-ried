"use client";
import L from "leaflet";
import { useEffect, useState } from "react";
import { restAreaFresh, restAreaRows, restAreaMatch, type AutobahnRestArea } from "@/lib/autobahnRestAreas";
import { CATEGORIES, type SensorNode } from "@/lib/mapData";
import { createMarkerContent } from "@/lib/mapMarker";
import { detailCard } from "@/lib/mapPresentation";

export default function MapRestAreaLayer({ map, nodes }: { map: L.Map; nodes: SensorNode[] }) {
  const [snapshot, setSnapshot] = useState<{ areas: AutobahnRestArea[]; unavailableRoads: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch("/api/autobahn-rest-areas", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (!Array.isArray(data.areas) || !Array.isArray(data.unavailableRoads)) throw new Error("Invalid inventory");
        if (!controller.signal.aborted) { setSnapshot(data); setFailed(false); }
      } catch { if (!controller.signal.aborted) { setSnapshot(null); setFailed(true); } }
      if (!controller.signal.aborted) timer = setTimeout(load, 300_000);
    }
    void load();
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => { controller.abort(); clearTimeout(timer); clearInterval(clock); };
  }, []);
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    for (const area of snapshot?.areas ?? []) {
      if (!restAreaFresh(area, now) || restAreaMatch(area, nodes)) continue;
      const icon = createMarkerContent("parking", CATEGORIES.parking.color, false);
      L.marker([area.lat, area.lng], { title: `Autobahn-Inventar · ${area.name}`, alt: `Autobahn-Inventar · ${area.name}`, keyboard: true, icon: L.divIcon({ html:icon,className:"map-sensor-icon",iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-18] }) })
        .bindPopup(detailCard(area.name, `${area.road} · Rastplatzinventar und Belegung`, restAreaRows(area,nodes,now)), { maxWidth:360,maxHeight:320 }).addTo(group);
    }
    const attribution = '<a href="https://verkehr.autobahn.de/">Autobahn GmbH · Rastplatzinventar</a>';
    map.attributionControl?.addAttribution(attribution);
    return () => { group.remove(); map.attributionControl?.removeAttribution(attribution); };
  }, [map, nodes, snapshot, now]);
  const areas = snapshot?.areas.filter(a => restAreaFresh(a,now)) ?? [];
  return <details className="rounded border border-slate-700 p-2">
    <summary>Autobahn-Rastplätze · {areas.length} Inventareinträge</summary>
    <p>Lila P: Parkplatz. Bei identischer DATEX-Kennung wird nur der vorhandene Belegungsmarker angezeigt; zusätzliche Inventarangaben stehen in dieser Liste. LKW-Belegung aus rast-monitor nur bei eindeutiger Kennung; spätestens nach 30 Minuten als veraltet behandelt.</p>
    {failed ? <p role="status">Rastplatzinventar derzeit nicht verfügbar.</p> : null}
    {snapshot?.unavailableRoads.length ? <p role="status">Inventar fehlt: {snapshot.unavailableRoads.join(", ")}</p> : null}
    {snapshot && !areas.length && !failed ? <p>Keine aktuellen Inventareinträge verfügbar.</p> : null}
    <ul>{areas.map(area => <li key={area.id} className="mt-2"><button className="underline" onClick={() => map.setView([area.lat,area.lng],16)}>{area.road} · {area.name}</button><ul>{restAreaRows(area,nodes,now).map((row,i) => <li key={i}>{row}</li>)}</ul></li>)}</ul>
  </details>;
}
