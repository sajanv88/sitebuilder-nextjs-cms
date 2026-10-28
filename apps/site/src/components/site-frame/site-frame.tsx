// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { hasTrackers, SEARCH_PATH } from "@sitebuilder/schema";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ConsentBanner } from "@/components/consent-banner/consent-banner";
import {
  getAnalytics,
  getEntry,
  getReadingSettings,
  getSite,
  getSiteMenu,
  getTheme,
} from "@/server/content";
import { menuItems, siteInfo } from "@/server/layout-props";
import { activeTemplate } from "@/server/template";

// The active template's Site layout, its header, footer and frame, around a page, with the
// template's stylesheets, then the site's own custom CSS, and the analytics consent banner when
// there are analytics. Drawn below the root layout (by the /_site layout, and by the not-found
// page, which sits outside it), so the root error page still shows when a template's layout
// throws (decisions #118). The editor's canvas passes the page's own address, and has no
// banner: nothing there is a visit.
export async function SiteFrame({
  currentPath,
  children,
}: {
  currentPath?: string;
  children: ReactNode;
}) {
  // The address the visitor asked for, before the proxy rewrote it (src/proxy.ts).
  const requestHeaders = await headers();
  const path = currentPath ?? requestHeaders.get("x-site-path") ?? "/";
  const [site, primary, footer, template, theme, analytics, reading] = await Promise.all([
    getSite(),
    getSiteMenu("primary"),
    getSiteMenu("footer"),
    activeTemplate(),
    getTheme(),
    getAnalytics(),
    getReadingSettings(),
  ]);
  const consent =
    currentPath === undefined && analytics && hasTrackers(analytics) ? analytics : null;
  // A privacy page that's published: a link to anything else would be a dead end.
  const privacy = consent?.privacyEntryId ? await getEntry(consent.privacyEntryId) : undefined;
  // Checked again (it goes into the page as it is): nothing with "<" in it.
  const customCss = theme.customCss.includes("<") ? "" : theme.customCss;
  const Site = template.layouts.site;
  return (
    <>
      {/* After every stylesheet of the site's own (decisions #110). */}
      {template.stylesheets.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="template" />
      ))}
      {/* After the template's: React orders stylesheets by precedence as it first meets each,
          so "custom" comes after "template" and its rules win where both match equally. */}
      {customCss.trim() ? (
        <style
          href="sitebuilder-custom-css"
          precedence="custom"
          nonce={requestHeaders.get("x-nonce") ?? ""}
        >
          {customCss}
        </style>
      ) : null}
      <Site
        site={siteInfo(site)}
        menus={{ primary: menuItems(primary), footer: menuItems(footer) }}
        currentPath={path}
        searchPath={reading.search ? SEARCH_PATH : null}
        options={template.options}
      >
        {children}
      </Site>
      {consent ? (
        <ConsentBanner
          trackers={{ ga4: consent.ga4, gtm: consent.gtm, posthog: consent.posthog }}
          names={[
            ...(consent.ga4 ? ["Google Analytics"] : []),
            ...(consent.gtm ? ["Google Tag Manager"] : []),
            ...(consent.posthog ? ["PostHog"] : []),
          ]}
          privacyPath={privacy?.path ?? null}
        />
      ) : null}
    </>
  );
}
