import { proxyBackend } from "@/lib/collectedBackend";
export async function GET() { return proxyBackend("collected/infrastructure/wifi", 300); }
