import { env } from "@/env";
import { unstable_cache } from "next/cache";

export interface Subscriber {
  email: string;
  consented_at: string;
  category: string;
  name?: string | null;
  location?: string | null;
  interest?: string | null;
}

export interface QrScan {
  id: string;
  qr_id: string;
  scanned_at: string;
  referrer_host: string | null;
  user_agent: string | null;
  campaign: Record<string, string>;
}

export interface ScanPage {
  items: QrScan[];
  next_cursor: string | null;
  fetched_at: string;
}

export const SUBSCRIBERS_CACHE_TAG = "admin-subscribers";

async function backendData<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, env.BACKEND_API_URL), {
    headers: { Authorization: `Bearer ${env.BACKEND_ADMIN_API_KEY}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Admin data unavailable");
  return response.json();
}

// Callers must authenticate before reading either cache. Never cache auth decisions.
export const getSubscribers = unstable_cache(async () => ({
  items: await backendData<Subscriber[]>("/api/v1/admin/newsletter/subscribers"),
  fetched_at: new Date().toISOString(),
}), ["admin-subscribers-v1", env.BACKEND_API_URL], {
  revalidate: 60,
  tags: [SUBSCRIBERS_CACHE_TAG],
});

export const getScanPage = unstable_cache(async (before: string, qrId: string, days: number): Promise<ScanPage> => {
  const params = new URLSearchParams({ days: String(days), limit: "100" });
  if (before) params.set("before", before);
  if (qrId) params.set("qr_id", qrId);
  const page = await backendData<Omit<ScanPage, "fetched_at">>(`/api/v1/admin/qr/scans?${params}`);
  return { ...page, fetched_at: new Date().toISOString() };
}, ["admin-qr-scans-v1", env.BACKEND_API_URL], { revalidate: 60 });
