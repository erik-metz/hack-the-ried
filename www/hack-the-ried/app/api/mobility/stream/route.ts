import { env } from "@/env";

// Compatibility for already-open clients: release the function immediately.
export function GET() {
  return Response.redirect(new URL("/api/v1/movements/stream", new URL(env.BACKEND_API_URL).origin), 307);
}
