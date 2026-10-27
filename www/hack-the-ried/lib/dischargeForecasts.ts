export const DISCHARGE_STATS = ["control", "mean", "median", "min", "max", "p25", "p75"] as const;
export type DischargeStatistic = typeof DISCHARGE_STATS[number];
export type DischargeReading = {
  entity_id: string; metadata: { reference_point: string; latitude: number; longitude: number; river_assignment: string };
  dimensions: { statistic: DischargeStatistic; snapshot_sha256: string };
  valid_at: string; value: number | null; quality: string; unit: string;
};
export function dischargeDays(rows: DischargeReading[]) {
  const groups = new Map<string, DischargeReading[]>();
  for (const row of rows) {
    const key = `${row.entity_id}|${row.valid_at.slice(0, 10)}`;
    const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
  }
  return [...groups.values()].map(samples => {
    const sameSnapshot = new Set(samples.map(r => r.dimensions.snapshot_sha256)).size === 1;
    const values = Object.fromEntries(DISCHARGE_STATS.map(stat => {
      const matches = samples.filter(r => r.dimensions.statistic === stat);
      const r = matches[0];
      return [stat, sameSnapshot && matches.length === 1 && r.quality === "valid" && r.unit === "m3/s" && r.value !== null && Number.isFinite(r.value) && r.value >= 0 ? r.value : null];
    })) as Record<DischargeStatistic, number | null>;
    return { entity_id: samples[0].entity_id, date: samples[0].valid_at.slice(0, 10), ...values };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
