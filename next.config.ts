import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default 1MB is too small for real photo uploads (cutouts/model photos via admin forms).
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
