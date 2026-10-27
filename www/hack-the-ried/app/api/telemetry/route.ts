import { env } from "@/env";

type RawReading = { metric: string; unit: string; value: number; timestamp: string };
const HIDDEN_METRICS = new Set([
  "sgp41_voc_raw", "sgp41_nox_raw", "scd41_temperature", "scd41_humidity",
  "ltr390_uv_raw", "ltr390_als_raw",
]);
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sensorId = params.get("sensor_id");
  if (!sensorId || sensorId.length > 256) {
    return Response.json({ error: "Ungültige Station." }, { status: 400 });
  }
  if (sensorId.startsWith("movement:") || sensorId.startsWith("crossing:")) {
    const url = new URL("/api/v1/movements/telemetry", env.BACKEND_API_URL);
    url.searchParams.set("entity_id", sensorId);
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Backend unavailable");
      return Response.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "Mobilitätsdaten konnten nicht geladen werden." }, { status: 502 });
    }
  }
  const snapshots = params.get("history_mode") === "snapshots";
  const end = new Date();
  const civicDaily = sensorId.startsWith("civic-");
  const historyDays = civicDaily ? 30 : 1;
  const start = new Date(end.getTime() - historyDays * 24 * 60 * 60 * 1000);
  const latest = new URL("/api/v1/telemetry/latest/metrics", env.BACKEND_API_URL);
  latest.searchParams.set("sensor_id", sensorId);
  const latestWindow = new URL("/api/v1/telemetry/latest/window", env.BACKEND_API_URL);
  latestWindow.searchParams.set("sensor_id", sensorId);
  const loadHistory = async () => {
    const intervals = civicDaily ? ["1 day"] : snapshots ? [null] : ["5 minutes", "1 hour", "1 day"];
    for (const interval of intervals) {
      const history = new URL(snapshots ? "/api/v1/telemetry/raw" : "/api/v1/telemetry/aggregates", env.BACKEND_API_URL);
      history.search = new URLSearchParams({ sensor_id: sensorId, start_time: start.toISOString(), end_time: end.toISOString(),
        ...(snapshots ? { limit: "5000" } : { interval: interval! }),
      }).toString();
      const response = await fetch(history, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (response.ok) return { buckets: await response.json(), interval };
      const detail = await response.clone().json().catch(() => null);
      const exceededRowLimit = response.status === 422 && detail?.detail === "Too many results; select a metric or shorten the range.";
      if (!exceededRowLimit || interval === intervals.at(-1)) throw new Error("Backend unavailable");
    }
    throw new Error("Backend unavailable");
  };
  const fetchJson = async (url: URL) => {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Backend unavailable");
    return response.json();
  };
  const results = await Promise.allSettled([fetchJson(latest), loadHistory(), fetchJson(latestWindow)]);
  if (results[0].status === "rejected" || (Array.isArray(results[0].value) && results[0].value.length === 0)) {
    if (results[0].status === "rejected") {
      return Response.json({ error: "Messdaten konnten nicht geladen werden." }, { status: 502 });
    }
  }
  const buckets = results[1].status === "fulfilled" ? results[1].value.buckets : [];
  const historyInterval = results[1].status === "fulfilled" ? results[1].value.interval : null;
  const window = results[2].status === "fulfilled" ? results[2].value : null;
  const readings = Array.isArray(results[0].value) ? results[0].value.filter((r: RawReading) => !HIDDEN_METRICS.has(r.metric)) : results[0].value;
  const filteredHistory = snapshots ? buckets.map((r: RawReading) => ({ metric: r.metric, unit: r.unit, bucket: r.timestamp, avg_value: r.value })) : buckets;
  return Response.json({ readings,
    window,
    history: Array.isArray(filteredHistory) ? filteredHistory.filter((r: RawReading) => !HIDDEN_METRICS.has(r.metric)) : filteredHistory,
    historyMode: snapshots ? "snapshots" : "averages", historyUnavailable: results[1].status === "rejected",
    historyInterval,
    historyTruncated: snapshots && buckets.length >= 5000, historyDays, start: start.toISOString(), end: end.toISOString(),
  });
}
