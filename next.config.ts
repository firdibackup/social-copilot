import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Photo uploads: Meta's 8 MB limit plus multipart overhead.
    serverActions: { bodySizeLimit: "9mb" },
  },
  async redirects() {
    return [{ source: "/", destination: "/kalender", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
