import { env } from "@/env";
import { getBackendUrl, isAuthenticated } from "@/lib/adminAuth";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const id = query.get("id");
  if (id && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return Response.json({ error: "Ungültiges Gateway" }, { status: 400 });
  const days = Number(query.get("days") || 1);
  const metric = query.get("metric") || "cpu_temperature";
  if (![1, 7, 30, 90, 365, 730].includes(days) || !/^[a-z_]{1,40}$/.test(metric)) return Response.json({ error: "Ungültiger Zeitraum oder Messwert" }, { status: 400 });
  const path = id ? `/api/v1/admin/gateways/${id}?days=${days}&metric=${encodeURIComponent(metric)}` : "/api/v1/admin/gateways";
  try {
    const response = await fetch(`${getBackendUrl()}${path}`, {
      headers: { Authorization: `Bearer ${env.BACKEND_ADMIN_API_KEY}` },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return Response.json({ error: "Gateway-Daten derzeit nicht verfügbar" }, { status: response.status === 404 ? 404 : 502 });
    return Response.json(await response.json(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Gateway-Backend nicht erreichbar" }, { status: 502 });
  }
}
