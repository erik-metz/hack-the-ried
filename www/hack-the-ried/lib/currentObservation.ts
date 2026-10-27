/** Earth observations are current only on the acquisition's UTC calendar day.
 * Date-only Sentinel metadata is accepted; future timestamps are never current.
 */
export function isCurrentObservation(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) && stamp <= now && new Date(stamp).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
}
