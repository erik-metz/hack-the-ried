import { env } from "@/env";

function unexpired(response: Response) {
  const expires = response.headers.get("x-data-expires-at");
  return !expires || Date.parse(expires) > Date.now();
}

/** Only the VPS may supply domain data. The shared Next cache contains DB responses. */
export async function collectedFetch(input: URL | string, _init?: RequestInit) {
  const url = new URL(input, env.BACKEND_API_URL);
  const base = new URL(env.BACKEND_API_URL);
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/v1/")) {
    throw new Error("Data requests must use the VPS API");
  }
  url.pathname = url.pathname.replace("/api/v1/", "/api/v1/collected/");
  // The complete event archive can exceed Next.js's per-entry cache limit.
  const response = await fetch(url, url.pathname === "/api/v1/collected/social/events"
    ? { cache: "no-store", signal: AbortSignal.timeout(10000) }
    : { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) });
  if (!unexpired(response)) throw new Error("Stored data expired");
  return response;
}

export async function readCollected<T>(dataset: string, seconds = 300): Promise<T> {
  const response = await fetch(new URL(`/api/v1/collected/${dataset}`, env.BACKEND_API_URL), {
    // The combined offers can change as an individual source expires.
    ...(dataset === "social/regular-offers" ? { cache: "no-store" as const } : { next: { revalidate: seconds } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok || !unexpired(response)) throw new Error("Collected data unavailable");
  return response.json() as Promise<T>;
}

export async function proxyBackend(path: string, seconds = 5) {
  try {
    const timeoutMs = seconds === 0 ? 30000 : 10000;
    const response = await fetch(new URL(`/api/v1/${path}`, env.BACKEND_API_URL), {
      next: { revalidate: seconds }, signal: AbortSignal.timeout(timeoutMs),
    });
    if (!unexpired(response)) throw new Error("Stored data expired");
    const headers = new Headers();
    for (const key of ["content-type", "content-disposition", "etag", "x-source-updated-at", "x-collected-at", "x-data-source", "x-data-expires-at"]) {
      const value = response.headers.get(key);
      if (value) headers.set(key, value);
    }
    const upstream = response.headers.get("cache-control") ?? "";
    const maxAge = upstream.match(/(?:^|[, ])max-age=(\d+)/)?.[1];
    const expiry = response.headers.get("x-data-expires-at");
    const ttl = Math.max(0, Math.min(seconds, maxAge ? Number(maxAge) : seconds,
      expiry ? Math.floor((Date.parse(expiry) - Date.now()) / 1000) : seconds));
    headers.set("Cache-Control", response.ok && !upstream.includes("no-store") ? `public, max-age=${ttl}, s-maxage=${ttl}` : "no-store");
    return new Response(await response.arrayBuffer(), { status: response.status, headers });
  } catch {
    return Response.json({ error: "Backend data unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
