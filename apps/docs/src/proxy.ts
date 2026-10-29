// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { type NextRequest, NextResponse } from "next/server";
import { ALL_PAGES, hrefOf } from "@/docs/nav";

// Two jobs, before anything renders:
//
// 1. An address that's no page of the docs is rewritten to one no route matches, which Next
//    answers with not-found.tsx and a real 404. A page can't set its own status: the layout's
//    shell starts the response before the page runs, so its notFound() would stream a 200.
// 2. A fresh nonce per request, sent as the Content-Security-Policy. Next reads the nonce from
//    the request's CSP header and puts it on its own scripts. The docs load nothing from
//    elsewhere: their pictures are files of their own.

const ADDRESSES = new Set(["/", ...ALL_PAGES.map((page) => hrefOf(page.slug))]);

// Three segments: neither / nor /[section]/[page] matches it.
const MISSING = "/_missing/_missing/_missing";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // nuvui: components set style attributes.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = ADDRESSES.has(request.nextUrl.pathname)
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.rewrite(new URL(MISSING, request.url), {
        request: { headers: requestHeaders },
      });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Documents only: not the health check, static files, image optimisation or prefetches.
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
