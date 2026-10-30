const PREFIXES = ["collected/", "environment/measurements/", "collection/status", "archives", "fuel", "sky", "satellite/"];
export function publicApiUrl(path: string) {
  if (!PREFIXES.some(prefix => prefix.endsWith("/") ? path.startsWith(prefix) : path.split("?")[0] === prefix)
    || /(^|\/)\.\.?($|\/)|%2e|%2f|\\/i.test(path)) throw new Error("Not a public read endpoint");
  return `${process.env.NEXT_PUBLIC_LIVE_API_ORIGIN}/api/v1/${path}`;
}
export async function readPublicResource(path: string, signal: AbortSignal) {
  const startedAt = Date.now();
  const url = new URL(publicApiUrl(path));
  // CORS does not expose X-Data-Expires-At. A fresh collected read plus its
  // safelisted Cache-Control lifetime gives the browser a conservative deadline.
  // The unique query also prevents Nginx from returning an older TTL unchanged.
  if (path.startsWith("collected/")) url.searchParams.set("_snapshot", String(startedAt));
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  if (!response.ok) throw new Error("Public data unavailable");
  const expiry = response.headers.get("x-data-expires-at");
  const maxAge = response.headers.get("cache-control")?.match(/(?:^|[, ])max-age=(\d+)/)?.[1];
  if (path.startsWith("collected/") && !expiry && !maxAge) throw new Error("Missing publication lifetime");
  const expiresAt = Math.min(expiry ? Date.parse(expiry) : Infinity,
    path.startsWith("collected/") && maxAge ? startedAt + Number(maxAge) * 1000 : Infinity);
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) throw new Error("Publication expired");
  const data: unknown = await response.json();
  if (expiresAt <= Date.now()) throw new Error("Publication expired");
  return { data, expiresAt };
}
