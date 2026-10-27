import { proxyBackend } from "@/lib/collectedBackend";

export async function GET() {
  return proxyBackend("collected/transport/bahn/stations", 300);
}
