"use client";

import { useEffect, useMemo, useState } from "react";
import { isFresh, type BahnSnapshot, type BahnStation } from "@/lib/bahnData";
import { boardTimeBasis, eventsForStation, fetchBahnBoard, type BahnBoard } from "@/lib/bahnBoards";

const timeLabel = (value: string) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });
export default function BahnBoards({ station, now }: { station: BahnStation; now: number }) {
  const [snapshot, setSnapshot] = useState<BahnSnapshot<BahnBoard> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    const load = () => {
      if (document.hidden) return;
      controller?.abort();
      const pending = new AbortController(); controller = pending;
      void fetchBahnBoard(pending.signal).then(result => {
        if (!disposed && !pending.signal.aborted) { setSnapshot(result); setLoaded(true); setError(null); }
      }).catch(cause => {
        if (!disposed && !pending.signal.aborted) { setLoaded(true); setError(cause instanceof Error ? cause.message : "Abruf fehlgeschlagen."); }
      });
    };
    load();
    const poll = window.setInterval(load, 60000);
    document.addEventListener("visibilitychange", load);
    return () => { disposed = true; controller?.abort(); window.clearInterval(poll); document.removeEventListener("visibilitychange", load); };
  }, []);
  const fresh = isFresh(snapshot, now);
  const events = useMemo(() => snapshot ? eventsForStation(snapshot.data, station.eva_numbers) : [], [snapshot, station.eva_numbers]);
  return <section aria-labelledby="bahn-boards-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
    <h3 id="bahn-boards-title" className="text-lg font-semibold">Zugfahrten · RIS</h3>
    <p className="text-sm text-slate-400">Ankünfte und Abfahrten mit getrennten Plan-, Prognose- und Ist-Zeiten. Die Tafel enthält Halte; sie weist keine Durchfahrten oder gemessenen Zugpositionen nach.</p>
    {!loaded && <p role="status" className="text-slate-400">RIS-Fahrten werden geladen …</p>}
    {loaded && !snapshot && !error && <p className="text-slate-400">Noch keine gesammelten RIS-Fahrten verfügbar. Die Anbindung benötigt eine freigeschaltete DB-Schnittstelle und eine bestätigte Konfiguration im Collector.</p>}
    {error && <p role="status" className="text-amber-300">{error}</p>}
    {snapshot && <p className="text-xs text-slate-400">Abgerufen: <time dateTime={snapshot.fetchedAt}>{timeLabel(snapshot.fetchedAt)}</time> · gültig bis <time dateTime={snapshot.expiresAt}>{timeLabel(snapshot.expiresAt)}</time>. Die Gültigkeit bezieht sich auf den Abruf; RIS liefert hierfür keinen separaten Beobachtungszeitpunkt.</p>}
    {snapshot && !fresh && <p role="status" className="text-amber-300">RIS-Tafel veraltet. Die letzten gespeicherten Angaben sind keine aktuelle Auskunft.</p>}
    {snapshot && fresh && !events.length && <p className="text-slate-400">Keine Zughalte für diesen Bahnhof im abgefragten Zeitfenster.</p>}
    {events.length > 0 && <div className="overflow-auto rounded-lg border border-slate-800" tabIndex={0} aria-label="RIS-Fahrttabelle">
      <table className="w-full text-left text-sm"><caption className="sr-only">Gespeicherte RIS-Zughalte für {station.name}</caption>
        <thead className="bg-slate-900 text-slate-400"><tr><th className="p-3" scope="col">Fahrt</th><th className="p-3" scope="col">Zeit</th><th className="p-3" scope="col">Gleis / Status</th></tr></thead>
        <tbody>{events.map(event => <tr key={JSON.stringify([event.journey_id, event.event_id, event.eva_number, event.event_type])} className="border-t border-slate-800">
          <td className="p-3 align-top"><p className="font-medium">{event.description}</p><p className="text-xs text-slate-400">{event.event_type === "arrival" ? "Ankunft aus" : "Abfahrt nach"} {event.direction ?? "Richtung nicht gemeldet"}</p>
            <details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer">Fahrtkennung &amp; Zuordnung</summary>
              <p className="mt-2 break-all">RIS-Fahrt: {event.journey_id}</p><p className="break-all">Ereignis: {event.event_id} · EVA {event.eva_number}</p>
              {event.gtfs_link.status === "matched" ? <p className="mt-2 break-all">Explizit mit GTFS verknüpft: {event.gtfs_link.schedule_source} / {event.gtfs_link.trip_id} · Betriebstag {event.gtfs_link.service_date}</p>
                : <p className="mt-2">Keine bestätigte GTFS-Fahrtzuordnung{event.gtfs_link.status === "schedule_mismatch" ? " (Planangaben stimmen nicht überein)" : event.gtfs_link.status === "schedule_missing" ? " (Fahrplaninstanz fehlt)" : ""}.</p>}
            </details>
          </td>
          <td className="p-3 align-top whitespace-nowrap"><p>Plan: <time dateTime={event.scheduled_at}>{timeLabel(event.scheduled_at)}</time></p>
            <p className="text-xs text-slate-400">{boardTimeBasis(event)}: <time dateTime={event.time}>{timeLabel(event.time)}</time></p>
            {event.delay_seconds !== null && <p className="text-xs text-slate-400">Abweichung: {event.delay_seconds > 0 ? "+" : ""}{(event.delay_seconds / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} min</p>}
          </td>
          <td className="p-3 align-top"><p>{event.platform || "Nicht gemeldet"}</p><p className={event.cancelled || !fresh ? "text-amber-300" : "text-slate-400"}>{!fresh ? "Veraltet · " : ""}{event.cancelled ? "Halt entfällt" : "Kein Haltausfall gemeldet"}</p></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <p className="text-xs text-slate-500">Quelle: <a href="https://developers.deutschebahn.com/db-api-marketplace/apis/product/ris-boards-netz" target="_blank" rel="noopener noreferrer" className="underline">DB RIS::Boards</a> · Nutzungsrechte gemäß freigeschaltetem Produkt.</p>
  </section>;
}
