import { env } from "@/env";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const upstream = await fetch(new URL("/api/v1/movements/stream", env.BACKEND_API_URL), {
      cache: "no-store", signal: request.signal,
    });
    if (!upstream.ok || !upstream.body) return new Response(null, { status: 502 });
    return new Response(upstream.body, { headers: {
      "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no",
    } });
  } catch {
    return new Response(null, { status: 502 });
  }
}
