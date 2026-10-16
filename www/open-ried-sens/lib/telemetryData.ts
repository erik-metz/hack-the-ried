import type { Reading } from "./mapData";

export const seriesKey = (reading: { metric: string; unit: string }) => JSON.stringify([reading.metric, reading.unit]);
const LABELS: Record<string, string> = {
  fuel_e5: "Super E5", fuel_e10: "Super E10", fuel_diesel: "Diesel",
  pgv: "Peak-Vibration (PGV)", rms: "RMS-Tremor", waveform: "Wellenform", temperature: "Temperatur",
  humidity: "Luftfeuchtigkeit", relative_humidity: "Luftfeuchtigkeit", precipitation: "Niederschlag",
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
