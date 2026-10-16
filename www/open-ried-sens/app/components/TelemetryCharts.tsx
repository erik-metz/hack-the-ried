"use client";

import { useEffect, useState } from "react";
import { hasCoordinates, parkingSummary, bikeSummary, type StationNode } from "@/lib/mapData";
import { seriesKey, metricLabel, unitLabel, mergeReadings, crossingStateLabel } from "@/lib/telemetryData";
import { Activity } from "lucide-react";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";

type Reading = { metric: string; unit: string; value: number; timestamp: string };
type Bucket = { metric: string; unit: string; bucket: string; avg_value: number | null };
type Telemetry = { readings: Reading[]; history: Bucket[]; start: string; end: string; historyMode?: string; historyUnavailable?: boolean; historyTruncated?: boolean };
const number = (value: number, unit?: string) => value.toLocaleString("de-DE", { minimumFractionDigits: unit === "€/l" ? 3 : 0, maximumFractionDigits: unit === "€/l" ? 3 : 2 });
const time = (value: string) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function TelemetryCharts({
  node,
  nodes,
  onSelectNode,
  selectedMetric,
  onSelectMetric,
}: {
  node: StationNode;
  nodes: StationNode[];
  onSelectNode: (id: string) => void;
  selectedMetric?: string;
  onSelectMetric?: (metric: string) => void;
}) {
  const [data, setData] = useState<Telemetry | null>(null);
  const [error, setError] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState(selectedMetric ?? "");

  useEffect(() => {
    if (selectedMetric !== undefined && selectedMetric !== selectedSeries) {
      setSelectedSeries(selectedMetric);
    }
  }, [selectedMetric]);
  const mobilityEntity = node.id.startsWith("movement:") || node.id.startsWith("crossing:");
  const barrierEntity = node.id.startsWith("crossing:");
  const fuelEntity = node.id.startsWith("fuel-");
  const snapshots = fuelEntity || node.categories.some(c => c === "parking" || c === "traffic" || c === "bikes");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(`/api/telemetry?${new URLSearchParams({ sensor_id: node.id, history_mode: snapshots ? "snapshots" : "averages" })}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Telemetry unavailable");
        const result: Telemetry = await response.json();
        if (!controller.signal.aborted) { setData(result); setError(false); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, mobilityEntity ? 10000 : 30000);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [node.id, snapshots, mobilityEntity]);

  const readings = mobilityEntity ? (error ? [] : (data?.readings ?? node.readings).filter(r => Date.parse(r.timestamp) + 30000 > Date.now())) : node.isAggregate ? node.readings : mergeReadings(node.readings, data?.readings ?? []);
  const parking = parkingSummary(readings);
  const bikes = bikeSummary(readings);
  const active = readings.find(reading => seriesKey(reading) === selectedSeries) ?? (mobilityEntity ? readings.find(r => r.metric === "crossing_state" || r.metric === "speed") : undefined) ?? readings[0] ?? (mobilityEntity && data?.history.length ? { metric: data.history[0].metric, unit: data.history[0].unit, value: 0, timestamp: data.history[0].bucket } : undefined);
  const history = active ? (data?.history ?? []).filter(bucket => seriesKey(bucket) === seriesKey(active) && bucket.avg_value !== null).sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket)) : [];
  const values = history.map(bucket => bucket.avg_value!);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const padding = (max - min) * 0.1 || (fuelEntity ? 0.005 : Math.max(Math.abs(max) * 0.05, 1));
  const lower = active?.metric === "crossing_state" ? 0 : min - padding;
  const upper = active?.metric === "crossing_state" ? 2 : max + padding;
  const start = data ? Date.parse(data.start) : 0;
  const end = data ? Date.parse(data.end) : 1;
  const points = history.map(bucket => ({
    x: 130 + Math.max(0, Math.min(1, (Date.parse(bucket.bucket) - start) / (end - start))) * 655,
    y: 180 - ((bucket.avg_value! - lower) / (upper - lower)) * 155,
    bucket,
  }));
  const path = points.map((point, index) => {
    const previous = points[index - 1];
    const interrupted = (fuelEntity && previous && Date.parse(point.bucket.bucket)-Date.parse(previous.bucket.bucket)>20*60*1000) || (barrierEntity && previous && (data?.history ?? []).some(b => b.avg_value === null && Date.parse(b.bucket)>Date.parse(previous.bucket.bucket) && Date.parse(b.bucket)<Date.parse(point.bucket.bucket)));
    return !previous || interrupted ? `M ${point.x} ${point.y}` : (barrierEntity || fuelEntity) ? `H ${point.x} V ${point.y}` : `L ${point.x} ${point.y}`;
  }).join(" ");

  return (
    <section id="messwerte" className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6 space-y-6">
      <div className="grid gap-5 lg:grid-cols-2 border-b border-slate-800 pb-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold"><Activity className="size-5 text-emerald-400" /> Messwerte & Zeitverlauf</h3>
          <p className="mt-2 text-sm text-slate-300">{node.name}</p>
          {mobilityEntity && <p className="mt-2 text-xs text-amber-200">{node.address} · Aktualisierung alle 10 Sekunden</p>}
          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer">Stationsdetails</summary>
            <p className="mt-2 break-all">{node.id} · {hasCoordinates(node) ? `${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}` : "Keine Kartenposition gemeldet"}</p>
            <p className="mt-2 break-words">{node.address}</p>
          </details>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs uppercase tracking-wider font-semibold text-emerald-400">Alle Stationen · unabhängig vom Kartenfilter</p>
          <Combobox items={nodes} value={node} itemToStringLabel={item => item.name} itemToStringValue={item => item.id} onValueChange={item => { if (item) onSelectNode(item.id); }} autoHighlight>
            <ComboboxInput aria-label="Station auswählen" placeholder="Standort suchen…" className="w-full border-slate-700 bg-slate-950 text-slate-100" />
            <ComboboxContent className="border-slate-700 bg-slate-900 text-slate-100">
              <ComboboxEmpty>Kein Standort gefunden</ComboboxEmpty>
              <ComboboxList>{item => <ComboboxItem key={item.id} value={item} className="whitespace-normal">{item.name}</ComboboxItem>}</ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>
      <div aria-live="polite">
        {error ? <p role="alert" className="text-amber-300">Messdaten konnten nicht aktualisiert werden. {data ? mobilityEntity ? "Der aktuelle Zustand ist unbekannt; der gespeicherte Verlauf bleibt sichtbar." : "Die zuletzt geladenen Werte bleiben sichtbar." : "Bitte später erneut versuchen."}</p> : !data ? <p className="text-slate-400">Messdaten werden geladen…</p> : readings.length === 0 ? <p className="text-slate-400">Für diese Station sind noch keine Messwerte gespeichert.</p> : null}
      </div>
      {parking && <div className="rounded-xl border border-violet-400/40 bg-violet-950/20 p-4">
        <p className="text-xl font-bold">{parking.summary}</p>
        {parking.details.map(detail => <p key={detail} className="mt-1 text-sm text-slate-300">{detail}</p>)}
        <p className="mt-2 text-xs text-slate-400">Zuletzt gemeldeter Zustand; Messzeitpunkte stehen bei den einzelnen Werten.</p>
      </div>}
      {bikes && <div className="rounded-xl border border-sky-400/40 bg-sky-950/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xl font-bold">{bikes.summary}</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              bikes.isEmpty
                ? "bg-red-500/20 text-red-400 border border-red-500"
                : bikes.isFull
                ? "bg-amber-500/20 text-amber-400 border border-amber-500"
                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500"
            }`}>
              {bikes.isEmpty ? "Keine Räder" : bikes.isFull ? "Station voll (Rückgabe blockiert)" : "Ausleihe & Rückgabe möglich"}
            </span>
          </div>
          <a
            href="https://www.nextbike.de/de/lampertheim/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors"
          >
            In Nextbike-App öffnen ↗
          </a>
        </div>
        {bikes.details.map(detail => <p key={detail} className="text-sm text-slate-300">{detail}</p>)}
        <p className="text-xs text-slate-400">Offizielle VRNnextbike Live-Verfügbarkeit · Messzeitpunkte stehen bei den einzelnen Werten.</p>
      </div>}

      {(barrierEntity || node.id.startsWith("bu-") || readings.some(r => r.metric.startsWith("crossing_"))) && (() => {
        const currentCrossingState = readings.find(r => r.metric === "crossing_state")?.value;
        return (
          <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xl font-bold">Bahnübergang Status & Zeitverlauf</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                currentCrossingState === undefined ? "bg-slate-500/20 text-slate-300 border border-slate-500" : currentCrossingState >= 2
                  ? "bg-red-500/20 text-red-400 border border-red-500"
                  : currentCrossingState >= 1
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500"
                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500"
              }`}>
                {currentCrossingState === undefined ? "Status unbekannt" : crossingStateLabel(currentCrossingState)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-300">{node.address || "Aktiver Schienenübergang im Hessischen Ried"}</p>
            <p className="mt-2 text-xs text-slate-400">Statusverlauf der letzten 24 Stunden. 0 = Offen (Frei), 1 = Vorwarnung (Schließt bald), 2 = Schranken geschlossen.</p>
          </div>
        );
      })()}
      {(readings.length > 0 || (mobilityEntity && active)) && <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {readings.map(reading => <button key={seriesKey(reading)} type="button" aria-pressed={seriesKey(reading) === (active && seriesKey(active))} onClick={() => {
            const k = seriesKey(reading);
            setSelectedSeries(k);
            onSelectMetric?.(k);
          }} className="min-w-0 text-left rounded-xl border border-slate-700 bg-slate-950/60 p-4 aria-pressed:border-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400">
            <span className="block text-sm text-slate-400">{metricLabel(reading)}</span>
            <span className="block mt-2 text-2xl font-bold break-words">
              {reading.metric === "crossing_state" ? (
                crossingStateLabel(reading.value)
              ) : (
                <>
                  {number(reading.value, reading.unit)} <span className="text-sm font-normal text-slate-400">{unitLabel(reading.unit)}</span>
                </>
              )}
            </span>
            <span className="block mt-2 text-xs text-slate-500">Stand: {time(reading.timestamp)}</span>
          </button>)}
        </div>
        {active && <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <h4 className="font-semibold">{metricLabel(active)} · {unitLabel(active.unit)}</h4>
          <p className="text-xs text-slate-400 mt-1">Letzte 24 Stunden · {barrierEntity ? "Gespeicherte Zustandsprognosen" : snapshots && !mobilityEntity ? "Gespeicherte Quellmeldungen" : "5-Minuten-Mittelwerte"} · Uhrzeit Europe/Berlin</p>
          {fuelEntity && <p className="mt-2 text-xs text-slate-400">Gemeldete Preise in €/l. Zeitpunkte sind Abrufzeiten, keine exakten Preisänderungszeiten. Historie ab Beginn der Preiserfassung; Datenlücken werden nicht verbunden.</p>}
          {active.metric.startsWith("traffic_") && <p className="mt-2 text-xs text-amber-200">Stunden-/Tagessummen der Quelle, keine einzelnen Verkehrserfassungen. Aufeinanderfolgende Meldungen werden nicht addiert. Exakte Intervallgrenzen meldet die Quelle nicht.</p>}
          {data?.historyUnavailable && <p role="status" className="mt-2 text-sm text-amber-200">Der Zeitverlauf konnte nicht geladen werden. Aktuelle Werte bleiben sichtbar.</p>}
          {data?.historyTruncated && <p className="mt-2 text-sm text-amber-200">Der Verlauf ist auf die neuesten verfügbaren Meldungen dieses Zeitraums begrenzt.</p>}
          {history.length === 0 ? <p className="py-10 text-center text-slate-400">Keine Messwerte in den letzten 24 Stunden.</p> : <>
            <svg viewBox="0 0 800 210" role="img" aria-label={`${metricLabel(active)} in ${unitLabel(active.unit)}, letzte 24 Stunden`} className="w-full mt-5">
              {active.metric === "crossing_state" ? (
                [0, 1, 2].map((stateVal, idx) => (
                  <g key={idx}>
                    <line x1="130" x2="785" y1={180 - idx * 77.5} y2={180 - idx * 77.5} stroke="#334155" strokeDasharray="4 4" />
                    <text x="122" y={184 - idx * 77.5} textAnchor="end" fill="#94a3b8" fontSize="11">
                      {stateVal === 2 ? "Geschlossen" : stateVal === 1 ? "Schließt bald" : "Offen"}
                    </text>
                  </g>
                ))
              ) : (
                [lower, (lower + upper) / 2, upper].map((value, index) => <g key={index}>
                  <line x1="130" x2="785" y1={180 - index * 77.5} y2={180 - index * 77.5} stroke="#334155" strokeDasharray="4 4" />
                  <text x="122" y={184 - index * 77.5} textAnchor="end" fill="#94a3b8" fontSize="11">{number(value, active.unit)}</text>
                </g>)
              )}
              {points.length > 1 && <path d={path} fill="none" stroke={active.metric === "crossing_state" ? "#38bdf8" : "#34d399"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {points.map((point, index) => <circle key={`${point.bucket.bucket}-${index}`} cx={point.x} cy={point.y} r="2.5" fill={active.metric === "crossing_state" ? "#38bdf8" : "#34d399"}><title>{time(point.bucket.bucket)}: {active.metric === "crossing_state" ? crossingStateLabel(point.bucket.avg_value!) : `${number(point.bucket.avg_value!, active.unit)} ${unitLabel(active.unit)}`}</title></circle>)}
            </svg>
            <div className="flex justify-between text-xs text-slate-500"><span>{time(data!.start)}</span><span>{time(data!.end)}</span></div>
          </>}
        </div>}
      </>}
    </section>
  );
}
