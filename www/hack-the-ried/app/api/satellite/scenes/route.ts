import { proxyBackend } from "@/lib/collectedBackend";

export async function GET() {
  return proxyBackend("satellite/scenes", 300);
}
