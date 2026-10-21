import type { Reading } from "./mapData";

export const seriesKey = (reading: { metric: string; unit: string }) => JSON.stringify([reading.metric, reading.unit]);

/** Related measurements that are useful to compare over time for one station. */
export function measurementGroup(reading: { metric: string; unit: string }): string | undefined {
  const metric = reading.metric.toLocaleLowerCase("de-DE").replace(/[.-]/g, "_");
  if (["temperature", "scd41_temperature", "bme688_temperature", "humidity", "relative_humidity", "scd41_humidity", "bme688_humidity"].includes(metric)) return "temperature-humidity";
  if (["ambient_light", "ltr390_als_raw", "uv_index", "ltr390_uv_raw"].includes(metric)) return "light-uv";
  if (["pm0_5", "pm1_0", "pm2_5", "pm4_0", "pm10", "pm25", "particle_number_pm0_5", "particle_number_pm1_0", "particle_number_pm2_5", "particle_number_pm4_0", "particle_number_pm10"].includes(metric)) {
    return metric.startsWith("particle_number_") ? "particulate-count" : "air-concentration";
  }
  if (["no2", "o3"].includes(metric)) return "air-concentration";
  if (["fuel_e5", "fuel_e10", "fuel_diesel"].includes(metric)) return "fuel-price";
  return undefined;
}
const MEASUREMENT_GROUP_LABELS: Record<string, string> = {
  "temperature-humidity": "Temperatur & Luftfeuchtigkeit",
  "light-uv": "Licht & UV",
  "particulate-count": "Feinstaub · Partikelanzahl",
  "air-concentration": "Feinstaub & Luftschadstoffe",
  "fuel-price": "Kraftstoffpreise",
};
export function measurementGroupLabel(group: string | undefined): string | undefined {
  return group ? MEASUREMENT_GROUP_LABELS[group] : undefined;
}
export function measurementCardGroups<T extends { metric: string; unit: string }>(readings: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const reading of readings) {
    const group = measurementGroup(reading);
    if (group) groups.set(group, [...(groups.get(group) ?? []), reading]);
  }
  const result: T[][] = [];
  const added = new Set<string>();
  for (const reading of readings) {
    const group = measurementGroup(reading);
    if (!group) {
      result.push([reading]);
      continue;
    }
    if (added.has(group)) continue;
    added.add(group);
    const members = groups.get(group) ?? [reading];
    result.push(members.length > 1 && new Set(members.map(member => member.unit)).size <= 2 ? members : [reading]);
    if (members.length <= 1 || new Set(members.map(member => member.unit)).size > 2) {
      for (const remaining of members.slice(1)) result.push([remaining]);
    }
  }
  return result;
}
const LABELS: Record<string, string> = {
  fuel_e5: "Super E5", fuel_e10: "Super E10", fuel_diesel: "Diesel",
  pgv: "Peak-Vibration (PGV)", rms: "RMS-Tremor", waveform: "Wellenform", temperature: "Temperatur",
  humidity: "Luftfeuchtigkeit", relative_humidity: "Luftfeuchtigkeit", precipitation: "Niederschlag",
  sgp41_voc_index: "Luftqualität · flüchtige Stoffe",
  sgp41_nox_index: "Luftqualität · Stickoxide",
  ltr390_uv_raw: "UV-Rohwert",
  ltr390_als_raw: "Licht-Rohwert",
  uv_index: "UV-Index",
  ambient_light: "Umgebungslicht",
  co2: "Kohlendioxid (CO₂)",
  scd41_temperature: "Temperatur",
  scd41_humidity: "Luftfeuchtigkeit",
  bme688_temperature: "Temperatur",
  bme688_humidity: "Luftfeuchtigkeit",
  bme688_gas_resistance: "Luftgüte-Signal",
  pressure: "Luftdruck",
  sound_level: "Lautstärke",
  particle_number_pm0_5: "Feinstaub PM0.5 · Partikelanzahl",
  particle_number_pm1_0: "Feinstaub PM1.0 · Partikelanzahl",
  particle_number_pm2_5: "Feinstaub PM2.5 · Partikelanzahl",
  particle_number_pm4_0: "Feinstaub PM4.0 · Partikelanzahl",
  particle_number_pm10: "Feinstaub PM10 · Partikelanzahl",
  particle_size_typical: "Typische Partikelgröße",
  pm0_5: "Feinstaub PM0.5 · Masse",
  pm1_0: "Feinstaub PM1.0 · Masse",
  pm2_5: "Feinstaub PM2.5 · Masse",
  pm4_0: "Feinstaub PM4.0 · Masse",
  pm10: "Feinstaub PM10 · Masse",
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
  if (reading.metric === "ltr390_uv_raw" || reading.metric === "ltr390_als_raw" || reading.metric === "ambient_light") return 0;
  if (reading.metric === "uv_index") return 2;
  if (reading.metric.startsWith("sgp41_") && reading.unit !== "index") return 0;
  if (reading.metric === "sgp41_voc_index" || reading.metric === "sgp41_nox_index") return 0;
  if (reading.metric === "co2") return 0;
  if (reading.metric === "scd41_temperature" || reading.metric === "scd41_humidity") return 2;
  if (reading.metric === "bme688_temperature" || reading.metric === "bme688_humidity") return 2;
  if (reading.metric === "bme688_gas_resistance") return 0;
  if (reading.metric === "sound_level") return 1;
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
  const min = Math.min(...values);
  const max = Math.max(...values);

  const integer = isCountMetric(reading);
  const span = max - min;
  const minimumSpan = reading.unit === "€/l" ? 0.01
    : ["°C", "celsius", "CEL"].includes(reading.unit) ? 5
    : reading.unit === "%" ? 10
    : reading.unit === "ppm" ? 100
    : reading.unit === "Index" || reading.unit === "index" ? 5
    : reading.unit === "dBFS" || reading.unit === "dB" ? 10
    : Math.max(Math.abs((min + max) / 2) * 0.1, integer ? 2 : 1);
  const padding = Math.max(span * 0.12, minimumSpan * 0.12, fuel ? 0.005 : 0);
  let lower = min - padding;
  let upper = max + padding;
  if (integer) {
    lower = Math.floor(lower);
    upper = Math.ceil(upper);
    if (upper - lower < 2) upper = lower + 2;
  } else {
    if (upper - lower < minimumSpan) {
      const center = (upper + lower) / 2;
      lower = center - minimumSpan / 2;
      upper = center + minimumSpan / 2;
    }
  }
  return [lower, upper];
}

