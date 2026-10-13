import type { NextConfig } from "next";

// Cache Components is intentionally disabled: every page in this app is
// per-user financial data that must reflect the latest write immediately.
// Pages read the session cookie and are therefore rendered dynamically.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The browser test suite runs its own dev server next to `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // CSV imports and gzipped backup restores (Vercel caps request bodies at 4.5 MB).
    serverActions: { bodySizeLimit: "4mb" },
  },
  serverExternalPackages: ["postgres", "exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
