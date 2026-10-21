"use client";

import { useEffect, useState } from "react";
import { hasCoordinates, parkingSummary, bikeSummary, type StationNode } from "@/lib/mapData";
import { seriesKey, metricLabel, metricDescription, unitLabel, mergeReadings, crossingStateLabel, chartScale, formatMeasurement, isCountMetric, measurementRange, measurementGroup } from "@/lib/telemetryData";
import { Activity } from "lucide-react";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";

type Reading = { metric: string; unit: string; value: number; timestamp: string };
type Bucket = { metric: string; unit: string; bucket: string; avg_value: number | null };
type WindowMetric = { metric: string; unit: string; min_value: number | null; mean_value: number; max_value: number | null; sample_count: number };
type SensorWindow = { window_start: string; window_end: string; window_seconds: number; metrics: WindowMetric[] };
type Telemetry = { readings: Reading[]; history: Bucket[]; window?: SensorWindow | null; start: string; end: string; historyMode?: string; historyUnavailable?: boolean; historyTruncated?: boolean };
const number = (value: number, reading: { metric: string; unit: string }) => formatMeasurement(value, reading);
const time = (value: string) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const seriesColors = ["#34d399", "#38bdf8", "#fbbf24", "#c084fc", "#fb7185", "#a3e635", "#22d3ee", "#f97316"];

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
  const [localSelectedSeries, setLocalSelectedSeries] = useState(selectedMetric ?? "");
  const selectedSeries = selectedMetric ?? localSelectedSeries;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const mobilityEntity = node.id.startsWith("movement:") || node.id.startsWith("crossing:");
  const barrierEntity = node.id.startsWith("crossing:");
  const fuelEntity = node.id.startsWith("fuel-");
  const snapshots = fuelEntity || node.categories.some(c => c === "parking" || c === "traffic" || c === "bikes");
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!mobilityEntity) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      setNow(Date.now());
      timer = setTimeout(update, 5000);
    };
    timer = setTimeout(update, 0);
    return () => clearTimeout(timer);
  }, [mobilityEntity]);
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

  const readings = mobilityEntity ? (error ? [] : (data?.readings ?? node.readings).filter(r => Date.parse(r.timestamp) + 30000 > now)) : node.isAggregate ? node.readings : mergeReadings(node.readings, data?.readings ?? []);
  const parking = parkingSummary(readings);
  const bikes = bikeSummary(readings);
  const active = readings.find(reading => seriesKey(reading) === selectedSeries) ?? (mobilityEntity ? readings.find(r => r.metric === "crossing_state" || r.metric === "speed") : undefined) ?? readings[0] ?? (mobilityEntity && data?.history.length ? { metric: data.history[0].metric, unit: data.history[0].unit, value: 0, timestamp: data.history[0].bucket } : undefined);
  const historyFor = (reading: Reading) => (data?.history ?? []).filter(bucket => seriesKey(bucket) === seriesKey(reading) && bucket.avg_value !== null).sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket));
  const group = active ? measurementGroup(active) : undefined;
  const groupedReadings = group ? readings.filter(reading => measurementGroup(reading) === group) : [];
  const chartReadings = groupedReadings.length > 1 && new Set(groupedReadings.map(reading => reading.unit)).size <= 2 ? groupedReadings : active ? [active] : [];
  const chartSeries = chartReadings.map(reading => ({ reading, history: historyFor(reading) })).filter(series => series.history.length > 0);
  const units = [...new Set(chartSeries.map(series => series.reading.unit))];
  const scales = units.map(unit => {
    const unitSeries = chartSeries.filter(series => series.reading.unit === unit);
    const scaleReading = unitSeries.find(series => isCountMetric(series.reading))?.reading ?? unitSeries[0]?.reading ?? active!;
    return chartScale(scaleReading, unitSeries.flatMap(series => series.history.map(bucket => bucket.avg_value!)), fuelEntity || unit === "€/l");
  });
  const scaleFor = (reading: Reading) => scales[Math.max(0, units.indexOf(reading.unit))] ?? [0, 1] as [number, number];
  const start = data ? Date.parse(data.start) : 0;
  const end = data ? Date.parse(data.end) : 1;
  const pointsBySeries = chartSeries.map(series => {
    const [lower, upper] = scaleFor(series.reading);
    return { ...series, points: series.history.map(bucket => ({
      x: 130 + Math.max(0, Math.min(1, (Date.parse(bucket.bucket) - start) / (end - start))) * 655,
      y: 180 - ((bucket.avg_value! - lower) / (upper - lower)) * 155,
      bucket,
    })) };
  });
  const activePoints = pointsBySeries.find(series => seriesKey(series.reading) === seriesKey(active ?? { metric: "", unit: "" }))?.points ?? [];
  const windowMetric = (reading: Reading) => data?.window?.metrics.find(item => item.metric === reading.metric && item.unit === reading.unit);
  const pathFor = (series: typeof pointsBySeries[number]) => series.points.map((point, index) => {
    const previous = series.points[index - 1];
    const isFuel = series.reading.unit === "€/l";
    const interrupted = (isFuel && previous && Date.parse(point.bucket.bucket)-Date.parse(previous.bucket.bucket)>20*60*1000) || (barrierEntity && previous && (data?.history ?? []).some(b => b.avg_value === null && Date.parse(b.bucket)>Date.parse(previous.bucket.bucket) && Date.parse(b.bucket)<Date.parse(point.bucket.bucket)));
    return !previous || interrupted ? `M ${point.x} ${point.y}` : (barrierEntity || isFuel) ? `H ${point.x} V ${point.y}` : `L ${point.x} ${point.y}`;
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
            setLocalSelectedSeries(k);
            setHoverIndex(null);
            onSelectMetric?.(k);
          }} className="min-w-0 text-left rounded-xl border border-slate-700 bg-slate-950/60 p-4 aria-pressed:border-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400">
            <span className="block text-sm text-slate-400">{metricLabel(reading)}</span>
            {metricDescription(reading) && <span className="block mt-1 text-xs leading-relaxed text-slate-500">{metricDescription(reading)}</span>}
            <span className="block mt-2 text-2xl font-bold break-words">
              {reading.metric === "crossing_state" ? (
                crossingStateLabel(reading.value)
              ) : (
                <>
                  {number(reading.value, reading)} <span className="text-sm font-normal text-slate-400">{unitLabel(reading.unit)}</span>
                </>
              )}
            </span>
            <span className="block mt-2 text-xs text-slate-500">Stand: {time(reading.timestamp)}</span>
            {(() => {
              const summary = windowMetric(reading);
              const dailyRange = measurementRange(reading, (data?.history ?? []).map(sample => ({ metric: sample.metric, unit: sample.unit, value: sample.avg_value })));
              if (dailyRange) return <span className="block mt-1 text-xs text-slate-400">24-Stunden-Verlauf · Min {number(dailyRange.min, reading)} · Max {number(dailyRange.max, reading)} · n={dailyRange.count}</span>;
              if (!summary) return null;
              const range = summary.min_value !== null && summary.max_value !== null
                ? `Min ${number(summary.min_value, reading)} · Max ${number(summary.max_value, reading)}`
                : "Fenstermittel";
              return <span className="block mt-1 text-xs text-slate-400">{Math.round(data!.window!.window_seconds / 60)}-Minuten-Fenster · {range} · n={summary.sample_count}</span>;
            })()}
          </button>)}
        </div>
        {active && <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <h4 className="font-semibold">{chartSeries.length > 1 ? `Messwertgruppe · ${{ "temperature-humidity": "Temperatur & Luftfeuchtigkeit", "light-uv": "Licht & UV", "particulate-count": "Feinstaub · Partikelanzahl", "air-concentration": "Feinstaub & Luftschadstoffe", "fuel-price": "Kraftstoffpreise" }[group ?? ""] ?? "Messwerte"}` : `${metricLabel(active)} · ${unitLabel(active.unit)}`}</h4>
          {chartSeries.length > 1 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{chartSeries.map((series, index) => <span key={seriesKey(series.reading)} className="inline-flex items-center gap-1.5 text-xs text-slate-300"><span className="size-2 rounded-full" style={{ backgroundColor: seriesColors[index % seriesColors.length] }} />{metricLabel(series.reading)} · {unitLabel(series.reading.unit)}</span>)}</div>}
          {metricDescription(active) && <p className="mt-1 text-sm text-slate-400">{metricDescription(active)}</p>}
          <p className="text-xs text-slate-400 mt-1">Letzte 24 Stunden · {barrierEntity ? "Gespeicherte Zustandsprognosen" : snapshots && !mobilityEntity ? "Gespeicherte Quellmeldungen" : "5-Minuten-Mittelwerte"} · Uhrzeit Europe/Berlin</p>
          {fuelEntity && <p className="mt-2 text-xs text-slate-400">Gemeldete Preise in €/l. Zeitpunkte sind Abrufzeiten, keine exakten Preisänderungszeiten. Historie ab Beginn der Preiserfassung; Datenlücken werden nicht verbunden.</p>}
          {active.metric.startsWith("traffic_") && <p className="mt-2 text-xs text-amber-200">Stunden-/Tagessummen der Quelle, keine einzelnen Verkehrserfassungen. Aufeinanderfolgende Meldungen werden nicht addiert. Exakte Intervallgrenzen meldet die Quelle nicht.</p>}
          {data?.historyUnavailable && <p role="status" className="mt-2 text-sm text-amber-200">Der Zeitverlauf konnte nicht geladen werden. Aktuelle Werte bleiben sichtbar.</p>}
          {data?.historyTruncated && <p className="mt-2 text-sm text-amber-200">Der Verlauf ist auf die neuesten verfügbaren Meldungen dieses Zeitraums begrenzt.</p>}
          {activePoints.length === 0 ? <p className="py-10 text-center text-slate-400">Keine Messwerte in den letzten 24 Stunden.</p> : <>
            <svg viewBox="0 0 850 225" role="img" aria-label={`${chartSeries.map(series => metricLabel(series.reading)).join(", ")}, letzte 24 Stunden`} className="w-full mt-5 touch-pan-y"
              onPointerMove={event => {
                if (!activePoints.length) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const chartX = ((event.clientX - bounds.left) / bounds.width) * 850;
                const nearest = activePoints.reduce((best, point, index) => Math.abs(point.x - chartX) < Math.abs(activePoints[best].x - chartX) ? index : best, 0);
                setHoverIndex(nearest);
              }}
              onPointerLeave={() => setHoverIndex(null)}>
              <rect x="130" y="25" width="655" height="155" fill="transparent" pointerEvents="all" />
              {active.metric === "crossing_state" ? (
                [0, 1, 2].map((stateVal, idx) => (
                  <g key={idx}>
                    <line x1="130" x2="785" y1={180 - idx * 77.5} y2={180 - idx * 77.5} stroke="#334155" strokeDasharray="4 4" />
                    <text x="122" y={184 - idx * 77.5} textAnchor="end" fill="#94a3b8" fontSize="11">
                      {stateVal === 2 ? "Geschlossen" : stateVal === 1 ? "Schließt bald" : "Offen"}
                    </text>
                  </g>
                ))
              ) : active.metric === "crossing_state" ? (
                ["Offen", "Schließt bald", "Geschlossen"].map((label, index) => <g key={label}>
                  <line x1="130" x2="785" y1={180 - index * 77.5} y2={180 - index * 77.5} stroke="#334155" strokeDasharray="4 4" />
                  <text x="122" y={184 - index * 77.5} textAnchor="end" fill="#94a3b8" fontSize="11">{label}</text>
                </g>)
              ) : (
                scales.map(([lower, upper], unitIndex) => [lower, (lower + upper) / 2, upper].map((value, index) => <g key={`${unitIndex}-${index}`}>
                  {unitIndex === 0 && <line x1="130" x2="785" y1={180 - index * 77.5} y2={180 - index * 77.5} stroke="#334155" strokeDasharray="4 4" />}
                  <text x={unitIndex === 0 ? 122 : 792} y={184 - index * 77.5} textAnchor={unitIndex === 0 ? "end" : "start"} fill={seriesColors[unitIndex % seriesColors.length]} fontSize="11">{number(isCountMetric(chartSeries.find(series => series.reading.unit === units[unitIndex])?.reading ?? active) ? Math.round(value) : value, chartSeries.find(series => series.reading.unit === units[unitIndex])?.reading ?? active)}</text>
                </g>))
              )}
              {pointsBySeries.map((series, seriesIndex) => <g key={seriesKey(series.reading)}>
                {series.points.length > 1 && <path d={pathFor(series)} fill="none" stroke={seriesColors[seriesIndex % seriesColors.length]} strokeWidth={seriesKey(series.reading) === seriesKey(active) ? "2.5" : "2"} strokeLinejoin="round" strokeLinecap="round" />}
                {series.points.map((point, index) => <circle key={`${point.bucket.bucket}-${index}`} cx={point.x} cy={point.y} r="2.2" fill={seriesColors[seriesIndex % seriesColors.length]}><title>{metricLabel(series.reading)} · {time(point.bucket.bucket)}: {number(point.bucket.avg_value!, series.reading)} {unitLabel(series.reading.unit)}</title></circle>)}
              </g>)}
              <line x1="130" x2="785" y1="180" y2="180" stroke="#64748b" />
              {Array.from({ length: 5 }, (_, index) => {
                const timestamp = start + (end - start) * index / 4;
                const x = 130 + 655 * index / 4;
                return <g key={index}>
                  <line x1={x} x2={x} y1="180" y2="184" stroke="#64748b" />
                  <text x={x} y="202" textAnchor={index === 0 ? "start" : index === 4 ? "end" : "middle"} fill="#94a3b8" fontSize="11">{new Date(timestamp).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })}</text>
                </g>;
              })}
              {hoverIndex !== null && activePoints[hoverIndex] && (() => {
                const point = activePoints[hoverIndex];
                const tooltipWidth = 250;
                const tooltipHeight = 39 + chartSeries.length * 18;
                const tooltipX = Math.max(132, Math.min(850 - tooltipWidth - 4, point.x + 12));
                const tooltipY = Math.max(4, Math.min(180 - tooltipHeight, point.y - tooltipHeight - 8));
                return <g pointerEvents="none">
                  <line x1={point.x} x2={point.x} y1="25" y2="180" stroke="#94a3b8" strokeDasharray="4 4" />
                  {pointsBySeries.map((series, index) => {
                    const nearest = series.points.reduce((best, candidate, candidateIndex) => Math.abs(candidate.x - point.x) < Math.abs(series.points[best].x - point.x) ? candidateIndex : best, 0);
                    const sample = series.points[nearest];
                    return <circle key={seriesKey(series.reading)} cx={sample.x} cy={sample.y} r="5" fill={seriesColors[index % seriesColors.length]} stroke="#ecfdf5" strokeWidth="2" />;
                  })}
                  <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="6" fill="#0f172a" stroke="#475569" />
                  <text x={tooltipX + 9} y={tooltipY + 16} fill="#cbd5e1" fontSize="11">{time(point.bucket.bucket)}</text>
                  {pointsBySeries.map((series, index) => {
                    const nearest = series.points.reduce((best, candidate, candidateIndex) => Math.abs(candidate.x - point.x) < Math.abs(series.points[best].x - point.x) ? candidateIndex : best, 0);
                    const sample = series.points[nearest];
                    const value = series.reading.metric === "crossing_state" ? crossingStateLabel(sample.bucket.avg_value!) : `${number(sample.bucket.avg_value!, series.reading)} ${unitLabel(series.reading.unit)}`;
                    return <text key={seriesKey(series.reading)} x={tooltipX + 9} y={tooltipY + 33 + index * 18} fill={seriesColors[index % seriesColors.length]} fontSize="11" fontWeight="600">{metricLabel(series.reading)}: {value}</text>;
                  })}
                </g>;
              })()}
            </svg>
          </>}
        </div>}
      </>}
    </section>
  );
}
