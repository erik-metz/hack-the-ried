import { env } from "@/env";
import { isAuthenticated } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function backendUrl(path: string) {
  return new URL(path, env.BACKEND_API_URL);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.email !== "string" || body.email.length > 254 || body.consent !== true) {
      return NextResponse.json({ error: "Bitte gib eine gültige E-Mail-Adresse ein und stimme dem Newsletter zu." }, { status: 400 });
    }
    if (typeof body.website === "string" && body.website.length > 0) {
      return NextResponse.json({ success: true });
    }

    const response = await fetch(backendUrl("/api/v1/newsletter/subscribers"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, consent: true, category: body.category, name: body.name, location: body.location, interest: body.interest }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const message = response.status === 422
        ? "Bitte gib eine gültige E-Mail-Adresse ein."
        : "Die Anmeldung ist gerade nicht möglich. Bitte versuche es später erneut.";
      return NextResponse.json({ error: message }, { status: response.status === 422 ? 400 : 503 });
    }
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Die Anmeldung ist gerade nicht möglich. Bitte versuche es später erneut." }, { status: 503 });
  }
}

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  try {
    const response = await fetch(backendUrl("/api/v1/admin/newsletter/subscribers"), {
      headers: { Authorization: `Bearer ${env.BACKEND_ADMIN_API_KEY}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return NextResponse.json({ error: "Adressen konnten nicht geladen werden." }, { status: 503 });
    const subscribers: { email: string; consented_at: string; category: string; name?: string | null; location?: string | null; interest?: string | null }[] = await response.json();
    const csvCell = (value: string) => {
      const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = ["E-Mail;Kategorie;Name;Ort;Interesse;Anmeldung am", ...subscribers.map(({ email, consented_at, category, name, location, interest }) => [email, category, name ?? "", location ?? "", interest ?? "", new Date(consented_at).toISOString()].map(csvCell).join(";"))].join("\r\n");
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="hacktheried-anmeldungen.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Adressen konnten nicht geladen werden." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body?.email !== "string" || body.email.length > 254) {
      return NextResponse.json({ error: "Ungültige E-Mail-Adresse." }, { status: 400 });
    }
    const response = await fetch(backendUrl("/api/v1/admin/newsletter/subscribers"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.BACKEND_ADMIN_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return NextResponse.json({ error: "Adresse konnte nicht entfernt werden." }, { status: 503 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Adresse konnte nicht entfernt werden." }, { status: 503 });
  }
}
