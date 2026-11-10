import type { GatewayDetails } from "./gatewayData";

// Printed gateway numbers are permanent and independent of database ordering.
const gateways = [
  { qrId: "1", deviceId: "kamue-lora-pi", name: "Kamü-Gateway" },
] as const;

export function getQrGateway(qrId: string) {
  return gateways.find(gateway => gateway.qrId === qrId);
}

export function getGatewayQrId(deviceId: string): string | undefined {
  return gateways.find(gateway => gateway.deviceId === deviceId)?.qrId;
}

export const PUBLIC_GATEWAY_METRICS = new Set([
  "cpu_temperature", "enclosure_temperature", "enclosure_humidity", "cpu_usage", "uptime",
  "radio_ready", "station_connected", "lns_connected", "rx_packets", "rx_rssi", "rx_snr",
]);

export type GatewayDisplayData = Omit<GatewayDetails, "events" | "maintenance"> & Partial<Pick<GatewayDetails, "events" | "maintenance">>;

// Explicit projection: never forward private device fields, events or maintenance details.
export function publicGatewayData(data: GatewayDetails, qrId: string): GatewayDisplayData {
  const gateway = getQrGateway(qrId);
  if (!gateway) throw new Error("Unknown gateway");
  return {
    device: {
      id: qrId, name: gateway.name, latest_at: data.device.latest_at,
      last_contact: data.device.last_contact,
      sensor_config: { sht41: Boolean(data.device.sensor_config.sht41) },
    },
    fresh: data.fresh,
    latest: data.latest.filter(row => PUBLIC_GATEWAY_METRICS.has(row.metric)).map(row => ({
      metric: row.metric, value: row.value, unit: row.unit, quality: row.quality,
    })),
    series: data.series.map(row => ({
      time: row.time, value: row.value, quality: row.quality, unit: row.unit,
      dimensions: { statistic: row.dimensions.statistic },
    })),
    resolution: data.resolution,
    availability: Object.fromEntries(Object.entries(data.availability)
      .filter(([state]) => PUBLIC_GATEWAY_METRICS.has(state))
      .map(([state, value]) => [state, {
        known_seconds: value.known_seconds, up_seconds: value.up_seconds, window_seconds: value.window_seconds,
      }])),
    metrics: Object.fromEntries(Object.entries(data.metrics)
      .filter(([metric]) => PUBLIC_GATEWAY_METRICS.has(metric))
      .map(([metric, value]) => [metric, { unit: value.unit, operation: value.operation }])),
  };
}
