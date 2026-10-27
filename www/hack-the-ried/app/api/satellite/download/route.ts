import { proxyBackend } from "@/lib/collectedBackend";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const start = search.get("start") || "";
  const end = search.get("end") || "";
  const layer = search.get("layer") || "rgb";
  const format = search.get("format") || "zip";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return Response.json(
      { error: "Bitte ein gültiges Start- und Enddatum im Format YYYY-MM-DD wählen." },
      { status: 400 }
    );
  }

  if (start > end) {
    return Response.json(
      { error: "Das Startdatum muss vor oder am Enddatum liegen." },
      { status: 400 }
    );
  }

  const query = new URLSearchParams({ start, end, layer, format }).toString();
  return proxyBackend(`satellite/download?${query}`, 0);
}
