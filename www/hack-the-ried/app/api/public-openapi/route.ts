import { env } from "@/env";
import { publicOpenApi } from "@/lib/publicOpenApi";

export async function GET() {
  try {
    const response = await fetch(new URL("/api/v1/openapi.json", env.BACKEND_API_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Schema unavailable");
    const schema = publicOpenApi(await response.json());
    return new Response(JSON.stringify(schema, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="hack-the-ried-public.openapi.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "Die API-Definition ist momentan nicht verfügbar. Bitte später erneut versuchen." }, { status: 502 });
  }
}
