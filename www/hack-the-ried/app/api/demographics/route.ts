import { proxyBackend } from "@/lib/collectedBackend";
const routes: Record<string,string> = {"summary": "summary", "facilities": "facilities", "commuters": "commuters"};
export async function GET(request: Request) {
 const query = new URL(request.url).searchParams;
 const resource = routes[query.get("type") ?? "summary"];
 if (!resource) return Response.json({error:"Unknown dataset"}, {status:400});
 query.delete("type");
 return proxyBackend(`collected/demographics/${resource}?${query}`, 300);
}
