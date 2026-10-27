"use client";

import { useEffect, useState } from "react";
import { hasCoordinates, parkingSummary, bikeSummary, type StationNode } from "@/lib/mapData";
import { seriesKey, metricLabel, metricDescription, unitLabel, mergeReadings, crossingStateLabel, chartScale, formatMeasurement, isCountMetric, measurementRange, measurementGroup, measurementCardGroups, measurementGroupLabel, measurementGroupDescription } from "@/lib/telemetryData";
import { Activity } from "lucide-react";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { ChartContainer } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";

type Reading = { metric: string; unit: string; value: number; timestamp: string };
type Bucket = { metric: string; unit: string; bucket: string; avg_value: number | null };
type WindowMetric = { metric: string; unit: string; min_value: number | null; mean_value: number; max_value: number | null; sample_count: number };
type SensorWindow = { window_start: string; window_end: string; window_seconds: number; metrics: WindowMetric[] };
type Telemetry = { readings: Reading[]; history: Bucket[]; window?: SensorWindow | null; start: string; end: string; historyMode?: string; historyInterval?: string | null; historyDays?: number; historyUnavailable?: boolean; historyTruncated?: boolean };
const number = (value: number, reading: { metric: string; unit: string }) => formatMeasurement(value, reading);
const time = (value: string) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const seriesColors = ["#34d399", "#38bdf8", "#fbbf24", "#c084fc", "#fb7185", "#a3e635", "#22d3ee", "#f97316"];
const axisDate = (value: number) => new Date(value).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const historyIntervalLabels: Record<string, string> = {
  "5 minutes": "5-Minuten-Mittelwerte",
  "1 hour": "Stundenmittelwerte",
  "1 day": "Tagesmittelwerte",
};

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
  const start = data ? Date.parse(data.start) : 0;
  const end = data ? Date.parse(data.end) : 1;
  const chartDefinitions = chartSeries.map((series, index) => ({
    ...series,
    key: `series${index}`,
    axisId: `unit-${units.indexOf(series.reading.unit)}`,
    color: seriesColors[index % seriesColors.length],
  }));
  const chartData = [...chartSeries.reduce((rows, series, index) => {
    for (const bucket of series.history) {
      const timestamp = Date.parse(bucket.bucket);
      const row = rows.get(timestamp) ?? { timestamp };
      row[`series${index}`] = bucket.avg_value;
      rows.set(timestamp, row);
    }
    return rows;
  }, new Map<number, { timestamp: number; [key: string]: number | null }>()).values()].sort((a, b) => a.timestamp - b.timestamp);
  const windowMetric = (reading: Reading) => data?.window?.metrics.find(item => item.metric === reading.metric && item.unit === reading.unit);
  const readingRangeSummary = (reading: Reading) => {
    const dailyRange = measurementRange(reading, (data?.history ?? []).map(sample => ({ metric: sample.metric, unit: sample.unit, value: sample.avg_value })));
    if (dailyRange) return `24-Stunden-Verlauf · Min ${number(dailyRange.min, reading)} · Max ${number(dailyRange.max, reading)} · n=${dailyRange.count}`;
    const summary = windowMetric(reading);
    if (!summary) return undefined;
    const range = summary.min_value !== null && summary.max_value !== null
      ? `Min ${number(summary.min_value, reading)} · Max ${number(summary.max_value, reading)}`
      : "Fenstermittel";
    return `${Math.round(data!.window!.window_seconds / 60)}-Minuten-Fenster · ${range} · n=${summary.sample_count}`;
  };
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
        <div className="grid grid-cols-1 auto-rows-fr sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {measurementCardGroups(readings).map(cardReadings => {
            const grouped = cardReadings.length > 1;
            const groupId = measurementGroup(cardReadings[0]);
            const title = grouped ? measurementGroupLabel(groupId) ?? "Messwertgruppe" : metricLabel(cardReadings[0]);
            const isActive = cardReadings.some(reading => seriesKey(reading) === (active && seriesKey(active)));
            const descriptions = [...new Set(cardReadings.map(metricDescription).filter((description): description is string => Boolean(description)))];
            const groupDescription = measurementGroupDescription(groupId) ?? (descriptions.length === 1 ? descriptions[0] : undefined);
            const latestReading = cardReadings.reduce((latest, reading) => Date.parse(reading.timestamp) > Date.parse(latest.timestamp) ? reading : latest, cardReadings[0]);
            const key = cardReadings.map(seriesKey).join("|");
            return <button key={key} type="button" aria-pressed={isActive} onClick={() => {
              const reading = cardReadings.find(item => seriesKey(item) === (active && seriesKey(active))) ?? cardReadings[0];
              const k = seriesKey(reading);
              setLocalSelectedSeries(k);
              onSelectMetric?.(k);
            }} className="h-full min-w-0 text-left rounded-xl border border-slate-700 bg-slate-950/60 p-4 aria-pressed:border-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400">
              <span className="block text-sm text-slate-400">{grouped ? title : metricLabel(cardReadings[0])}</span>
              {grouped ? <>
                {groupDescription && <span className="block mt-1 text-xs leading-relaxed text-slate-500">{groupDescription}</span>}
                <span className="mt-2 block text-xs text-slate-500">Letzte Messung: {time(latestReading.timestamp)}</span>
              </> : <>
                {metricDescription(cardReadings[0]) && <span className="block mt-1 text-xs leading-relaxed text-slate-500">{metricDescription(cardReadings[0])}</span>}
                <span className="block mt-2 text-2xl font-bold break-words">
                  {cardReadings[0].metric === "crossing_state" ? crossingStateLabel(cardReadings[0].value) : <>{number(cardReadings[0].value, cardReadings[0])} <span className="text-sm font-normal text-slate-400">{unitLabel(cardReadings[0].unit)}</span></>}
                </span>
                <span className="block mt-2 text-xs text-slate-500">Stand: {time(cardReadings[0].timestamp)}</span>
                {readingRangeSummary(cardReadings[0]) && <span className="block mt-1 text-xs text-slate-400">{readingRangeSummary(cardReadings[0])}</span>}
              </>}
            </button>;
          })}
        </div>
        {active && <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <h4 className="font-semibold">{chartReadings.length > 1 ? measurementGroupLabel(group) ?? "Messwerte" : `${metricLabel(active)} · ${unitLabel(active.unit)}`}</h4>
          {chartSeries.length > 1 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{chartSeries.map((series, index) => <span key={seriesKey(series.reading)} className="inline-flex items-center gap-1.5 text-xs text-slate-300"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: seriesColors[index % seriesColors.length] }} />{metricLabel(series.reading)}</span>)}</div>}
          {(chartReadings.length > 1 ? measurementGroupDescription(group) : metricDescription(active)) && <p className="mt-1 text-sm text-slate-400">{chartReadings.length > 1 ? measurementGroupDescription(group) : metricDescription(active)}</p>}
          <p className="text-xs text-slate-400 mt-1">Letzte {data?.historyDays === 30 ? "30 Tage" : "24 Stunden"} · {node.id.startsWith("civic-") ? "Gespeicherte Meldungsstände" : barrierEntity ? "Gespeicherte Zustandsprognosen" : snapshots && !mobilityEntity ? "Gespeicherte Quellmeldungen" : historyIntervalLabels[data?.historyInterval ?? "5 minutes"] ?? "Aggregierte Messwerte"} · {data?.historyDays === 30 ? "Datum Europe/Berlin" : "Uhrzeit Europe/Berlin"}</p>
          {fuelEntity && <p className="mt-2 text-xs text-slate-400">Gemeldete Preise in €/l. Zeitpunkte sind Abrufzeiten, keine exakten Preisänderungszeiten. Historie ab Beginn der Preiserfassung; Datenlücken werden nicht verbunden.</p>}
          {active.metric.startsWith("traffic_") && <p className="mt-2 text-xs text-amber-200">Stunden-/Tagessummen der Quelle, keine einzelnen Verkehrserfassungen. Aufeinanderfolgende Meldungen werden nicht addiert. Exakte Intervallgrenzen meldet die Quelle nicht.</p>}
          {data?.historyUnavailable && <p role="status" className="mt-2 text-sm text-amber-200">Der Zeitverlauf konnte nicht geladen werden. Aktuelle Werte bleiben sichtbar.</p>}
          {data?.historyTruncated && <p className="mt-2 text-sm text-amber-200">Der Verlauf ist auf die neuesten verfügbaren Meldungen dieses Zeitraums begrenzt.</p>}
          {chartData.length === 0 ? <p className="py-10 text-center text-slate-400">Keine Messwerte in den letzten {data?.historyDays === 30 ? "30 Tagen" : "24 Stunden"}.</p> : <>
            <ChartContainer className="mt-5 h-[320px] sm:h-[360px]">
              <AreaChart data={chartData} margin={{ top: 8, right: units.length > 1 ? 8 : 18, bottom: 4, left: 0 }}>
                <defs>
                  {chartDefinitions.map(series => <linearGradient key={series.key} id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={series.color} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={series.color} stopOpacity={0.015} />
                  </linearGradient>)}
                </defs>
                <CartesianGrid vertical={false} stroke="#334155" strokeDasharray="3 5" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={[start, end]}
                  tickCount={5}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickFormatter={value => data?.historyDays === 30 ? new Date(value).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }) : axisDate(value)}
                  minTickGap={28}
                />
                {units.map((unit, index) => {
                  const reading = chartSeries.find(series => series.reading.unit === unit)?.reading ?? active;
                  return <YAxis
                    key={unit}
                    yAxisId={`unit-${index}`}
                    orientation={index === 0 ? "left" : "right"}
                    width={58}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    tick={{ fill: seriesColors[index % seriesColors.length], fontSize: 11 }}
                    domain={active.metric === "crossing_state" ? [0, 2] : scales[index]}
                    ticks={active.metric === "crossing_state" ? [0, 1, 2] : undefined}
                    tickFormatter={value => active.metric === "crossing_state" ? crossingStateLabel(Number(value)) : number(Number(value), reading)}
                    label={{ value: unitLabel(unit), angle: index === 0 ? -90 : 90, position: index === 0 ? "insideLeft" : "insideRight", fill: seriesColors[index % seriesColors.length], fontSize: 11 }}
                  />;
                })}
                <Tooltip
                  cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4", strokeWidth: 1 }}
                  labelFormatter={value => time(new Date(Number(value)).toISOString())}
                  formatter={(value, _name, item) => {
                    const series = chartDefinitions.find(definition => definition.key === item.dataKey);
                    if (!series || value === null || value === undefined) return ["–", ""];
                    const formatted = series.reading.metric === "crossing_state" ? crossingStateLabel(Number(value)) : `${number(Number(value), series.reading)} ${unitLabel(series.reading.unit)}`;
                    return [formatted, metricLabel(series.reading)];
                  }}
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #475569", borderRadius: 12, boxShadow: "0 12px 30px rgb(0 0 0 / 0.35)", padding: "10px 12px" }}
                  itemStyle={{ color: "#e2e8f0", fontSize: 12, padding: "2px 0" }}
                  labelStyle={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}
                />
                {chartDefinitions.length > 1 && <Legend verticalAlign="top" align="left" height={34} iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} formatter={value => metricLabel(chartDefinitions.find(series => series.key === value)?.reading ?? active)} />}
                {chartDefinitions.map(series => <Area
                  key={series.key}
                  type={barrierEntity || series.reading.unit === "€/l" ? "stepAfter" : "monotone"}
                  dataKey={series.key}
                  name={series.key}
                  yAxisId={series.axisId}
                  stroke={series.color}
                  strokeWidth={seriesKey(series.reading) === seriesKey(active) ? 2.8 : 2}
                  fill={`url(#fill-${series.key})`}
                  activeDot={{ r: 5, stroke: "#f8fafc", strokeWidth: 2 }}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />)}
              </AreaChart>
            </ChartContainer>
          </>}
        </div>}
      </>}
    </section>
  );
}
