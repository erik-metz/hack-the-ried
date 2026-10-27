import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(request: Request, context: { params: Promise<{ norad: string; kind: string }> }) {
  const { norad, kind } = await context.params;
  if (!/^[1-9][0-9]{0,8}$/.test(norad) || !["history", "orbit"].includes(kind)) return new Response(null, { status: 404 });
  return proxyBackend(`satellites/${norad}/${kind}?${new URL(request.url).searchParams.toString()}`, 0);
}
