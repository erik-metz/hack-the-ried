import { proxyBackend } from "@/lib/collectedBackend";
export async function GET() {
  return proxyBackend("satellite/ecostress/scenes", 300);
}
