import { proxyBackend } from "@/lib/collectedBackend";
export async function GET() { return proxyBackend("map/collected-layers", 30); }
