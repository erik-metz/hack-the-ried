import { env } from "@/env";
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "hack_the_ried_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

export function getBackendUrl(): string {
  return (env.BACKEND_API_URL || "http://localhost:8080").replace(/\/+$/, "");
}

/**
 * Creates a cryptographically signed session token.
 */
export function createSessionToken(): string {
  const timestamp = Date.now().toString();
  const hmac = crypto
    .createHmac("sha256", Buffer.from(env.ADMIN_SESSION_SECRET, "hex"))
    .update(`admin-session:${timestamp}`)
    .digest("hex");
  return `${timestamp}.${hmac}`;
}

/**
 * Validates a session token signature and checks that it is within max age.
 */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestampStr, expectedHmac] = parts;
  if (!/^\d{13}$/.test(timestampStr) || !/^[a-f0-9]{64}$/.test(expectedHmac)) return false;
  const timestamp = Number(timestampStr);

  // Check expiration (7 days)
  if (timestamp > Date.now() || Date.now() - timestamp >= SESSION_MAX_AGE * 1000) {
    return false;
  }

  const actualHmac = crypto
    .createHmac("sha256", Buffer.from(env.ADMIN_SESSION_SECRET, "hex"))
    .update(`admin-session:${timestampStr}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(actualHmac),
      Buffer.from(expectedHmac)
    );
  } catch {
    return false;
  }
}

/**
 * Validates the cookie in Next.js Server Components / Route Handlers.
 */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  return verifySessionToken(sessionCookie?.value);
}

export const ADMIN_COOKIE_CONFIG = {
  name: COOKIE_NAME,
  maxAge: SESSION_MAX_AGE,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
