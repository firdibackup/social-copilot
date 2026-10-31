import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Mimo's PDF reader: pdfjs loads its worker and canvas at run time, which the bundler can't place.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  experimental: {
    agentUpgrade: "security",
    // Three 5 MB Mimo attachments plus multipart overhead; the route validates each file itself.
    proxyClientMaxBodySize: "16mb",
    // Stored files are compressed below 2 MB, but one Brand grid upload carries several tiles and a raw logo is
    // re-encoded on the server, so the request itself may still be larger.
    serverActions: { bodySizeLimit: "9mb" },
  },
  async redirects() {
    return [
      // Studio became part of Buat.
      { source: "/studio", destination: "/buat", permanent: true },
      // Mimo is the new name for the AI chat; Next preserves the query string.
      { source: "/sigap", destination: "/mimo", permanent: true },
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

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
