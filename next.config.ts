import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Sigap's PDF reader: pdfjs loads its worker and canvas at run time, which the bundler can't place.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  experimental: {
    // Three 5 MB Sigap attachments plus multipart overhead; the route validates each file itself.
    proxyClientMaxBodySize: "16mb",
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
