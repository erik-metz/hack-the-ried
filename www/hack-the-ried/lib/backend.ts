import { env } from "@/env";
import { getBackendUrl } from "@/lib/adminAuth";

export interface SensorItem {
  id: string;
  friendly_name: string;
  latitude: number | null;
  longitude: number | null;
  is_hidden: boolean;
  description?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface SensorInput {
  friendly_name: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  is_hidden: boolean;
}

export class BackendError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function adminHeaders(json = false): HeadersInit {
  return {
    Authorization: `Bearer ${env.BACKEND_ADMIN_API_KEY}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getBackendUrl()}${path}`, {
      ...init,
      headers: { ...adminHeaders(Boolean(init.body)), ...init.headers },
      cache: "no-store",
    });
  } catch {
    throw new BackendError(
      "The telemetry backend is currently unavailable.",
      502
    );
  }

  if (!response.ok) {
    // Do not relay backend error bodies to the browser.
    throw new BackendError(
      "The backend could not complete this request.",
      response.status
    );
  }
  return response.json() as Promise<T>;
}

export function listAdminSensors() {
  return request<SensorItem[]>("/api/v1/admin/sensors");
}

export function createSensor(input: SensorInput) {
  return request<SensorItem>("/api/v1/admin/sensors", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSensor(id: string, input: SensorInput) {
  console.log("in updateSensor", { id, input });
  return request<SensorItem>(
    `/api/v1/admin/sensors/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    }
  );
}

export function setSensorVisibility(id: string, is_hidden: boolean) {
  return request<SensorItem>(
    `/api/v1/admin/sensors/${encodeURIComponent(id)}/visibility`,
    { method: "PATCH", body: JSON.stringify({ is_hidden }) }
  );
}

export function deleteSensor(id: string, purgeTelemetry: boolean) {
  return request<{ status: "hidden" | "purged" }>(
    `/api/v1/admin/sensors/${encodeURIComponent(
      id
    )}?purge_telemetry=${purgeTelemetry}`,
    { method: "DELETE" }
  );
}
