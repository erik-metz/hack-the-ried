import { env } from "@/env";
import { getBackendUrl, isAuthenticated } from "@/lib/adminAuth";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams;
  const deviceId = query.get("device_id");
  const onlyOwn = query.get("only_own_gateway") === "true";
  const limit = Math.min(Number(query.get("limit") || 1000), 5000);

  const params = new URLSearchParams();
  if (deviceId && /^[a-z0-9-]{1,60}$/.test(deviceId)) {
    params.set("device_id", deviceId);
  }
  if (onlyOwn) {
    params.set("only_own_gateway", "true");
  }
  params.set("limit", String(limit));

  const path = `/api/v1/admin/gps-tracker/points?${params.toString()}`;

  try {
    const response = await fetch(`${getBackendUrl()}${path}`, {
      headers: { Authorization: `Bearer ${env.BACKEND_ADMIN_API_KEY}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return Response.json(
        { error: "GPS-Tracker-Daten derzeit nicht verfügbar" },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    return Response.json(await response.json(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "GPS-Tracker-Backend nicht erreichbar" },
      { status: 502 }
    );
  }
}
