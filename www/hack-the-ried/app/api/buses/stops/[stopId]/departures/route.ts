import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(request: Request, { params }: { params: Promise<{stopId:string}> }) {
 const {stopId} = await params;
 const source = new URL(request.url).searchParams.get("source");
 const query = source ? `?source=${encodeURIComponent(source)}` : "";
 return proxyBackend(`transport/stops/${encodeURIComponent(stopId)}/departures${query}`,10);
}
