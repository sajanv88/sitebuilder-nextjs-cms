// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "@nuvui/react/styles.css";
// Every preset is loaded; data-preset on <html> picks one (design §5.4).
import "@nuvui/react/themes/ember.css";
import "@nuvui/react/themes/high-contrast.css";
import "@nuvui/react/themes/ink.css";
import "@nuvui/react/themes/ledger.css";
import "@nuvui/react/themes/meadow.css";
// The video and table blocks.
import "@nuvui/media/styles.css";
import "@nuvui/table/styles.css";
import "@/styles/globals.scss";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NonceProvider } from "@/components/nonce-provider/nonce-provider";
import { SiteFooter } from "@/components/site-footer/site-footer";
import { SiteHeader } from "@/components/site-header/site-header";
import { getSite, getSiteMenu, getTheme } from "@/server/content";
import { themeStylesheet } from "@/server/theme";

// Every page renders per request (below), and the settings live in the database, which the
// build doesn't have: nothing here is prerendered.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const site = await getSite();
  return {
    metadataBase: new URL(site.siteUrl),
    title: { default: site.title, template: `%s · ${site.title}` },
    ...(site.tagline ? { description: site.tagline } : {}),
    openGraph: { siteName: site.title, locale: site.language },
    alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: site.title }] } },
  };
}

// Every response carries a fresh CSP nonce, so pages render per request instead of from a
// prerendered shell. Data caching with "use cache" still works.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? "";
  // The address the visitor asked for, before the proxy rewrote it (src/proxy.ts).
  const path = requestHeaders.get("x-site-path") ?? "/";
  const [site, theme, primary, footer] = await Promise.all([
    getSite(),
    getTheme(),
    getSiteMenu("primary"),
    getSiteMenu("footer"),
  ]);
  const tokens = themeStylesheet(theme.tokens);

  return (
    <html
      lang={site.language}
      data-theme={theme.mode}
      data-density={theme.density}
      {...(theme.preset === "default" ? {} : { "data-preset": theme.preset })}
    >
      <head>{tokens ? <style nonce={nonce}>{tokens}</style> : null}</head>
      <body>
        <NonceProvider nonce={nonce}>
          <div className="site">
            <SiteHeader title={site.title} items={primary} currentPath={path} />
            <main id="content" className="site__main">
              {children}
            </main>
            <SiteFooter title={site.title} tagline={site.tagline} items={footer} />
          </div>
        </NonceProvider>
      </body>
    </html>
  );
}
