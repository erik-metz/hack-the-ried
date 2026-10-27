"use server";

import { env } from "@/env";
import {
  ADMIN_COOKIE_CONFIG,
  createSessionToken,
  isAuthenticated,
} from "@/lib/adminAuth";
import {
  createSensor,
  deleteSensor,
  listAdminSensors,
  setSensorVisibility,
  updateSensor,
  type SensorInput,
  type SensorItem,
} from "@/lib/backend";
import {
  clearFailedLogins,
  loginAllowed,
  recordFailedLogin,
} from "@/lib/loginRateLimit";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function failure(error: unknown): ActionResult<never> {
  console.error("Admin action failed:", error);
  return { ok: false, error: "Die Anfrage konnte nicht abgeschlossen werden." };
}

async function requireAdmin(): Promise<ActionResult> {
  return (await isAuthenticated())
    ? { ok: true, data: undefined }
    : { ok: false, error: "Nicht autorisiert. Bitte erneut anmelden." };
}

function validateSensor(input: unknown): ActionResult<SensorInput> {
  if (!input || typeof input !== "object")
    return { ok: false, error: "Ungültige Sensordaten." };
  const value = input as Record<string, unknown>;
  const name =
    typeof value.friendly_name === "string" ? value.friendly_name.trim() : "";
  const description =
    typeof value.description === "string" ? value.description.trim() : "";
  const latitude = value.latitude;
  const longitude = value.longitude;
  if (
    !name ||
    name.length > 255 ||
    description.length > 1000 ||
    !(
      latitude === null ||
      (typeof latitude === "number" &&
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90)
    ) ||
    !(
      longitude === null ||
      (typeof longitude === "number" &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180)
    ) ||
    typeof value.is_hidden !== "boolean"
  ) {
    return { ok: false, error: "Bitte prüfe alle Eingabefelder." };
  }
  return {
    ok: true,
    data: {
      friendly_name: name,
      latitude,
      longitude,
      description: description || null,
      is_hidden: value.is_hidden,
    },
  };
}

export async function loginAction(password: unknown): Promise<ActionResult> {
  if (typeof password !== "string" || !password)
    return { ok: false, error: "Passwort erforderlich." };
  try {
    const requestHeaders = await headers();
    // The reverse proxy must overwrite this header; otherwise all callers share one bucket.
    const clientId =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!loginAllowed(clientId)) {
      return {
        ok: false,
        error: "Zu viele Anmeldeversuche. Bitte warte zehn Minuten.",
      };
    }
    const given = Buffer.from(password);
    const secret = Buffer.from(env.ADMIN_PASSWORD);
    if (
      given.length !== secret.length ||
      !crypto.timingSafeEqual(given, secret)
    ) {
      recordFailedLogin(clientId);
      return { ok: false, error: "Ungültige Anmeldedaten." };
    }
    clearFailedLogins(clientId);
    const store = await cookies();
    store.set({ ...ADMIN_COOKIE_CONFIG, value: createSessionToken() });
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function logoutAction(): Promise<ActionResult> {
  const store = await cookies();
  store.set({ ...ADMIN_COOKIE_CONFIG, value: "", maxAge: 0 });
  return { ok: true, data: undefined };
}

export async function listSensorsAction(): Promise<ActionResult<SensorItem[]>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    return { ok: true, data: await listAdminSensors() };
  } catch (error) {
    return failure(error);
  }
}

export async function createSensorAction(
  input: unknown
): Promise<ActionResult<SensorItem>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const validated = validateSensor(input);
  if (!validated.ok) return validated;
  try {
    const data = await createSensor(validated.data);
    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function updateSensorAction(
  id: unknown,
  input: unknown
): Promise<ActionResult<SensorItem>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (typeof id !== "string")
    return { ok: false, error: "Ungültige Sensor-ID." };
  const validated = validateSensor(input);
  if (!validated.ok) return validated;
  try {
    const data = await updateSensor(id, validated.data);
    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function setVisibilityAction(
  id: unknown,
  isHidden: unknown
): Promise<ActionResult<SensorItem>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (typeof id !== "string" || typeof isHidden !== "boolean")
    return { ok: false, error: "Ungültige Anfrage." };
  try {
    const data = await setSensorVisibility(id, isHidden);
    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSensorAction(
  id: unknown,
  purgeTelemetry: unknown,
  password: unknown
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (
    typeof id !== "string" ||
    typeof purgeTelemetry !== "boolean" ||
    typeof password !== "string"
  )
    return { ok: false, error: "Ungültige Anfrage." };
  try {
    const given = Buffer.from(password);
    const expected = Buffer.from(env.ADMIN_PASSWORD);
    if (
      given.length !== expected.length ||
      !crypto.timingSafeEqual(given, expected)
    )
      return { ok: false, error: "Passwortbestätigung fehlgeschlagen." };
    await deleteSensor(id, purgeTelemetry);
    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error);
  }
}
