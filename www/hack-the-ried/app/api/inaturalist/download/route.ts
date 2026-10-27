import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(request: Request) {
  const include = new URL(request.url).searchParams.get("include_duplicates") ?? "false";
  if (!["true", "false"].includes(include)) return Response.json({ error: "Invalid selection" }, { status: 400 });
  return proxyBackend(`environment/measurements/inaturalist/download?include_duplicates=${include}`, 0);
}
