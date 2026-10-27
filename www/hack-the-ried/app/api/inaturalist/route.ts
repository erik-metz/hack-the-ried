import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offset = params.get("offset") ?? "0";
  const include = params.get("include_duplicates") ?? "false";
  if (!/^\d{1,4}$/.test(offset) || Number(offset) > 2000 || !["true", "false"].includes(include)) {
    return Response.json({ error: "Invalid selection" }, { status: 400 });
  }
  return proxyBackend(`environment/measurements/inaturalist?offset=${offset}&include_duplicates=${include}`, 0);
}
