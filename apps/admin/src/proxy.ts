// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";

// The admin screens someone signed out uses: signing in, and getting a password by email.
const SIGNED_OUT = new Set(["/admin/sign-in", "/admin/forgot-password", "/admin/set-password"]);

// A fresh nonce per request, sent as the Content-Security-Policy. Next reads the nonce from
// the request's CSP header and puts it on its own scripts; the root layout reads x-nonce for
// anything else that needs it (nuvui's ScrollArea, next/script).
export function proxy(request: NextRequest) {
  // Convenience only: no session cookie on an admin screen goes straight to sign-in. Whether
  // the cookie is a valid session, and what its user may do, is checked by every page and
  // action (auth/session.ts). Built on SITE_URL: behind the site zone's rewrite, the request's
  // own URL is this zone's internal address.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !SIGNED_OUT.has(pathname) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/admin/sign-in", env().SITE_URL));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // nuvui: ScrollArea's one <style> element takes the nonce; components set style attributes.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Documents only: not route handlers (/api/health, /api/auth and the admin's own under
      // /admin/api/), static files (served under the zone's assetPrefix), image optimisation, or
      // prefetches. Route handlers check the session themselves; leaving them out also keeps
      // uploads clear of the proxy's 10 MB body buffer (decisions #52).
      source: "/((?!api/|admin/api/|_next/static|_next/image|admin-static/|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
