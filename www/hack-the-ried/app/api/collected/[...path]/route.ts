import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(request: Request, { params }: { params: Promise<{path: string[]}> }) {
 const { path } = await params;
 const dataset = path.map(encodeURIComponent).join("/");
 const cacheSeconds = dataset.startsWith("civic/") ? 0 : 30;
 return proxyBackend(`collected/${dataset}?${new URL(request.url).searchParams}`, cacheSeconds);
}
