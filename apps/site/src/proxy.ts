// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { db, getSettings, type PublicRoute, resolveRoute } from "@sitebuilder/db";
import type { AnalyticsSettings } from "@sitebuilder/schema";
import { type NextRequest, NextResponse } from "next/server";
import { type AnalyticsSources, analyticsSources } from "@/lib/analytics-csp";

// Two jobs, before anything renders (decisions #65):
//
// 1. Routing. Each page request's path is resolved against the database (one indexed lookup,
//    plus the reading settings) and rewritten to an internal route under /_site/, or answered
//    with a redirect. A path that's nothing is rewritten to one no route matches, which Next
//    answers with the not-found page and a real 404. A page can't set its own status: the
//    root layout's shell starts the response before the page runs.
// 2. A fresh nonce per request, sent as the Content-Security-Policy. Next reads the nonce from
//    the request's CSP header and puts it on its own scripts; the root layout reads x-nonce for
//    anything else that needs it (the theme's <style>, nuvui's ScrollArea).

// Matches no route, so Next renders not-found.tsx with status 404.
const MISSING = "/_site/missing";

function internalPath(route: PublicRoute, path: string, preview: boolean): string | null {
  // Draft mode: what isn't public may be the viewer's draft. The preview route checks the
  // session and the viewer's permission itself.
  if (preview && route.kind === "missing") return `/_site/preview${path}`;
  switch (route.kind) {
    case "home":
      return "/_site/home";
    case "entry":
      return `/_site/entry/${route.id}`;
    case "posts":
      return `/_site/posts/${route.page}`;
    case "term":
      return `/_site/term/${route.termId}/${route.page}`;
    case "search":
      return "/_site/search";
    case "missing":
      return MISSING;
    case "redirect":
      return null;
  }
}

// The editor's canvas (app/%5Fcanvas): the one page another page may frame, and then only a page
// of the site's own (the admin's editor). It checks the session itself, and is never a public
// path: page slugs can't start with "_".
const CANVAS = "/_canvas/";

// The analytics in Settings, for the policy: read at most every 30 seconds per process, so a
// change reaches every page within half a minute without a query on each request. A database
// that can't be read keeps what was last read.
const ANALYTICS_TTL_MS = 30_000;
let analytics: { at: number; value: AnalyticsSettings | null } | null = null;

async function readAnalytics(): Promise<AnalyticsSettings | null> {
  if (analytics && Date.now() - analytics.at < ANALYTICS_TTL_MS) return analytics.value;
  try {
    analytics = { at: Date.now(), value: (await getSettings(db, "analytics")) ?? null };
  } catch (error) {
    console.error("proxy: reading the analytics settings failed", error);
    analytics = { at: Date.now(), value: analytics?.value ?? null };
  }
  return analytics.value;
}

const NONE: AnalyticsSources = { connect: [], img: [] };

function contentSecurityPolicy(
  nonce: string,
  framed: boolean,
  extra: AnalyticsSources = NONE,
): string {
  const isDev = process.env.NODE_ENV === "development";
  const more = (sources: string[]) => (sources.length ? ` ${sources.join(" ")}` : "");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // The theme's <style> and nuvui's ScrollArea take the nonce; components set style attributes.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' blob: data:${more(extra.img)}`,
    "media-src 'self'",
    "font-src 'self'",
    `connect-src 'self'${more(extra.connect)}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${framed ? "'self'" : "'none'"}`,
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  if (path.startsWith(CANVAS)) {
    const csp = contentSecurityPolicy(nonce, true);
    requestHeaders.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  }

  let route: PublicRoute;
  try {
    route = await resolveRoute(db, path);
  } catch (error) {
    // The database is down: the page can't be drawn either. Let it render the error page.
    console.error("proxy: resolving a path failed", error);
    route = { kind: "missing" };
  }

  if (route.kind === "redirect") {
    const target = new URL(route.to, request.nextUrl);
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, route.status);
  }

  // The consent banner loads the analytics a visitor accepts; the policy lets them send.
  const csp = contentSecurityPolicy(nonce, false, analyticsSources(await readAnalytics()));
  requestHeaders.set("x-site-path", path);
  requestHeaders.set("Content-Security-Policy", csp);

  // Draft mode and a session: only then is a preview possible, and the preview route checks
  // both for real. Anyone else gets a true 404 for what isn't public.
  const preview =
    request.cookies.has("__prerender_bypass") &&
    (request.cookies.has("__Secure-better-auth.session_token") ||
      request.cookies.has("better-auth.session_token"));
  const destination = new URL(internalPath(route, path, preview) ?? MISSING, request.nextUrl);
  destination.search = request.nextUrl.search;
  const response = NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only: not route handlers (/api/*, /media/<key>, /feed.xml), Next's files, the
    // metadata routes, or the admin zone's paths, which it answers with its own CSP.
    "/((?!api/|media/|_next/|_templates/|favicon.ico|robots.txt|sitemap.xml|feed.xml|admin(?:/|$)|setup(?:/|$)|admin-static/).*)",
  ],
};
