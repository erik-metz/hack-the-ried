import { isAuthenticated } from "@/lib/adminAuth";
import { getScanPage } from "@/lib/adminOverview";
import { NextRequest, NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
  const params = request.nextUrl.searchParams;
  const before = params.get("before") ?? "";
  const qrId = params.get("qr_id") ?? "";
  const days = params.get("days") ?? "0";
  if ((before && (!/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > BigInt("9223372036854775807")))
    || (qrId && !/^(?:[1-9]|10)$/.test(qrId)) || !["0", "30", "90", "365"].includes(days)) {
    return NextResponse.json({ error: "Ungültiger Filter." }, { status: 400, headers });
  }
  try {
    return NextResponse.json(await getScanPage(before, qrId, Number(days)), { headers });
  } catch {
    return NextResponse.json({ error: "QR-Code-Scans konnten nicht geladen werden." }, { status: 503, headers });
  }
}
