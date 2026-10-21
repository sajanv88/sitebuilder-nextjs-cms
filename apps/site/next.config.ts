import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// `pnpm dev` reads the repo root .env, as `pnpm db:*` does: `next dev` only looks in the app's
// own folder. Builds and containers get their environment from outside; set values always win.
if (process.env.NODE_ENV !== "production" && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

// Static security headers. The Content-Security-Policy changes per request (it carries a
// nonce), so src/proxy.ts sets it.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const deploymentId = process.env.NEXT_DEPLOYMENT_ID;

// Multi-Zones: this is the main zone. The admin zone (apps/admin) serves these paths, and this
// app forwards them. Rewrites are fixed at build time, so the default is a service name that is
// the same in compose and in every Kubernetes namespace; `pnpm dev` runs the admin on 3001.
const adminZoneUrl = process.env.ADMIN_ZONE_URL ?? "http://localhost:3001";
const adminPaths = [
  "/admin",
  "/admin/:path+",
  "/setup",
  "/api/auth/:path+",
  "/admin-static/:path+",
];
// Everything except the admin paths, so the admin zone's own headers aren't doubled.
const sitePaths = "/:path((?!admin(?:/|$)|setup(?:/|$)|api/auth/|admin-static/).*)";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  poweredByHeader: false,
  // Skew protection across a rolling update: the Dockerfile passes the commit SHA.
  ...(deploymentId ? { deploymentId } : {}),
  sassOptions: {
    loadPaths: ["src/styles"],
  },
  experimental: {
    // Type-check with the project's own tsc: TypeScript 7, the native compiler.
    useTypeScriptCli: true,
  },
  async headers() {
    return [{ source: sitePaths, headers: securityHeaders }];
  },
  async rewrites() {
    return {
      // beforeFiles: checked before this app's own routes, so the public catch-all can never
      // answer an admin path.
      beforeFiles: adminPaths.map((source) => ({
        source,
        destination: `${adminZoneUrl}${source}`,
      })),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
