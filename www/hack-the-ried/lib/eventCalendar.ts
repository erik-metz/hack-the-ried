import type { CulturalEvent } from "./regionalStats";

export const EVENT_TIME_ZONE = "Europe/Berlin";
const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: EVENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const RIED = new Set(["Bürstadt", "Lampertheim", "Biblis", "Groß-Rohrheim"]);
export type EventHorizon = "upcoming" | "weekend" | "month" | "archive";

export function eventDay(value: string | number | Date): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dayFormatter.format(date) : "";
}

export function eventIsPast(event: CulturalEvent, now: number): boolean {
  return Date.parse(event.end_time || event.start_time) < now;
}

export function eventOnDay(event: CulturalEvent, day: string): boolean {
  const start = eventDay(event.start_time), end = eventDay(event.end_time || event.start_time);
  return !!start && !!end && start <= day && day <= end;
}

export function filterCalendarEvents(events: CulturalEvent[], options: {
  municipality: string; category: string; search: string; horizon: EventHorizon; now: number;
}): CulturalEvent[] {
  const today = eventDay(options.now);
  const civil = new Date(`${today}T00:00:00Z`);
  const weekday = civil.getUTCDay();
  const friday = new Date(civil);
  friday.setUTCDate(civil.getUTCDate() + (weekday === 0 ? -2 : weekday === 6 ? -1 : 5 - weekday));
  const sunday = new Date(friday);
  sunday.setUTCDate(friday.getUTCDate() + 2);
  const weekendStart = friday.toISOString().slice(0, 10), weekendEnd = sunday.toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const query = options.search.trim().toLocaleLowerCase("de-DE");
  return events.filter(event => {
    if (!RIED.has(event.municipality)) return false;
    if (options.municipality !== "all" && event.municipality !== options.municipality) return false;
    if (options.category !== "all" && event.category !== options.category) return false;
    if (query && ![event.title, event.description, event.organizer, event.venue_name, event.street_address, event.municipality].some(value => value?.toLocaleLowerCase("de-DE").includes(query))) return false;
    const start = eventDay(event.start_time), end = eventDay(event.end_time || event.start_time);
    if (!start || !end || end < start) return false;
    if (options.horizon === "archive") return eventIsPast(event, options.now);
    if (eventIsPast(event, options.now)) return false;
    if (options.horizon === "weekend") return start <= weekendEnd && end >= weekendStart;
    if (options.horizon === "month") return start <= monthEnd && end >= today;
    return true;
  }).sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time) || a.id.localeCompare(b.id));
}

/** Visit only the visible month; long events do not require expanding their entire span. */
export function eventsInMonth(events: CulturalEvent[], year: number, month: number): Map<string, CulturalEvent[]> {
  const map = new Map<string, CulturalEvent[]>();
  const spans = events.map(event => ({ event, start: eventDay(event.start_time), end: eventDay(event.end_time || event.start_time) }));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let day = 1; day <= days; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const matches = spans.filter(({ start, end }) => start && end && start <= key && key <= end).map(({ event }) => event);
    if (matches.length) map.set(key, matches);
  }
  return map;
}

export function eventTimeText(event: CulturalEvent): string {
  const clock = new Intl.DateTimeFormat("de-DE", { timeZone: EVENT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const start = clock.format(new Date(event.start_time));
  const end = event.end_time ? clock.format(new Date(event.end_time)) : null;
  if (start === "00:00" && end === "23:59") return "Ganztägig / Uhrzeit siehe Quelle";
  if (!end || end === "23:59" || event.end_time === event.start_time) return `${start} Uhr`;
  if (eventDay(event.start_time) !== eventDay(event.end_time!)) {
    const date = new Intl.DateTimeFormat("de-DE", { timeZone: EVENT_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(event.end_time!));
    return `${start} Uhr – ${date}, ${end} Uhr`;
  }
  return `${start}–${end} Uhr`;
}
