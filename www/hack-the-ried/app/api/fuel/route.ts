import { env } from "@/env";

export async function GET() {
  try {
    const response = await fetch(new URL("/api/v1/fuel", env.BACKEND_API_URL), {
      next: { revalidate: 30 }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Fuel snapshot unavailable");
    return Response.json(await response.json(), { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch {
    return Response.json({ error: "Tankstellenpreise derzeit nicht verfügbar." }, { status: 502 });
  }
}
