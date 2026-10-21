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

const nextConfig: NextConfig = {
  output: "standalone",
  // Admin zone (Next.js Multi-Zones): the site zone forwards /admin, /setup, /api/auth and this
  // prefix here, so the admin's JS and CSS can't collide with the site zone's /_next files.
  assetPrefix: "/admin-static",
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
    // Each icon is its own module; this prunes the unused ones in development too.
    optimizePackageImports: ["@nuvui/icons"],
    // Every admin screen reads the session and renders per request (the root layout's nonce,
    // instant = false). Validate instant navigation only where a segment asks for it with
    // `instant`, instead of flagging every page in development (decisions #43).
    instantInsights: { validationLevel: "manual-warning" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
