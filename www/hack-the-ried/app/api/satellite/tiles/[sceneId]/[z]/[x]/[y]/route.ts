import { proxyBackend } from "@/lib/collectedBackend";
import { type NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string; z: string; x: string; y: string }> }
) {
  const { sceneId, z, x, y } = await params;
  if (!/^[a-zA-Z0-9_\-]+$/.test(sceneId) || !/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+\.png$/.test(y)) {
    return new Response(null, { status: 404 });
  }
  const layer = request.nextUrl.searchParams.get("layer") === "ndvi" ? "ndvi" : "rgb";
  return proxyBackend(`satellite/tiles/${sceneId}/${z}/${x}/${y}?layer=${layer}`, 86400);
}
