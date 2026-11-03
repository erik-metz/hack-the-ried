export const GATEWAY_LABELS: Record<string, string> = {
  cpu_temperature: "CPU-Temperatur", enclosure_temperature: "Gehäusetemperatur", enclosure_humidity: "Luftfeuchtigkeit im Gehäuse",
  cpu_usage: "CPU-Auslastung", memory_available: "Verfügbarer RAM", disk_free: "Freier Speicherplatz", uptime: "Laufzeit",
  health_age: "Alter des Funkstatus", last_rx_age: "Zeit seit letztem Empfang", radio_ready: "Funkmodul bereit",
  station_connected: "Station verbunden", lns_connected: "TTN verbunden", undervoltage: "Unterspannung", throttled: "CPU gedrosselt",
  throttled_history: "Firmware-Flags seit Boot", spool_pending: "Ungesendete Frames", spool_unknown: "Frames mit unbekannter Annahme",
  spool_rows: "Journal-Einträge", spool_bytes: "Journalgröße", telemetry_pending: "Telemetrie-Rückstau", telemetry_dropped: "Verworfene Telemetrie seit Installation",
  journal_expired: "Abgelaufene Journaleinträge", journal_overflow: "Journal-Überlauf", rx_packets: "Empfangene Pakete",
  rx_rssi: "Empfangsstärke RSSI", rx_snr: "Signal-Rausch-Verhältnis", state_known_seconds: "Beobachtete Zustandsdauer", state_up_seconds: "Aktive Zustandsdauer",
};
export type GatewayDevice = { id: string; name: string; latest_at: string | null; last_contact: string | null; sensor_config: { sht41?: boolean } };
export type GatewayReading = { metric: string; unit: string; value: number | string | null; quality: string };
export type GatewayPoint = { time: string; value: number | string | null; quality: string; dimensions: Record<string, string>; unit: string };
export type GatewayDetails = { availability: Record<string, { known_seconds: number; up_seconds: number; window_seconds: number }>; device: GatewayDevice; fresh: boolean; latest: GatewayReading[]; series: GatewayPoint[]; resolution: string; events: { observed_at: string; kind: string; details: Record<string, unknown> }[]; maintenance: { last_completed: string | null; pending_hours: number }; metrics: Record<string, { unit: string; operation: string }> };

export function formatGatewayValue(value: number | string | null, unit: string): string {
  if (value === null) return "Unbekannt";
  const n = Number(value);
  if (unit === "boolean") return n === 1 ? "Ja" : "Nein";
  if (unit === "bytes") return `${(n / 1024 ** (n >= 1024 ** 3 ? 3 : 2)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${n >= 1024 ** 3 ? "GiB" : "MiB"}`;
  if (unit === "s" && n >= 3600) return `${(n / 3600).toLocaleString("de-DE", { maximumFractionDigits: 1 })} h`;
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${unit === "count" ? "" : unit}`.trim();
}

export function gatewayChartRows(series: GatewayPoint[], resolution: string) {
  const groups = new Map<number, Record<string, number>>();
  for (const row of series) {
    const t = Date.parse(row.time);
    if (!groups.has(t)) groups.set(t, {});
    if (row.quality !== "valid" || row.value === null) continue;
    const stats = groups.get(t)!;
    const key = row.dimensions.statistic;
    const value = Number(row.value);
    stats[key] = key === "min" ? Math.min(stats[key] ?? value, value) : key === "max" ? Math.max(stats[key] ?? value, value) : (stats[key] ?? 0) + value;
  }
  const step = resolution === "minute" ? 60_000 : resolution === "day" ? 86_400_000 : 3_600_000;
  const sorted = [...groups].sort((a, b) => a[0] - b[0]);
  const result: { time: number; value: number | null; range: [number, number] | null; count: number | null }[] = [];
  let previous: number | null = null;
  for (const [time, stats] of sorted) {
    if (previous !== null && time - previous > step * 1.5) result.push({ time: previous + step, value: null, range: null, count: null });
    const value = stats.value ?? (stats.count > 0 ? stats.sum / stats.count : null);
    result.push({ time, value, range: stats.min !== undefined && stats.max !== undefined ? [stats.min, stats.max] : null, count: stats.count ?? null });
    previous = time;
  }
  return result;
}
