import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/((?!pitch(?:/|$)).*)", headers: [{
      key: "Content-Security-Policy",
      // Network boundary for browser data and automatically loaded imagery.
      value: "connect-src 'self'; img-src 'self' data: blob: https://td50285-wdw.s3-de.teledata.cloud; font-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'self'",
    }] }, { source: "/pitch/:path*", headers: [{
      key: "Content-Security-Policy",
      value: "connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self' https://smartcity-system.de https://hack-the-ried.de; object-src 'none'; base-uri 'self'",
    }] }];
  },
};
export default nextConfig;
