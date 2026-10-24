// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, it } from "vitest";
import { analyticsSources } from "./analytics-csp";

// What the security policy opens for each analytics service, and that nothing is opened
// without one.

const none = { ga4: null, gtm: null, searchConsole: null, posthog: null, privacyEntryId: null };

describe("analytics in the security policy", () => {
  it("opens nothing without analytics, or with Search Console alone", () => {
    expect(analyticsSources(null)).toEqual({ connect: [], img: [] });
    expect(analyticsSources({ ...none, searchConsole: "AbCdEf_123-xyz9876" })).toEqual({
      connect: [],
      img: [],
    });
  });

  it("lets Google Analytics send to its collectors only", () => {
    const sources = analyticsSources({ ...none, ga4: "G-ABC123" });
    expect(sources.connect).toContain("https://*.google-analytics.com");
    expect(sources.img).toContain("https://*.googletagmanager.com");
    expect(sources.connect).not.toContain("https:");
  });

  it("opens any https address for Tag Manager, whose tags the site can't know", () => {
    expect(analyticsSources({ ...none, gtm: "GTM-K9X2P4" }).connect).toContain("https:");
  });

  it("lets PostHog send to its host, and load from its cloud's assets host", () => {
    expect(
      analyticsSources({ ...none, posthog: { key: "phc_x", host: "https://eu.i.posthog.com" } })
        .connect,
    ).toEqual(["https://eu.i.posthog.com", "https://eu-assets.i.posthog.com"]);
    expect(
      analyticsSources({ ...none, posthog: { key: "phc_x", host: "https://ph.example.com" } })
        .connect,
    ).toEqual(["https://ph.example.com"]);
  });
});
