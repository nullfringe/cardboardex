import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Use the compiler API so builds work in sandboxes that disallow detached
  // subprocess groups; this still performs Next's full TypeScript validation.
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
