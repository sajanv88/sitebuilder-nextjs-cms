// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { AnalyticsSettings } from "@sitebuilder/schema";

// What the security policy opens for the analytics in Settings (proxy.ts), and nothing when there
// are none. Scripts need no host: the consent banner adds them, and 'strict-dynamic' trusts
// what a nonce'd script adds. What they send to does: Google Analytics' collectors, PostHog's
// host and its assets host. Tag Manager runs tags the site can't know, so with it, images and
// requests may go to any https address (scripts are still held to 'strict-dynamic').

export interface AnalyticsSources {
  connect: string[];
  img: string[];
}

const GOOGLE_CONNECT = [
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
];
const GOOGLE_IMG = ["https://*.google-analytics.com", "https://*.googletagmanager.com"];

// PostHog's clouds serve their scripts from a sibling host: us.i.posthog.com, us-assets.i.posthog.com.
function posthogAssets(host: string): string | null {
  const match = /^https:\/\/([a-z]+)\.i\.posthog\.com$/.exec(host);
  return match ? `https://${match[1]}-assets.i.posthog.com` : null;
}

export function analyticsSources(settings: AnalyticsSettings | null): AnalyticsSources {
  const connect = new Set<string>();
  const img = new Set<string>();
  if (!settings) return { connect: [], img: [] };
  if (settings.ga4 || settings.gtm) {
    for (const source of GOOGLE_CONNECT) connect.add(source);
    for (const source of GOOGLE_IMG) img.add(source);
  }
  if (settings.gtm) {
    connect.add("https:");
    img.add("https:");
  }
  if (settings.posthog) {
    connect.add(settings.posthog.host);
    const assets = posthogAssets(settings.posthog.host);
    if (assets) connect.add(assets);
  }
  return { connect: [...connect], img: [...img] };
}
