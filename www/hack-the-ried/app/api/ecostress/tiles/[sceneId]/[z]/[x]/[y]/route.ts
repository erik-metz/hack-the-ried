import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(_request: Request, { params }: { params: Promise<{ sceneId: string; z: string; x: string; y: string }> }) {
  const { sceneId, z, x, y } = await params;
  if (!/^ecostress-[a-z0-9-]{1,150}$/.test(sceneId) || ![z, x, y].every(v => /^\d{1,7}$/.test(v))
    || Number(z) > 19 || Number(x) >= 2 ** Number(z) || Number(y) >= 2 ** Number(z)) {
    return Response.json({ error: "Invalid temperature tile" }, { status: 400 });
  }
  return proxyBackend(`satellite/ecostress/tiles/${sceneId}/${z}/${x}/${y}.png`, 300);
}
