import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getMarketingQrTarget } from "@/lib/marketingQr";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type MarketingQrPageProps = PageProps<"/qr/[id]">;

export default async function MarketingQrPage({ params, searchParams }: MarketingQrPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const target = getMarketingQrTarget(id);

  if (!target) notFound();

  const isAbsoluteTarget = /^https?:\/\//i.test(target);
  const destination = new URL(target, "https://hack-the-ried.de");
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      destination.searchParams.append(key, item);
    }
  }

  redirect(isAbsoluteTarget
    ? destination.toString()
    : `${destination.pathname}${destination.search}${destination.hash}`);
}
