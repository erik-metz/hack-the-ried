import { env } from "@/env";
import { getQrGateway, PUBLIC_GATEWAY_METRICS, publicGatewayData } from "@/lib/qrGateways";
import type { GatewayDetails } from "@/lib/gatewayData";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gateway = getQrGateway((await params).id);
  if (!gateway) return Response.json({ error: "Gateway nicht gefunden" }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const days = Number(query.get("days") || 1);
  const metric = query.get("metric") || "cpu_temperature";
  if (![1, 7, 30, 90, 365, 730].includes(days) || !PUBLIC_GATEWAY_METRICS.has(metric)) {
    return Response.json({ error: "Ungültiger Zeitraum oder Messwert" }, { status: 400 });
  }
  const url = new URL(`/api/v1/admin/gateways/${gateway.deviceId}`, env.BACKEND_API_URL);
  url.searchParams.set("days", String(days));
  url.searchParams.set("metric", metric);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.BACKEND_ADMIN_API_KEY}` },
      next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return Response.json({ error: "Gateway-Daten derzeit nicht verfügbar" }, { status: 503 });
    const data = await response.json() as GatewayDetails;
    return Response.json(publicGatewayData(data, gateway.qrId), {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  } catch {
    return Response.json({ error: "Gateway-Daten derzeit nicht verfügbar" }, { status: 503 });
  }
}
