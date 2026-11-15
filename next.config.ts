import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Up to 4 photos, already shrunk in the browser before upload.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
