import { proxyBackend } from "@/lib/collectedBackend";
export async function GET(request: Request) {
  return proxyBackend(`collected/elections?${new URL(request.url).searchParams}`, 300);
}
