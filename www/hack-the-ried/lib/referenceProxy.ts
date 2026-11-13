import { env } from "@/env";

export async function referenceProxy(layer?: string) {
  try {
    const upstream = await fetch(new URL(`/api/v1/reference${layer ? `/${encodeURIComponent(layer)}` : ""}`, env.BACKEND_API_URL), {
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) throw new Error("Reference publication unavailable");
    const data = await upstream.json();
    // The UI displays check age independently of the historical data year.
    return Response.json(data, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch {
    return Response.json({ error: "Referenzdaten derzeit nicht vollständig verfügbar." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
