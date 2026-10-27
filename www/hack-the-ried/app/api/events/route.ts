import { NextRequest, NextResponse } from "next/server";
import { BASELINE_EVENTS } from "@/lib/regionalStats";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const municipality = searchParams.get("municipality");
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const includePast = searchParams.get("include_past") === "true";
  const fromDate = searchParams.get("from_date");
  const toDate = searchParams.get("to_date");

  // Try fetching from backend API
  try {
    const backendUrl = new URL("/api/v1/social/events", env.BACKEND_API_URL);
    if (municipality && municipality !== "all") backendUrl.searchParams.set("municipality", municipality);
    if (category && category !== "all") backendUrl.searchParams.set("category", category);
    if (search) backendUrl.searchParams.set("search", search);
    if (includePast) backendUrl.searchParams.set("include_past", "true");
    if (fromDate) backendUrl.searchParams.set("from_date", fromDate);
    if (toDate) backendUrl.searchParams.set("to_date", toDate);

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json(data);
      }
    }
  } catch {
    // Fall back to baseline
  }

  // Filter BASELINE_EVENTS
  let list = [...BASELINE_EVENTS];
  const now = new Date().toISOString();
  if (!includePast) {
    list = list.filter((e) => (e.end_time || e.start_time) >= now || e.status !== "past");
  }
  if (municipality && municipality !== "all") {
    list = list.filter((e) => e.municipality.toLowerCase() === municipality.toLowerCase());
  }
  if (category && category !== "all") {
    list = list.filter((e) => e.category === category);
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((e) =>
      e.title.toLowerCase().includes(s) ||
      (e.description && e.description.toLowerCase().includes(s)) ||
      e.organizer.toLowerCase().includes(s) ||
      e.venue_name.toLowerCase().includes(s)
    );
  }
  if (fromDate) list = list.filter((e) => e.start_time >= fromDate);
  if (toDate) list = list.filter((e) => e.start_time <= toDate);

  return NextResponse.json(list);
}
