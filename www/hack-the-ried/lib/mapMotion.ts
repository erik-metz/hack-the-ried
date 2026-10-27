/** Interpolate observations and explicitly labelled backend display estimates. */
export interface MotionPoint { lat: number; lng: number }
export interface MarkerMotion {
  from: MotionPoint;
  to: MotionPoint;
  startedAt: number;
  duration: number;
  sourceTime: number;
}
export const MOVEMENT_POLL_MS = 10_000;

export function motionPoint(motion: MarkerMotion, now: number): MotionPoint {
  const progress = motion.duration > 0 ? Math.max(0, Math.min(1, (now - motion.startedAt) / motion.duration)) : 1;
  return {
    lat: motion.from.lat + (motion.to.lat - motion.from.lat) * progress,
    lng: motion.from.lng + (motion.to.lng - motion.from.lng) * progress,
  };
}

export function nextMotion(previous: MarkerMotion | undefined, target: MotionPoint, sourceTime: number, now: number, ship: boolean | "aircraft" | "ship_estimate" = false): MarkerMotion {
  // A cached or out-of-order response must not rewind or restart an animation.
  if (previous && (!Number.isFinite(sourceTime) || sourceTime <= previous.sourceTime)) return previous;
  if (!previous) return { from: target, to: target, startedAt: now, duration: 0, sourceTime };
  const from = motionPoint(previous, now);
  const elapsed = sourceTime - previous.sourceTime;
  const distance = Math.hypot((target.lat - from.lat) * 111_000,
    (target.lng - from.lng) * 111_000 * Math.cos(target.lat * Math.PI / 180));
  // Long outages and large corrections should not produce a fictional journey.
  const duration = elapsed > (ship === "aircraft" ? 60_000 : ship ? 30_000 : 60_000) || distance > (ship === "aircraft" ? 15_000 : ship ? 150 : 2_000) || distance < .01 ? 0 : Math.min(30_000, Math.max(ship === "ship_estimate" ? 1_000 : MOVEMENT_POLL_MS, elapsed));
  return { from, to: target, startedAt: now, duration, sourceTime };
}
