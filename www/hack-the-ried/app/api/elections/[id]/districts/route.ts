import { fetchElectionDistricts } from "@/lib/electionsData";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const data = await fetchElectionDistricts(id);
  if (!data) {
    return NextResponse.json({ error: "Districts not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
