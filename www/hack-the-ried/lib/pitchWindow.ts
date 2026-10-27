export interface PitchRawReading {
  sensor_id: string;
  timestamp: string;
  metric: string | null;
  value: number;
  unit: string;
}

export function presentationStart(value: string | null, now: number): number | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time <= now && time >= now - 2 * 60 * 60 * 1000 ? time : null;
}

/** Preserve zeroes, reject malformed responses, and count each raw row only once. */
export function rawReadingsInWindow(payload: unknown, sensorId: string, start: number, end: number): PitchRawReading[] {
  if (!Array.isArray(payload)) throw new Error("Invalid raw response");
  const rows: PitchRawReading[] = [];
  const seen = new Set<string>();
  for (const entry of payload) {
    if (!entry || typeof entry !== "object" || entry.sensor_id !== sensorId ||
        typeof entry.timestamp !== "string" || !Number.isFinite(Date.parse(entry.timestamp)) ||
        typeof entry.value !== "number" || !Number.isFinite(entry.value) || typeof entry.unit !== "string" ||
        !(typeof entry.metric === "string" || entry.metric === null)) throw new Error("Invalid raw reading");
    const timestamp = Date.parse(entry.timestamp);
    if (timestamp <= start || timestamp > end) continue;
    const key = JSON.stringify([entry.sensor_id, timestamp, entry.metric, entry.unit]);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(entry);
  }
  return rows.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export interface PitchWindowResult {
  startedAt: string;
  checkedAt: string;
  crossings: { opened: number; closed: number; monitored: number; available: boolean; partial: boolean } | null;
  bikes: { removed: number; returned: number; stations: number; available: boolean; partial: boolean } | null;
  moving: Record<"bus" | "train" | "ship", { count: number | null; estimated: number; available: boolean }> | null;
}
