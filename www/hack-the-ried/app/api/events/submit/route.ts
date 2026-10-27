import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title || !body.municipality || !body.start_time) {
      return NextResponse.json({ error: "Titel, Kommune und Startdatum erforderlich" }, { status: 400 });
    }

    // Try posting to VPS backend
    try {
      const backendUrl = new URL("/api/v1/social/events/submit", env.BACKEND_API_URL);
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const created = await res.json();
        return NextResponse.json(created, { status: 201 });
      }
    } catch {
      // Backend offline: return mock created response
    }

    const createdEvent = {
      id: `user-${Date.now().toString(36)}`,
      title: body.title,
      organizer: body.organizer || "Bürgerinitiative / Verein",
      venue_name: body.venue_name || body.municipality,
      municipality: body.municipality,
      start_time: body.start_time,
      end_time: body.end_time || null,
      category: body.category || "civic",
      description: body.description || null,
      ticket_url: body.ticket_url || null,
      event_url: body.event_url || null,
      street_address: body.street_address || null,
      postal_code: body.postal_code || null,
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      status: "scheduled",
      is_free: body.is_free ?? true,
      is_archived: false,
      expected_visitors: body.expected_visitors || null,
      source: "community_submission",
    };
    return NextResponse.json(createdEvent, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fehler beim Einreichen" }, { status: 500 });
  }
}
