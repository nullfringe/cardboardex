import type { NextConfig } from "next";

import { getSecurityHeaders } from "./src/lib/security/security-headers";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders({
          development: process.env.NODE_ENV !== "production",
        }),
      },
    ];
  },
  // Use the compiler API so builds work in sandboxes that disallow detached
  // subprocess groups; this still performs Next's full TypeScript validation.
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
