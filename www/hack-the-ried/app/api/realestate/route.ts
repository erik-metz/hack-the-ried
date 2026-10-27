import { proxyBackend } from "@/lib/collectedBackend";
const routes: Record<string,string> = {"summary": "summary", "housing-stock": "housing-stock", "boris": "boris", "construction": "construction-activity", "benchmarks": "market-benchmarks", "development-plans": "development-plans"};
export async function GET(request: Request) {
 const query = new URL(request.url).searchParams;
 const resource = routes[query.get("type") ?? "summary"];
 if (!resource) return Response.json({error:"Unknown dataset"}, {status:400});
 query.delete("type");
 return proxyBackend(`collected/realestate/${resource}?${query}`, 300);
}
