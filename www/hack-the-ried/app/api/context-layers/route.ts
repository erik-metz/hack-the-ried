import { isContextLayerId } from "@/lib/contextLayers";
import { referenceProxy } from "@/lib/referenceProxy";

export async function GET(request: Request) {
  const layer = new URL(request.url).searchParams.get("layer") ?? "";
  if (!isContextLayerId(layer)) return Response.json({ error: "Unbekannte Kartenebene" }, { status: 400 });
  return referenceProxy(layer);
}
