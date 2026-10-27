import { env } from "@/env";
import { presentationStart } from "@/lib/pitchWindow";

export async function GET(request: Request) {
  const start = presentationStart(new URL(request.url).searchParams.get("start"), Date.now());
  const headers = { "Cache-Control": "no-store" };
  if (start === null) return Response.json({ error: "Ungültiger Vortragsbeginn." }, { status: 400, headers });
  try {
    const url = new URL("/api/v1/pitch/activity", env.BACKEND_API_URL);
    url.searchParams.set("start", new Date(start).toISOString());
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Activity unavailable");
    const body = await response.json();
    if (!body || typeof body !== "object" || Date.parse(body.startedAt) !== start ||
        !Number.isFinite(Date.parse(body.checkedAt)) || !("crossings" in body) ||
        !("bikes" in body) || !("moving" in body)) throw new Error("Invalid activity response");
    return Response.json(body, { headers });
  } catch {
    return Response.json({ error: "Aktivitätsdaten derzeit nicht verfügbar." }, { status: 503, headers });
  }
}
