export type SoilReading = {
  entity_id: string;
  metadata: { municipality: string; latitude: number; longitude: number; resolution_km: number };
  metric: string; unit: string; value: number | null; quality: string;
  valid_at: string; collected_at: string; period_start?: string | null;
  dimensions: { issued_at: string; depth_start_cm?: number; depth_end_cm?: number; depth_cm?: number };
};

export function soilDays(rows: SoilReading[]) {
  const days = new Map<string, SoilReading[]>();
  for (const row of rows) {
    const day = (row.period_start ?? row.valid_at).slice(0, 10);
    const group = days.get(day) ?? [];
    group.push(row); days.set(day, group);
  }
  return [...days].map(([date, readings]) => {
    const summarize = (metric: string, depth: boolean, total = false) => {
      const selected = readings.filter(r => r.metric === metric && (!depth ||
        (metric === "soil_moisture" ? r.dimensions.depth_start_cm === 0 : r.dimensions.depth_cm === 0)));
      const valid = selected.filter(r => r.quality === "valid" && r.value !== null && Number.isFinite(r.value));
      // A daily figure requires every UTC hour, with no missing samples.
      if (selected.length !== 24 || valid.length !== 24 || new Set(valid.map(r => r.valid_at)).size !== 24) return null;
      const sum = valid.reduce((n, r) => n + r.value!, 0);
      return total ? sum : sum / 24;
    };
    return { date, moisture: summarize("soil_moisture", true), temperature: summarize("soil_temperature", true),
      et0: summarize("reference_evapotranspiration", false, true),
      evaporation: summarize("evapotranspiration", false, true), radiation: summarize("shortwave_radiation", false) };
  });
}
