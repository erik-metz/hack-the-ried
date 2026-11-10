import type { Subscriber } from "./adminOverview";

export const QR_LABELS: Record<string, string> = {
  "1": "Aufkleber", "2": "Flyer", "3": "Präsentationen", "4": "Pressetermin November 2026",
};

export interface DailyScan { day: string; qr_id: string; scans: number }
export interface ActivityPoint { date: string; primary: number; secondary: number }

export function subscriberActivity(items: Subscriber[], now = new Date()): ActivityPoint[] {
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    return { date: date.toISOString().slice(0, 7), primary: 0, secondary: 0 };
  });
  const byMonth = new Map(months.map(point => [point.date, point]));
  for (const item of items) {
    const timestamp = new Date(item.consented_at);
    if (!Number.isFinite(timestamp.getTime())) continue;
    const point = byMonth.get(timestamp.toISOString().slice(0, 7));
    if (point) point[item.category === "sensor-workshop" ? "secondary" : "primary"]++;
  }
  return months;
}

export function scanActivity(items: DailyScan[], days: number, qrId: string, now = new Date()): ActivityPoint[] {
  // The backend uses a rolling interval, so the oldest UTC day can be partial.
  const dates = Array.from({ length: days + 1 }, (_, index) => {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - days + index);
    return { date: date.toISOString().slice(0, 10), primary: 0, secondary: 0 };
  });
  const byDay = new Map(dates.map(point => [point.date, point]));
  for (const item of items) {
    const point = byDay.get(item.day);
    if (point && (!qrId || item.qr_id === qrId)) point.primary += item.scans;
  }
  return dates;
}
