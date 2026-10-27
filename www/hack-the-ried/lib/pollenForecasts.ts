export const POLLEN_NAMES: Record<string, string> = {
  alder: "Erle", birch: "Birke", grass: "Gräser", mugwort: "Beifuß", olive: "Olive", ragweed: "Ambrosia",
};
export type PollenReading = {
  entity_id: string; metadata: { municipality: string; latitude: number; longitude: number };
  dimensions: { species: string }; valid_at: string; value: number | null; quality: string; unit: string;
};
export function pollenDays(rows: PollenReading[]) {
  const groups = new Map<string, PollenReading[]>();
  for (const row of rows) {
    const key = `${row.valid_at.slice(0, 10)}|${row.dimensions.species}`;
    const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
  }
  return [...groups].map(([key, samples]) => {
    const [date, species] = key.split("|");
    const valid = samples.filter(r => r.quality === "valid" && r.value !== null && Number.isFinite(r.value));
    const hours = new Set(valid.map(r => r.valid_at)).size;
    const complete = hours === 24 && valid.length === 24 && samples.length === 24;
    return { date, species, hours, peak: complete ? Math.max(...valid.map(r => r.value!)) : null };
  });
}
