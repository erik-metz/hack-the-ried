import type { NextConfig } from "next";
// Only the public origin is bundled, never server credentials or admin keys.
const liveApiOrigin = new URL(process.env.BACKEND_API_URL ?? "https://hack-the-ried.duckdns.org").origin;
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_LIVE_API_ORIGIN: liveApiOrigin },
  async rewrites() {
    return { beforeFiles: [{
      source: "/api/map-tiles/:layer(base|rain)/:z(\\d+)/:x(\\d+)/:y(\\d+).png",
      destination: `${liveApiOrigin}/api/v1/map-tiles/:layer/:z/:x/:y.png`,
    }, {
      // The combined GeoJSON exceeds Next's data-cache and function-body limits.
      source: "/api/map-layers",
      destination: `${liveApiOrigin}/api/v1/map/collected-layers`,
    }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [{ source: "/((?!pitch(?:/|$)).*)", headers: [{
      key: "Content-Security-Policy",
      // Network boundary for browser data and automatically loaded imagery.
      value: `connect-src 'self' ${liveApiOrigin}/api/v1/movements/ ${liveApiOrigin}/api/v1/satellites/ ${liveApiOrigin}/api/v1/map/ ${liveApiOrigin}/api/v1/collected/civic/; img-src 'self' data: blob: ${liveApiOrigin}/api/v1/map-tiles/ https://td50285-wdw.s3-de.teledata.cloud; font-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'self'`,
    }] }, { source: "/pitch/:path*", headers: [{
      key: "Content-Security-Policy",
      value: "connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self' https://smartcity-system.de https://hack-the-ried.de; object-src 'none'; base-uri 'self'",
    }] }];
  },
};
export default nextConfig;
