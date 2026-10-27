import type { Reading } from "./mapData";

export const seriesKey = (reading: { metric: string; unit: string }) => JSON.stringify([reading.metric, reading.unit]);

/** Related measurements that are useful to compare over time for one station. */
export function measurementGroup(reading: { metric: string; unit: string }): string | undefined {
  const metric = reading.metric.toLocaleLowerCase("de-DE").replace(/[.-]/g, "_");
  if (["temperature", "scd41_temperature", "bme688_temperature", "humidity", "relative_humidity", "scd41_humidity", "bme688_humidity", "dew_point"].includes(metric)) return "temperature-humidity";
  if (["ambient_light", "illuminance", "uv_index", "uv_intensity"].includes(metric)) return "light-uv";
  if (metric === "particle_size_typical") return "particulate-size";
  if (["particle_number_pm0_5", "particle_number_pm1_0", "particle_number_pm2_5", "particle_number_pm4_0", "particle_number_pm10"].includes(metric)) return "particulate-count";
  if (["pm0_5", "pm1_0", "pm2_5", "pm25", "pm4_0", "pm10"].includes(metric)) return "particulate-mass";
  if (["no2", "o3", "so2"].includes(metric)) return "air-pollutants";
  if (["co2", "bme688_co2_equivalent", "bme688_bvoc_equivalent", "sgp41_voc_index", "sgp41_nox_index", "air_quality_index"].includes(metric)) return "air-quality";
  if (["parking_free", "parking_occupied", "parking_capacity", "parking_occupancy_pct"].includes(metric)) return "parking";
  if (["bike_available", "bike_racks_free", "bike_capacity", "bike_ebikes"].includes(metric)) return "bikes";
  if (["soil_moisture", "soil_moisture_30cm", "soil_moisture_60cm", "soil_tension", "soil_tension_30cm", "soil_tension_60cm"].includes(metric)) return "soil-moisture";
  if (["water_surface_distance", "water_level_delta"].includes(metric)) return "water-level";
  if (["day_ahead_price", "total_load", "generation_power"].includes(metric)) return "energy";
  if (["speed", "free_flow_speed", "delay"].includes(metric)) return "traffic-flow";
  if (["altitude_baro", "altitude_geom", "altitude_ogn"].includes(metric)) return "flight-altitude";
  if (["evapotranspiration", "reference_evapotranspiration"].includes(metric)) return "evapotranspiration";
  if (["ndvi_mean", "evi_mean", "ndmi_mean", "ndwi_mean", "savi_mean"].includes(metric)) return "vegetation-indices";
  if (["fuel_e5", "fuel_e10", "fuel_diesel"].includes(metric)) return "fuel-price";
  return undefined;
}
const MEASUREMENT_GROUP_LABELS: Record<string, string> = {
  "temperature-humidity": "Temperatur & Luftfeuchtigkeit",
  "light-uv": "Licht & UV",
  "particulate-mass": "Feinstaub · Masse",
  "particulate-count": "Feinstaub · Partikelanzahl",
  "particulate-size": "Feinstaub · Partikelgröße",
  "air-pollutants": "Luftschadstoffe",
  "air-quality": "Luftqualität",
  parking: "Stellplätze",
  bikes: "Leihräder",
  "soil-moisture": "Bodenfeuchte",
  "water-level": "Wasserstand",
  energy: "Energie",
  "traffic-flow": "Verkehrsfluss",
  "flight-altitude": "Flughöhe",
  evapotranspiration: "Verdunstung",
  "vegetation-indices": "Vegetationsindizes",
  "fuel-price": "Kraftstoffpreise",
};
const MEASUREMENT_GROUP_DESCRIPTIONS: Record<string, string> = {
  "temperature-humidity": "Temperatur, Luftfeuchtigkeit und bei passenden Sensoren der Taupunkt im gemeinsamen zeitlichen Verlauf.",
  "light-uv": "Helligkeit und UV werden je nach Einheit mit getrennten Skalen verglichen.",
  "particulate-mass": "Masse der Feinstaubpartikel pro Luftvolumen, getrennt nach Größenklasse.",
  "particulate-count": "Anzahl der Feinstaubpartikel pro Luftvolumen, getrennt nach Größenklasse.",
  "particulate-size": "Typische Größe der erfassten Schwebeteilchen.",
  "air-pollutants": "Konzentrationen verschiedener Luftschadstoffe; unterschiedliche Einheiten haben eigene Skalen.",
  "air-quality": "CO₂-Messwerte und Hinweise auf flüchtige Stoffe oder Stickoxide. Sensorindizes zeigen Veränderungen und sind keine Konzentrationswerte.",
  parking: "Freie, belegte und insgesamt verfügbare Stellplätze an diesem Standort.",
  bikes: "Verfügbare Räder, freie Rückgabeplätze und Stationskapazität.",
  "soil-moisture": "Vergleich von Bodenwassergehalt und Bodensaugspannung, sofern beides erfasst wird.",
  "water-level": "Abstand zur Wasseroberfläche und Änderung des Wasserstands.",
  energy: "Energiepreise und Leistung im Zeitverlauf; die Einheiten werden getrennt skaliert.",
  "traffic-flow": "Geschwindigkeit und Verspätung des Verkehrsabschnitts im gemeinsamen Verlauf.",
  "flight-altitude": "Barometrische und geometrische Höhenmeldungen; der Höhenbezug kann sich unterscheiden.",
  evapotranspiration: "Tatsächliche und rechnerische Verdunstung zum Vergleich.",
  "vegetation-indices": "Satellitengestützte Vegetations- und Feuchteindizes im gemeinsamen Verlauf.",
  "fuel-price": "Preise für die angebotenen Kraftstoffsorten im gemeinsamen Verlauf.",
};
export function measurementGroupLabel(group: string | undefined): string | undefined {
  return group ? MEASUREMENT_GROUP_LABELS[group] : undefined;
}
export function measurementGroupDescription(group: string | undefined): string | undefined {
  return group ? MEASUREMENT_GROUP_DESCRIPTIONS[group] : undefined;
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
  bme688_co2_equivalent: "CO₂-Äquivalent",
  bme688_bvoc_equivalent: "Flüchtige Stoffe · Äquivalent",
  uv_index: "UV-Index",
  ambient_light: "Umgebungslicht",
  illuminance: "Helligkeit",
  uv_intensity: "UV-Strahlung",
  dew_point: "Taupunkt",
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
  air_quality_index: "Luftqualitätsindex", NO2: "Stickstoffdioxid (NO₂)", O3: "Ozon (O₃)", SO2: "Schwefeldioxid (SO₂)", PM10: "Feinstaub (PM₁₀)", PM25: "Feinstaub (PM₂,₅)",
  parking_free: "Freie Stellplätze", parking_occupied: "Belegte Stellplätze", parking_capacity: "Stellplätze gesamt",
  parking_occupancy_pct: "Stellplatzbelegung",
  bike_available: "Verfügbare Leihräder", bike_racks_free: "Freie Docks (Rückgabeplätze)",
  bike_capacity: "Station Kapazität (Docks)", bike_ebikes: "E-Bikes / Pedelecs",
  course: "Kurs über Grund",
  altitude_baro: "Druckhöhe (1013,25 hPa)", altitude_geom: "Geometrische Höhe (WGS84)", vertical_rate: "Steigrate (barometrisch)",
  altitude_ogn: "Gemeldete Höhe (OGN)", vertical_rate_ogn: "Gemeldete Steigrate (OGN)",
  speed: "Geschwindigkeit", delay: "Verspätung", latitude: "Breitengrad", longitude: "Längengrad",
  crossing_state: "Schrankenzustand", closure_duration: "Schließdauer", crossing_closures: "Schließungen gesamt",
  precipitation_probability: "Niederschlagswahrscheinlichkeit",
  day_ahead_price: "Börsenstrompreis", total_load: "Gesamtlast", generation_power: "Erzeugungsleistung",
  free_flow_speed: "Referenzgeschwindigkeit",
  ndvi_mean: "Vegetationsindex (NDVI)", evi_mean: "Vegetationsindex (EVI)", ndmi_mean: "Feuchteindex (NDMI)",
  ndwi_mean: "Wasserindex (NDWI)", savi_mean: "Vegetationsindex (SAVI)",
  evapotranspiration: "Tatsächliche Verdunstung", reference_evapotranspiration: "Referenzverdunstung",
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
  if (reading.metric === "bme688_co2_equivalent") return "Vom Sensor geschätzter CO₂-Äquivalentwert; kein direkt gemessener CO₂-Wert.";
  if (reading.metric === "bme688_bvoc_equivalent") return "Vom Sensor geschätzter Wert für flüchtige organische Stoffe.";
  if (reading.metric === "ltr390_uv_raw" || reading.metric === "ltr390_als_raw") return "Unskalierter Sensorwert; für die Nutzung ist der berechnete Index aussagekräftiger.";
  if (reading.metric === "dew_point") return "Temperatur, bei der die Luftfeuchtigkeit durch Abkühlung 100 % erreicht.";
  if (reading.metric === "uv_intensity") return "Gemessene Stärke der ultravioletten Strahlung.";
  if (reading.metric === "parking_occupancy_pct") return "Anteil der belegten Stellplätze an der gemeldeten Gesamtkapazität.";
  if (reading.metric === "day_ahead_price") return "Börsenpreis für Stromlieferungen am Folgetag.";
  if (reading.metric === "reference_evapotranspiration") return "Vergleichswert für den Wasserbedarf einer gut versorgten Referenzfläche.";
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
