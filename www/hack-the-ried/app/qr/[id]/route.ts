import { env } from "@/env";
import { getMarketingQrTarget } from "@/lib/marketingQr";
import { after, NextRequest, NextResponse } from "next/server";

const trackedCampaignParams = ["qr", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const target = getMarketingQrTarget(id);
  if (!target) return new NextResponse("Not Found", { status: 404 });

  const destination = new URL(target, "https://hack-the-ried.de");
  const campaign: Record<string, string> = { qr: id };
  for (const key of trackedCampaignParams.slice(1)) {
    const value = request.nextUrl.searchParams.get(key)?.slice(0, 200);
    if (value) campaign[key] = value;
  }
  for (const [key, value] of request.nextUrl.searchParams) {
    if (key === "qr") continue;
    destination.searchParams.append(key, value);
  }

  const referrer = request.headers.get("referer");
  let referrerHost: string | null = null;
  try {
    if (referrer) referrerHost = new URL(referrer).hostname.slice(0, 255);
  } catch {
    // Ignore malformed referrer values.
  }

  after(async () => {
    try {
      const response = await fetch(new URL("/api/v1/qr/scans/record", env.BACKEND_API_URL), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.BACKEND_ADMIN_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          qr_id: id,
          referrer_host: referrerHost,
          user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
          campaign,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) console.error("QR scan event could not be recorded", response.status);
    } catch (error) {
      console.error("QR scan event could not be recorded", error);
    }
  });

  return NextResponse.redirect(destination, { status: 307, headers: { "Cache-Control": "no-store" } });
}
