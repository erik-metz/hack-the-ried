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

const QR_SENSOR_IDS = new Set(["1", "2", "3", "4", "5"]);

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
