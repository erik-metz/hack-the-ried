"use client";

import { useEffect, useMemo, useState } from "react";
import { objectLocations, osmLocation, type BahnStation } from "@/lib/bahnData";
import { fetchSensorInventory, sensorCandidates, type SensorInventory } from "@/lib/bahnSensors";

export default function BahnSensors({ station, stations, fresh, now, onSelect }: {
  station: BahnStation; stations: BahnStation[]; fresh: boolean; now: number; onSelect: (id: string) => void;
}) {
  const [inventory, setInventory] = useState<SensorInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radius, setRadius] = useState(500);
  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    const load = () => {
      if (document.hidden) return;
      controller?.abort();
      const pending = new AbortController(); controller = pending;
      void fetchSensorInventory(pending.signal).then(data => {
        if (!disposed && !pending.signal.aborted) { setInventory(data); setError(null); }
      }).catch(cause => {
        if (!disposed && !pending.signal.aborted) setError(cause instanceof Error ? cause.message : "Abruf fehlgeschlagen.");
      });
    };
    load();
    const poll = window.setInterval(load, 60000);
    document.addEventListener("visibilitychange", load);
    return () => { disposed = true; controller?.abort(); window.clearInterval(poll); document.removeEventListener("visibilitychange", load); };
  }, []);
  const located = [station, ...station.components].some(object => objectLocations(station, object).length > 0);
  const sensorsFresh = inventory !== null && now - Date.parse(inventory.generatedAt) < 300000;
  const candidates = useMemo(() => fresh && sensorsFresh && inventory
    ? sensorCandidates(stations, station.id, inventory.sensors, radius) : [], [fresh, sensorsFresh, inventory, stations, station.id, radius]);
  return <section aria-labelledby="bahn-sensors-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <h3 id="bahn-sensors-title" className="text-lg font-semibold">Sensor- und Datenstandorte im Bahnhofsumfeld</h3>
      <label className="text-sm text-slate-300">Suchradius <select aria-label="Sensor-Suchradius" value={radius} onChange={event => setRadius(Number(event.target.value))} className="ml-2 rounded-lg border border-slate-600 bg-slate-950 p-2">
        <option value={100}>100 m</option><option value={500}>500 m</option><option value={1000}>1.000 m</option>
      </select></label>
    </div>
    <p className="text-sm text-slate-400">Die Entfernung bezieht sich auf die nächstgelegene gemeldete Infrastrukturposition. Räumliche Nähe ist ein Zuordnungsvorschlag und belegt keine Zugehörigkeit zum Bahnhof oder Ursache von Messwerten.</p>
    {inventory && <p className="text-xs text-slate-400">Sensorinventar: <time dateTime={inventory.generatedAt}>{new Date(inventory.generatedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</time> · {inventory.unlocated} Standorte ohne gültige Koordinaten werden nicht zugeordnet.</p>}
    {error && <p role="status" className="text-amber-300">{error}</p>}
    {!inventory && !error && <p role="status" className="text-slate-400">Sensorstandorte werden geladen …</p>}
    {!fresh && <p className="text-amber-300">Die Bahnhofsinfrastruktur ist veraltet; räumliche Vorschläge sind pausiert.</p>}
    {!located && <p className="text-slate-400">Ohne gemeldete Infrastrukturposition ist für diesen Bahnhof keine räumliche Sensorzuordnung möglich.</p>}
    {inventory && !sensorsFresh && <p className="text-amber-300">Das Sensorinventar ist veraltet; räumliche Vorschläge sind pausiert.</p>}
    {fresh && sensorsFresh && located && !candidates.length && <p className="text-slate-400">Keine Sensor- oder Datenstandorte im gewählten Radius gefunden.</p>}
    <div className="space-y-3">{candidates.map(candidate => <article key={candidate.sensor.id} className="rounded-xl border border-slate-700 p-4 space-y-2">
      <h4 className="font-medium">{candidate.sensor.name}</h4>
      <p className="text-sm text-emerald-300">{Math.round(candidate.distanceMeters)} m Luftlinie · räumlicher Vorschlag</p>
      <p className="text-xs text-slate-400">Bezug: <button className="text-emerald-300 underline" type="button" onClick={() => onSelect(candidate.referenceObjectId)}>{candidate.referenceName}</button></p>
      {candidate.stationIds.length > 1 && <p className="text-xs text-amber-300">Mehrdeutig: Dieser Standort liegt im Radius mehrerer erfasster Bahnhöfe.</p>}
      <a href={osmLocation(candidate.sensor.latitude, candidate.sensor.longitude)} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-300 underline">Sensorposition auf OpenStreetMap</a>
      <details className="text-xs text-slate-400"><summary className="cursor-pointer">Messwerte &amp; Sensorkennung</summary>
        <p className="mt-2 break-all">{candidate.sensor.id}</p>
        <p className="my-2">Zuletzt gespeicherte Einzelwerte mit eigenem Zeitstempel:</p>
        {candidate.sensor.readings.length ? <ul className="space-y-1">{candidate.sensor.readings.map(reading => <li key={`${reading.metric}/${reading.unit}`}>
          {reading.metric}: {reading.value} {reading.unit} · <time dateTime={reading.timestamp}>{new Date(reading.timestamp).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</time>
        </li>)}</ul> : <p>Keine Messwerte verfügbar.</p>}
      </details>
    </article>)}</div>
  </section>;
}
