import { proxyBackend } from "@/lib/collectedBackend";

export async function GET() {
  return proxyBackend("map/sensors", 5);
}
