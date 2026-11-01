import { cache } from "react";
import { env } from "@/env";

export type QrSensorMetadata = {
  id: string;
  friendly_name: string;
  latitude: number | null;
  longitude: number | null;
  is_hidden: boolean;
  description: string | null;
  created_at: string;
  updated_at: string | null;
};

export type QrSensorModule = {
  name: string;
  metrics: string[];
  latestObservedAt: string;
};

const QR_SENSOR_IDS = new Set(["1", "2", "3", "4", "5"]);

const MODULES = [
  { name: "SHT41 · Temperatur und Luftfeuchtigkeit", matches: (metric: string) => ["temperature", "humidity"].includes(metric) },
  { name: "SCD41 · CO₂", matches: (metric: string) => ["co2", "scd41_temperature", "scd41_humidity"].includes(metric) },
  { name: "SGP41 · VOC und NOₓ", matches: (metric: string) => ["sgp41_voc_index", "sgp41_nox_index"].includes(metric) },
  { name: "BME688 · Gas, Druck und Klima", matches: (metric: string) => metric.startsWith("bme688_") || metric === "pressure" },
  { name: "LTR390 · UV und Umgebungslicht", matches: (metric: string) => ["uv_index", "ambient_light", "ltr390_uv_raw", "ltr390_als_raw"].includes(metric) },
  { name: "SPS30 · Feinstaub und Partikel", matches: (metric: string) => /^(pm1_0|pm2_5|pm4_0|pm10|particle_number_|particle_size_)/.test(metric) },
  { name: "ICS-43434 · Mikrofon", matches: (metric: string) => metric.startsWith("sound_") || metric.startsWith("audio_") },
  { name: "INA226 · Spannung, Strom und Leistung", matches: (metric: string) => ["bus_voltage", "shunt_voltage", "current", "power"].includes(metric) },
];

export function getQrDatabaseId(qrId: string): string | undefined {
  if (!QR_SENSOR_IDS.has(qrId)) return undefined;
  return `ttn-rak3112-${qrId.padStart(3, "0")}`;
}

export const getQrSensor = cache(async (qrId: string): Promise<QrSensorMetadata | null> => {
  const sensorId = getQrDatabaseId(qrId);
  if (!sensorId) return null;

  const url = new URL(`/api/v1/sensors/${encodeURIComponent(sensorId)}`, env.BACKEND_API_URL);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Sensorstammdaten konnten nicht geladen werden.");

  return response.json() as Promise<QrSensorMetadata>;
});

export const getQrSensorModules = cache(async (sensorId: string): Promise<QrSensorModule[]> => {
  const url = new URL("/api/v1/telemetry/latest/metrics", env.BACKEND_API_URL);
  url.searchParams.set("sensor_id", sensorId);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Messgrößen konnten nicht geladen werden.");

  const readings = await response.json() as Array<{ metric?: unknown; timestamp?: unknown }>;
  if (!Array.isArray(readings)) throw new Error("Ungültige Messgrößenantwort.");

  return MODULES.flatMap(({ name, matches }) => {
    const matchesForModule = readings.filter((reading) =>
      typeof reading.metric === "string" && matches(reading.metric) &&
      typeof reading.timestamp === "string" && Number.isFinite(Date.parse(reading.timestamp))
    );
    if (!matchesForModule.length) return [];
    const latestObservedAt = matchesForModule.reduce((latest, reading) =>
      Date.parse(reading.timestamp as string) > Date.parse(latest) ? reading.timestamp as string : latest,
    matchesForModule[0].timestamp as string);
    return [{
      name,
      metrics: [...new Set(matchesForModule.map((reading) => reading.metric as string))].sort(),
      latestObservedAt,
    }];
  });
});
