import { env } from "@/env";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (
      typeof body?.email !== "string" || body.email.length > 254 ||
      body.consent !== true ||
      (body.name != null && (typeof body.name !== "string" || body.name.length > 100)) ||
      (body.location != null && (typeof body.location !== "string" || body.location.length > 100)) ||
      (body.interest != null && (typeof body.interest !== "string" || body.interest.length > 200))
    ) {
      return NextResponse.json({ error: "Bitte prüfe deine Angaben und bestätige die Einwilligung." }, { status: 400 });
    }

    const response = await fetch(new URL("/api/v1/newsletter/subscribers", env.BACKEND_API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: body.email,
        consent: true,
        category: "sensor-workshop",
        name: body.name,
        location: body.location,
        interest: body.interest,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Die Vormerkung ist gerade nicht möglich. Bitte versuche es später erneut." }, { status: response.status === 422 ? 400 : 503 });
    }
    return NextResponse.json({ success: true, message: "Deine Vormerkung wurde gespeichert. Wir melden uns, sobald es Neuigkeiten zum Sensor-Bau-Workshop gibt." }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Die Vormerkung ist gerade nicht möglich. Bitte versuche es später erneut." }, { status: 503 });
  }
}
