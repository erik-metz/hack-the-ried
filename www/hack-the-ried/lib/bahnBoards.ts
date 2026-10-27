import { type BahnSnapshot } from "./bahnData";

export interface BahnEvent {
  journey_id: string; event_id: string; event_type: "arrival" | "departure"; eva_number: string;
  scheduled_at: string; time: string; time_basis: "SCHEDULE" | "PREVIEW" | "REAL";
  cancelled: boolean; delay_seconds: number | null; platform: string;
  description: string; direction: string | null;
  gtfs_link: { status: "unmapped" | "schedule_missing" | "schedule_mismatch" | "matched";
    schedule_source?: string; trip_id?: string; service_date?: string; basis?: string };
}
export interface BahnBoard { events: BahnEvent[]; window_start: string; window_end: string; eva_numbers: string[] }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const dateTime = (value: unknown): value is string => typeof value === "string"
  && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export async function fetchBahnBoard(signal?: AbortSignal): Promise<BahnSnapshot<BahnBoard> | null> {
  const response = await fetch("/api/bahn/boards", { signal });
  if (response.status === 404) return null;
  if (response.status === 503) {
    const error: unknown = await response.json().catch(() => null);
    if (record(error) && error.detail === "Source not collected yet") return null;
  }
  if (!response.ok) throw new Error("RIS-Fahrten sind momentan nicht erreichbar.");
  const sourceUpdatedAt = response.headers.get("x-source-updated-at");
  const fetchedAt = response.headers.get("x-collected-at");
  const expiresAt = response.headers.get("x-data-expires-at");
  const now = Date.now();
  if (![sourceUpdatedAt, fetchedAt, expiresAt].every(dateTime)
    || Date.parse(expiresAt!) <= now || Date.parse(sourceUpdatedAt!) > now + 300000 || Date.parse(fetchedAt!) > now + 300000) {
    throw new Error("Die Aktualität der RIS-Fahrten konnte nicht bestätigt werden.");
  }
  const body: unknown = await response.json();
  if (!record(body) || body.contract !== "ris-boards-netz-1.8.2" || body.timestamp_basis !== "fetched"
    || !dateTime(body.window_start) || !dateTime(body.window_end) || Date.parse(body.window_end) <= Date.parse(body.window_start)
    || !Array.isArray(body.eva_numbers) || !body.eva_numbers.every(eva => typeof eva === "string") || !Array.isArray(body.events)) {
    throw new Error("Die RIS-Fahrtdaten sind unvollständig.");
  }
  const keys = new Set<string>();
  for (const event of body.events) {
    if (!record(event) || !["journey_id", "event_id", "eva_number", "platform", "description"].every(field => typeof event[field] === "string")
      || !event.journey_id || !event.event_id || typeof event.eva_number !== "string" || !body.eva_numbers.includes(event.eva_number)
      || !["arrival", "departure"].includes(String(event.event_type)) || !["SCHEDULE", "PREVIEW", "REAL"].includes(String(event.time_basis))
      || !dateTime(event.scheduled_at) || !dateTime(event.time) || typeof event.cancelled !== "boolean"
      || !(event.direction === null || typeof event.direction === "string")
      || !record(event.gtfs_link) || !["unmapped", "schedule_missing", "schedule_mismatch", "matched"].includes(String(event.gtfs_link.status))) {
      throw new Error("Die RIS-Fahrtkennungen oder Zeiten sind ungültig.");
    }
    if (event.time_basis === "SCHEDULE" ? event.delay_seconds !== null || Date.parse(event.time) !== Date.parse(event.scheduled_at)
      : typeof event.delay_seconds !== "number" || !Number.isFinite(event.delay_seconds)
        || event.delay_seconds !== Math.trunc((Date.parse(event.time) - Date.parse(event.scheduled_at)) / 1000)) {
      throw new Error("Die RIS-Zeitgrundlage ist ungültig.");
    }
    if (event.gtfs_link.status === "matched" && (event.gtfs_link.basis !== "explicit_crosswalk_and_exact_schedule"
      || typeof event.gtfs_link.schedule_source !== "string" || !event.gtfs_link.schedule_source
      || typeof event.gtfs_link.trip_id !== "string" || !event.gtfs_link.trip_id
      || typeof event.gtfs_link.service_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(event.gtfs_link.service_date))) {
      throw new Error("Die Fahrtzuordnung ist unvollständig.");
    }
    const key = JSON.stringify([event.journey_id, event.event_id, event.eva_number, event.event_type]);
    if (keys.has(key)) throw new Error("Doppelte RIS-Ereignisse.");
    keys.add(key);
  }
  return { data: body as unknown as BahnBoard, sourceUpdatedAt: sourceUpdatedAt!, fetchedAt: fetchedAt!, expiresAt: expiresAt! };
}

export function eventsForStation(board: BahnBoard, evas: string[]): BahnEvent[] {
  return board.events.filter(event => evas.includes(event.eva_number))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.event_type.localeCompare(b.event_type));
}
export function boardTimeBasis(event: BahnEvent): string {
  return { SCHEDULE: "Nur Fahrplan", PREVIEW: "Prognose", REAL: "Gemeldete Ist-Zeit" }[event.time_basis];
}
