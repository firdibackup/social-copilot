import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Sigap's PDF reader: pdfjs loads its worker and canvas at run time, which the bundler can't place.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  experimental: {
    agentUpgrade: "security",
    // Three 5 MB Sigap attachments plus multipart overhead; the route validates each file itself.
    proxyClientMaxBodySize: "16mb",
    // Photo uploads: Meta's 8 MB limit plus multipart overhead.
    serverActions: { bodySizeLimit: "9mb" },
  },
  async redirects() {
    return [
      // Studio became part of Buat.
      { source: "/studio", destination: "/buat", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        // CSS Modules use Next's own pipeline; the Tailwind loader emits global CSS.
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
