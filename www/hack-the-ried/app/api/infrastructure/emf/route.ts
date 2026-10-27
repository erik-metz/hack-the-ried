import { proxyBackend } from "@/lib/collectedBackend";

export async function GET() {
  return proxyBackend("infrastructure/emf", 300);
}
