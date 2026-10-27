import { env } from "@/env";

export async function GET() {
  try {
    const response = await fetch(new URL("/api/v1/sky", env.BACKEND_API_URL), {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Regional sky readings unavailable");
    return Response.json(await response.json(), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch {
    return Response.json({ error: "Himmelsdaten für das Hessische Ried derzeit nicht verfügbar." }, { status: 503 });
  }
}
