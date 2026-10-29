import sensorData from "@/data/sensors.json";

export type QrSensor = {
  id: string;
  name: string;
  model: string;
  commissionedAt: string | null;
  location: string | null;
  modules: string[];
  description: string;
};

const sensors = sensorData as QrSensor[];

export function getQrSensor(id: string): QrSensor | undefined {
  return sensors.find((sensor) => sensor.id === id);
}

export function getQrSensorIds(): string[] {
  return sensors.map(({ id }) => id);
}