export function measurementRange(
  reading: { metric: string; unit: string },
  samples: { metric: string; unit: string; value: number | null }[],
): { min: number; max: number; count: number } | undefined {
  const values = samples.filter(sample => sample.metric === reading.metric && sample.unit === reading.unit && sample.value !== null && Number.isFinite(sample.value)).map(sample => sample.value!);
  if (!values.length) return undefined;
  return { min: Math.min(...values), max: Math.max(...values), count: values.length };
}

export function metricLabel(reading: { metric: string; unit: string }): string {
  const traffic = reading.metric.match(/^traffic_(.+)_(hourly|daily_city|daily)$/);
  if (traffic) {
    const names: Record<string, string> = { total: "Verkehr gesamt", cars: "PKW", trucks: "LKW", buses: "Busse", bicycles: "Fahrräder", pedestrians: "Passanten", motorcycles: "Motorräder", other: "Sonstiger Verkehr" };
    return `${names[traffic[1]] ?? traffic[1]} · ${traffic[2] === "hourly" ? "Stundensumme" : traffic[2] === "daily_city" ? "Tagessumme Stadt" : "Tagessumme"}`;
  }
  const normalizedMetric = reading.metric.toLocaleLowerCase("de-DE").replace(/[.-]/g, "_");
  const known = LABELS[reading.metric] ?? LABELS[normalizedMetric];
  if (known) return known;
  if (reading.metric === "value") return ({ celsius: "Temperatur", "°C": "Temperatur", dBm: "Signalstärke", mm: "Niederschlag" } as Record<string, string>)[reading.unit] ?? "Messwert";
  const humanized = reading.metric.replace(/_/g, " ").replace(/\bpm\s?(\d+(?:[._]\d+)?)\b/i, (_, size: string) => `PM${size.replace("_", ",").replace(".", ",")}`).replace(/\b\w/g, letter => letter.toLocaleUpperCase("de-DE"));
  return humanized || "Messwert";
}
export function metricDescription(reading: { metric: string; unit: string }): string | undefined {
  if (reading.metric === "sgp41_voc_index") return "Hinweis auf flüchtige Stoffe, etwa aus Reinigungsmitteln oder Ausdünstungen. Ein höherer Index bedeutet mehr erkannte Stoffe.";
  if (reading.metric === "sgp41_nox_index") return "Hinweis auf Stickoxide in der Luft. Der Index zeigt Veränderungen, keine direkte Konzentration.";
  if (reading.metric.startsWith("particle_number_")) return `Anzahl der Partikel dieser Größenklasse pro ${reading.unit.includes("cm") ? "Kubikzentimeter" : "Volumeneinheit"}.`;
  if (/^pm(?:0_5|1_0|2_5|4_0|10)$/.test(reading.metric)) return "Masse der Feinstaubpartikel pro Luftvolumen in dieser Größenklasse.";
  if (reading.metric === "particle_size_typical") return "Typische Größe der erfassten Schwebeteilchen.";
  if (reading.metric === "bme688_gas_resistance") return "Reaktionssignal auf flüchtige Stoffe; daraus lässt sich keine direkte Konzentration ablesen.";
  if (reading.metric === "sound_level") return "Momentaner Schalldruckpegel; dBFS ist ein relativer digitaler Messwert.";
  if (reading.metric === "ltr390_uv_raw" || reading.metric === "ltr390_als_raw") return "Unskalierter Sensorwert; für die Nutzung ist der berechnete Index aussagekräftiger.";
  return undefined;
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
  return [...latest.values()].sort((a, b) => metricLabel(a).localeCompare(metricLabel(b), "de-DE", { numeric: true }));
}
