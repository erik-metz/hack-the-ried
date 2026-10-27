/** Only received points, bounded to two minutes; no line across reception gaps. */
export interface TrailPoint { stamp: number; lat: number; lng: number }
export function updateAircraftTrail(previous: TrailPoint[], point: TrailPoint, now: number): TrailPoint[] {
  let points = previous.filter(p => p.stamp > now - 120_000);
  if (!Number.isFinite(point.stamp) || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || point.stamp <= now - 120_000) return points;
  const last = points[points.length - 1];
  if (last && point.stamp <= last.stamp) return points;
  if (last && (point.stamp - last.stamp > 60_000 || Math.hypot(
    (point.lat - last.lat) * 111_000, (point.lng - last.lng) * 111_000 * Math.cos(point.lat * Math.PI / 180)) > 15_000)) points = [];
  return [...points, point].slice(-12);
}
