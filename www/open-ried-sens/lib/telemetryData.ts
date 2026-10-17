import type { Reading } from "./mapData";

export const seriesKey = (reading: { metric: string; unit: string }) => JSON.stringify([reading.metric, reading.unit]);
const LABELS: Record<string, string> = {
  fuel_e5: "Super E5", fuel_e10: "Super E10", fuel_diesel: "Diesel",
  pgv: "Peak-Vibration (PGV)", rms: "RMS-Tremor", waveform: "Wellenform", temperature: "Temperatur",
  humidity: "Luftfeuchtigkeit", relative_humidity: "Luftfeuchtigkeit", precipitation: "Niederschlag",
  sgp41_voc_index: "Luftqualität: flüchtige Stoffe (VOC)",
  sgp41_nox_index: "Luftqualität: Stickoxide (NOx)",
  co2: "Kohlendioxid (CO₂)",
  scd41_temperature: "Temperatur (SCD41)",
  scd41_humidity: "Luftfeuchtigkeit (SCD41)",
  soil_temperature: "Bodentemperatur", soil_moisture: "Bodenfeuchte", soil_moisture_nfk: "Bodenfeuchte (Quellenangabe nFK)",
  soil_moisture_30cm: "Bodenfeuchte · 30 cm", soil_moisture_60cm: "Bodenfeuchte · 60 cm",
  soil_tension: "Bodensaugspannung", soil_tension_30cm: "Bodensaugspannung · 30 cm", soil_tension_60cm: "Bodensaugspannung · 60 cm",
  water_surface_distance: "Abstand zur Wasseroberfläche", water_level_delta: "Abweichung vom Referenz-Wasserstand", water_level: "Wasserstand",
  air_quality_index: "Luftqualitätsindex", NO2: "Stickstoffdioxid (NO₂)", O3: "Ozon (O₃)", PM10: "Feinstaub (PM₁₀)", PM25: "Feinstaub (PM₂,₅)",
  parking_free: "Freie Stellplätze", parking_occupied: "Belegte Stellplätze", parking_capacity: "Stellplätze gesamt",
  bike_available: "Verfügbare Leihräder", bike_racks_free: "Freie Docks (Rückgabeplätze)",
  bike_capacity: "Station Kapazität (Docks)", bike_ebikes: "E-Bikes / Pedelecs",
  course: "Kurs über Grund",
  altitude_baro: "Druckhöhe (1013,25 hPa)", altitude_geom: "Geometrische Höhe (WGS84)", vertical_rate: "Steigrate (barometrisch)",
  altitude_ogn: "Gemeldete Höhe (OGN)", vertical_rate_ogn: "Gemeldete Steigrate (OGN)",
  speed: "Geschwindigkeit", delay: "Verspätung", latitude: "Breitengrad", longitude: "Längengrad",
  crossing_state: "Schrankenzustand", closure_duration: "Schließdauer", crossing_closures: "Schließungen gesamt",
};

const COUNT_METRICS = new Set([
  "parking_free", "parking_occupied", "parking_capacity", "bike_available",
  "bike_racks_free", "bike_capacity", "bike_ebikes", "crossing_closures",
  "edu_capacity", "edu_enrollment",
]);

/** Formatting contract for chart axes and current-value cards. Unknown metrics
 * retain unit-based defaults so newly ingested measurements remain readable. */
export function metricPrecision(reading: { metric: string; unit: string }): number {
  if (reading.metric.startsWith("sgp41_") && reading.unit !== "index") return 0;
  if (reading.metric === "sgp41_voc_index" || reading.metric === "sgp41_nox_index") return 0;
  if (reading.metric === "co2") return 0;
  if (reading.metric === "scd41_temperature" || reading.metric === "scd41_humidity") return 2;
  if (COUNT_METRICS.has(reading.metric) || reading.metric.startsWith("traffic_")) return 0;
  if (reading.metric === "crossing_state") return 0;
  if (reading.unit === "€/l") return 3;
  if (["°C", "celsius", "CEL", "%", "km/h", "m/s", "m", "mm", "hPa", "dBm"].includes(reading.unit)) return 1;
  return 2;
}

export function isCountMetric(reading: { metric: string; unit: string }): boolean {
  return COUNT_METRICS.has(reading.metric) || reading.metric.startsWith("traffic_") ||
    ["count", "counts"].includes(reading.unit);
}

export function chartScale(reading: { metric: string; unit: string }, values: number[], fuel = false): [number, number] {
  if (reading.metric === "crossing_state") return [0, 2];
  if (!values.length) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);

  // Air temperature is shown against a familiar annual Ried range. Extend it
  // when real values fall outside that reference instead of clipping them.
  if (reading.metric === "temperature" || reading.metric === "air_temp") {
    min = Math.min(min, -15);
    max = Math.max(max, 40);
  }

  const integer = isCountMetric(reading);
  const span = max - min;
  const padding = span > 0 ? span * 0.1 : fuel ? 0.005 : Math.max(Math.abs(max) * 0.05, integer ? 1 : 0.5);
  let lower = min - padding;
  let upper = max + padding;
  if (integer) {
    lower = Math.floor(lower);
    upper = Math.ceil(upper);
    if (upper - lower < 2) upper = lower + 2;
  } else {
    const minimumSpan = reading.unit === "€/l" ? 0.01 : 0.1;
    if (upper - lower < minimumSpan) {
      const center = (upper + lower) / 2;
      lower = center - minimumSpan / 2;
      upper = center + minimumSpan / 2;
    }
  }
  return [lower, upper];
}

export function metricLabel(reading: { metric: string; unit: string }): string {
  const traffic = reading.metric.match(/^traffic_(.+)_(hourly|daily_city|daily)$/);
  if (traffic) {
    const names: Record<string, string> = { total: "Verkehr gesamt", cars: "PKW", trucks: "LKW", buses: "Busse", bicycles: "Fahrräder", pedestrians: "Passanten", motorcycles: "Motorräder", other: "Sonstiger Verkehr" };
    return `${names[traffic[1]] ?? traffic[1]} · ${traffic[2] === "hourly" ? "Stundensumme" : traffic[2] === "daily_city" ? "Tagessumme Stadt" : "Tagessumme"}`;
  }
  return LABELS[reading.metric] ?? (reading.metric === "value" ? ({ celsius: "Temperatur", "°C": "Temperatur", dBm: "Signalstärke", mm: "Niederschlag" } as Record<string, string>)[reading.unit] ?? "Messwert" : reading.metric);
}
export function unitLabel(unit: string) {
  return ({ count: "Anzahl", counts: "Zählwerte", index: "Index", celsius: "°C", CEL: "°C", state: "Zustand", s: "Sekunden", sec: "Sekunden" } as Record<string, string>)[unit] ?? unit;
}

export function formatMeasurement(value: number, reading: { metric: string; unit: string }): string {
  const digits = metricPrecision(reading);
  return value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function crossingStateLabel(value: number): string {
  if (value >= 2) return "Geschlossen";
  if (value >= 1) return "Schließt bald";
  return "Offen (Frei)";
}
export function mergeReadings(...groups: Reading[][]): Reading[] {
  const latest = new Map<string, Reading>();
  for (const group of groups) for (const reading of group) {
    if (!Number.isFinite(reading.value) || !Number.isFinite(Date.parse(reading.timestamp))) continue;
    const old = latest.get(seriesKey(reading));
    if (!old || Date.parse(old.timestamp) < Date.parse(reading.timestamp)) latest.set(seriesKey(reading), reading);
  }
  return [...latest.values()].sort((a, b) => metricLabel(a).localeCompare(metricLabel(b), "de-DE"));
}
