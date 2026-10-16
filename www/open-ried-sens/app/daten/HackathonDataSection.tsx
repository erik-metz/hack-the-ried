"use client";

import { useEffect, useRef, useState } from "react";

const inputClass = "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-400";
const buttonClass = "rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400";

export default function HackathonDataSection() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const startDateInput = useRef<HTMLInputElement>(null);
  const endDateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const today = new Date();
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    if (endDateInput.current) endDateInput.current.value = end.toISOString().slice(0, 10);
    if (startDateInput.current) startDateInput.current.value = start.toISOString().slice(0, 10);
  }, []);

  async function download(params: URLSearchParams) {
    setBusy(true);
    setMessage("");
    try {
      const validation = new URLSearchParams(params);
      validation.set("check", "1");
      const response = await fetch(`/api/data-download?${validation}`, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Download fehlgeschlagen.");
      }
      const link = document.createElement("a");
      link.href = `/api/data-download?${params}`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMessage("Der Download wurde gestartet. Den Fortschritt findest du in den Downloads deines Browsers.");
    } catch (error) {
      setMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Der Download dauert zu lange. Bitte einen kürzeren Zeitraum wählen oder erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="datasets" className="space-y-5">
      <h2 className="text-2xl sm:text-3xl font-bold">Daten herunterladen</h2>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Mit einer Stichprobe starten</h3>
          <p className="max-w-2xl text-sm text-slate-300">Drei zusammengehörige CSV-Dateien: Messpunkte, Messgrößen und Messwerte. Mit IDs zum Verknüpfen und einer kurzen Anleitung im ZIP.</p>
          <p className="text-xs text-slate-400">Bis zu 300 Messgrößen mit je einem zuletzt gespeicherten Wert. Eine Stichprobe, kein vollständiger Datenbestand.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void download(new URLSearchParams({ sample: "1" }))} className={`${buttonClass} shrink-0 bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>Stichprobe laden (ZIP)</button>
      </div>
      <form onSubmit={event => {
        event.preventDefault();
        const params = new URLSearchParams();
        new FormData(event.currentTarget).forEach((value, key) => params.set(key, String(value)));
        void download(params);
      }} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Thema &amp; Zeitraum wählen</h3>
          <p className="text-sm text-slate-300">Öffentliche Daten des gewählten Themas aus dem Drei-Tabellen-Bestand gemeinsam herunterladen.</p>
        </div>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">
          <legend className="sr-only">Export auswählen</legend>
          <label className="text-sm font-medium">Thema
            <select name="topic" className={inputClass}>
              <option value="all">Alle Themen</option>
              <option value="temperature">Temperatur aller Messpunkte</option>
              <option value="humidity">Luftfeuchtigkeit</option>
              <option value="precipitation">Niederschlag</option>
              <option value="water">Wasserstände &amp; Abfluss</option>
              <option value="soil">Bodenfeuchte &amp; Bodentemperatur</option>
              <option value="mobility">Mobilität &amp; Verkehr</option>
              <option value="roadworks">Baustellen &amp; Sperrungen</option>
            </select>
          </label>
          <label className="text-sm font-medium">Von (UTC)
            <input ref={startDateInput} type="date" name="start" required className={inputClass} />
          </label>
          <label className="text-sm font-medium">Bis (UTC, einschließlich)
            <input ref={endDateInput} type="date" name="end" required className={inputClass} />
          </label>
        </fieldset>
        <p className="text-xs text-slate-400">Bis zu 31 Tage pro Export, ohne Zeilenlimit. Baustellen und Sperrungen enthalten gespeicherte Meldungen, deren Gültigkeit den Zeitraum überlappt.</p>
        <button type="submit" disabled={busy} className={`${buttonClass} border border-slate-700 text-emerald-300 hover:bg-slate-800`}>Auswahl laden (ZIP)</button>
      </form>
      <p role="status" aria-live="polite" className="text-sm text-slate-300">{busy ? "Auswahl wird geprüft …" : message}</p>
      <p className="text-sm text-slate-400">Für den Hackathon: Ein Paket für den gewünschten Zeitraum laden und gemeinsam im lokalen Netzwerk bereitstellen. Langfristige Sensordaten findest du in den Sensorarchiven.</p>
    </section>
  );
}
