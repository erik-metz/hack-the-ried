import { proxyBackend } from "@/lib/collectedBackend";
const resources: Record<string, string> = { overview: "overview", companies: "companies", taxes: "taxes", registrations: "registrations", industry: "industry-structure", startups: "startups" };
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const resource = resources[query.get("type") ?? "overview"];
  if (!resource) return Response.json({ error: "Unknown dataset" }, { status: 400 });
  query.delete("type");
  for (const [from, to] of [["municipality", "municipality_id"], ["sector", "industry_sector"], ["region", "region_code"]]) {
    if (query.has(from)) { query.set(to, query.get(from)!); query.delete(from); }
  }
  return proxyBackend(`collected/economy/${resource}?${query}`, 300);
}
