// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import createMDX from "@next/mdx";
import type { NextConfig } from "next";

// The documentation: how to use Sitebuilder, one MDX page per feature (src/content), with
// screenshots of the admin taken from a running site. It reads no database and no secrets.

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
  cacheComponents: true,
  typedRoutes: true,
  poweredByHeader: false,
  pageExtensions: ["ts", "tsx", "mdx"],
  ...(deploymentId ? { deploymentId } : {}),
  sassOptions: {
    loadPaths: ["src/styles"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Type-check with the project's own tsc: TypeScript 7, the native compiler.
    useTypeScriptCli: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// No remark or rehype plugins: headings get their ids from mdx-components.tsx, and the pages
// use plain Markdown and the components it maps.
const withMDX = createMDX({ extension: /\.mdx$/ });

export default withMDX(nextConfig);
