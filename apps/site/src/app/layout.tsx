// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "@nuvui/react/styles.css";
// Every preset is loaded; data-preset on <html> picks one (design §5.4).
import "@nuvui/react/themes/ember.css";
import "@nuvui/react/themes/high-contrast.css";
import "@nuvui/react/themes/ink.css";
import "@nuvui/react/themes/ledger.css";
import "@nuvui/react/themes/meadow.css";
// The video and table blocks, and the moving backdrops of sections and heroes.
import "@nuvui/backgrounds/styles.css";
import "@nuvui/media/styles.css";
import "@nuvui/table/styles.css";
import "@/styles/globals.scss";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { NonceProvider } from "@/components/nonce-provider/nonce-provider";
import { PageBackground } from "@/components/page-background/page-background";
import { getAnalytics, getSite, getTheme } from "@/server/content";
import { themeStylesheet } from "@/server/theme";

// Every page renders per request (below), and the settings live in the database, which the
// build doesn't have: nothing here is prerendered. RequestTime below says so to Next.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const [site, analytics] = await Promise.all([getSite(), getAnalytics()]);
  return {
    metadataBase: new URL(site.siteUrl),
    title: { default: site.title, template: `%s · ${site.title}` },
    ...(site.tagline ? { description: site.tagline } : {}),
    openGraph: { siteName: site.title, locale: site.language },
    alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: site.title }] } },
    // Search Console's site verification: a meta tag, no script, no consent needed.
    ...(analytics?.searchConsole ? { verification: { google: analytics.searchConsole } } : {}),
  };
}

// Every response carries a fresh CSP nonce, so pages render per request instead of from a
// prerendered shell. Data caching with "use cache" still works.
export const instant = false;

// Renders nothing. It tells Next that every page has request-time content, so the metadata
// above waiting for the request is expected rather than something to prerender. In Suspense,
// so it holds nothing else back.
async function RequestTime() {
  await connection();
  return null;
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? "";
  const [site, theme] = await Promise.all([getSite(), getTheme()]);
  const tokens = themeStylesheet(theme.tokens);

  return (
    <html
      lang={site.language}
      data-theme={theme.mode}
      data-density={theme.density}
      {...(theme.preset === "default" ? {} : { "data-preset": theme.preset })}
    >
      <head>
        {tokens ? <style nonce={nonce}>{tokens}</style> : null}
        {/* The site's background, for every page without one of its own (EntryView's). */}
        {theme.pageBackground ? (
          <PageBackground color={theme.pageBackground} theme={theme} nonce={nonce} />
        ) : null}
      </head>
      <body>
        <NonceProvider nonce={nonce}>
          {/* The template's frame is drawn below this, by the /_site layout and the not-found
              page, so the error page here still shows when the template throws. */}
          {children}
          <Suspense>
            <RequestTime />
          </Suspense>
        </NonceProvider>
      </body>
    </html>
  );
}
