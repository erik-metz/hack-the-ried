import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(_request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  if (!/^ecostress-[a-z0-9-]{1,150}$/.test(sceneId)) {
    return Response.json({ error: "Invalid scene" }, { status: 400 });
  }
  return proxyBackend(`satellite/ecostress/crop/${encodeURIComponent(sceneId)}.npz`, 300);
}
