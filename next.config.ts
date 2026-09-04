import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Next.js's bundler traces sharp into the serverless function bundle without its
  // Linux native binary (libvips), so /api/preview crashes in production with ERR_DLOPEN_FAILED —
  // confirmed directly from Vercel's runtime logs. This tells Next.js to leave sharp as a normal
  // node_modules require at runtime instead, so Vercel's file tracer picks up the native files.
  serverExternalPackages: ["sharp"],
  // serverExternalPackages alone wasn't enough (verified: identical ERR_DLOPEN_FAILED after
  // deploying it) — Next's own file tracer still wasn't picking up sharp's Linux native binary
  // (libvips-cpp.so) into the deployed function bundle. Force-include it explicitly.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@img/sharp-linux-x64/**/*", "./node_modules/@img/sharp-libvips-linux-x64/**/*"],
  },
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
