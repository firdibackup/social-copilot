import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Photo uploads: Meta's 8 MB limit plus multipart overhead.
    serverActions: { bodySizeLimit: "9mb" },
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/kalender",
        permanent: false,
        // Instagram's OAuth return lands on `/`; src/proxy.ts hands it to the callback route.
        missing: [
          { type: "query", key: "code" },
          { type: "query", key: "error" },
        ],
      },
      // Studio became part of Buat.
      { source: "/studio", destination: "/buat", permanent: true },
    ];
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
