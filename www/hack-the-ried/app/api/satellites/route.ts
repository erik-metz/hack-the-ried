import { proxyBackend } from "@/lib/collectedBackend";
export async function GET() { return proxyBackend("satellites/latest", 0); }
