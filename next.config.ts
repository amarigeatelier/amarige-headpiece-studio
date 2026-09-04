import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default 1MB is too small for real photo uploads (cutouts/model photos via admin forms).
      bodySizeLimit: "20mb",
    },
    // Next.js 16 added a separate cap (default 10MB) on request bodies passing through
    // middleware/proxy, independent of serverActions.bodySizeLimit above — without this, a real
    // phone-camera photo upload to any /admin/* form (which middleware.ts's auth check runs on)
    // hits "Unexpected end of form" once the body is truncated at 10MB.
    proxyClientMaxBodySize: "20mb",
  },
};

export default nextConfig;
