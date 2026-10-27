import { proxyBackend } from "@/lib/collectedBackend";
export async function GET() { return proxyBackend("collected/traffic/street-closures", 60); }
