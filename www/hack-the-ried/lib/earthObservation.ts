export type EarthObservationMode = "rgb" | "ndvi" | "ecostress" | "firms";
export type EarthScene = {
  id: string;
  date?: string;
  acquired_at?: string;
  raster?: { method: string; stats?: { valid_pixels: number } } | null;
};

export function acquisitionTime(scene: EarthScene): string {
  return scene.acquired_at ?? scene.date ?? "";
}

/** Satellite acquisitions remain useful after midnight; always disclose their date. */
export function latestRasterScenes(scenes: EarthScene[], mode: EarthObservationMode, now = Date.now()): EarthScene[] {
  const available = scenes.filter(scene => {
    const stamp = Date.parse(acquisitionTime(scene));
    return Number.isFinite(stamp) && stamp <= now && (mode === "ecostress"
      ? scene.raster?.method === "ecostress-v003-clear-land70-v1" && (scene.raster.stats?.valid_pixels ?? 0) > 0
      : scene.raster?.method === "sentinel-c1-scl20-v1");
  }).sort((a, b) => Date.parse(acquisitionTime(b)) - Date.parse(acquisitionTime(a)));
  const latest = available[0];
  return latest ? available.filter(scene => acquisitionTime(scene) === acquisitionTime(latest)) : [];
}

export function inFirmsWindow(value: string, now = Date.now()): boolean {
  const stamp = Date.parse(value);
  const day = 86_400_000;
  return Number.isFinite(stamp) && stamp <= now && stamp >= Math.floor(now / day) * day - 2 * day;
}
