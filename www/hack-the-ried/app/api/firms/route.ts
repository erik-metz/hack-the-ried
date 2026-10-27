import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(request: Request) {
  const days = new URL(request.url).searchParams.get("days") ?? "3";
  if (!/^[123]$/.test(days)) return Response.json({ error: "Invalid day range" }, { status: 400 });
  return proxyBackend(`satellite/firms?days=${days}`, 30);
}
