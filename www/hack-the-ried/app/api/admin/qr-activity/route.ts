import { isAuthenticated } from "@/lib/adminAuth";
import { getScanActivity } from "@/lib/adminOverview";
import { NextRequest, NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
  const days = request.nextUrl.searchParams.get("days") ?? "30";
  if (!["30", "90", "365"].includes(days)) return NextResponse.json({ error: "Ungültiger Zeitraum." }, { status: 400, headers });
  try {
    return NextResponse.json(await getScanActivity(Number(days)), { headers });
  } catch {
    return NextResponse.json({ error: "QR-Statistik konnte nicht geladen werden." }, { status: 503, headers });
  }
}
