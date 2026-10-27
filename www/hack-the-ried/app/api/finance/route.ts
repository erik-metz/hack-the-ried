import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const resource = query.get("type") ?? "budgets";
  if (!["budgets", "spending", "compare"].includes(resource)) return Response.json({ error: "Unknown dataset" }, { status: 400 });
  query.delete("type");
  return proxyBackend(`collected/finance/${resource}?${query}`, 300);
}
