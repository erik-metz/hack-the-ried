import { proxyBackend } from "@/lib/collectedBackend";
export async function GET() { return proxyBackend("collected/infrastructure/road-conditions", 300); }
