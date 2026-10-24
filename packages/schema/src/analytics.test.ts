// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { AnalyticsInput, AnalyticsSettings, analyticsService, hasTrackers } from "./analytics";

const form = (over: Partial<Record<string, string>> = {}) => ({
  service: "none",
  ga4: "",
  gtm: "",
  searchConsole: "",
  posthogKey: "",
  posthogRegion: "eu",
  posthogHost: "",
  privacyEntryId: "",
  ...over,
});
const KEY = "phc_0123456789abcdefABCDEF";

describe("analytics settings", () => {
  it("are all optional: no service is no trackers", () => {
    const empty = v.parse(AnalyticsInput, form());
    expect(empty).toEqual({
      ga4: null,
      gtm: null,
      searchConsole: null,
      posthog: null,
      privacyEntryId: null,
    });
    expect(hasTrackers(empty)).toBe(false);
    expect(analyticsService(empty)).toBe("none");
  });

  it("keep only the chosen service, whatever else the form still holds", () => {
    const parsed = v.parse(
      AnalyticsInput,
      form({ service: "gtm", ga4: "G-ABC123XYZ", gtm: "gtm-k9x2p4", posthogKey: KEY }),
    );
    expect(parsed).toMatchObject({ ga4: null, gtm: "GTM-K9X2P4", posthog: null });
    expect(analyticsService(parsed)).toBe("gtm");
  });

  it("need the chosen service's id", () => {
    for (const service of ["ga4", "gtm", "posthog"]) {
      expect(v.is(AnalyticsInput, form({ service }))).toBe(false);
    }
    expect(v.is(AnalyticsInput, form({ service: "fathom" }))).toBe(false);
  });

  it("take Google's ids in any case, and Search Console's whole meta tag", () => {
    const parsed = v.parse(
      AnalyticsInput,
      form({
        service: "ga4",
        ga4: " g-abc123xyz ",
        searchConsole: '<meta name="google-site-verification" content="AbCdEf_123-xyz9876" />',
      }),
    );
    expect(parsed).toMatchObject({ ga4: "G-ABC123XYZ", searchConsole: "AbCdEf_123-xyz9876" });
    // Search Console alone isn't a tracker: no banner for it.
    expect(hasTrackers({ ...parsed, ga4: null })).toBe(false);
  });

  it("put PostHog in the chosen cloud, or at an https address of the site's own", () => {
    expect(v.parse(AnalyticsInput, form({ service: "posthog", posthogKey: KEY })).posthog).toEqual({
      key: KEY,
      host: "https://eu.i.posthog.com",
    });
    const own = { service: "posthog", posthogKey: KEY, posthogRegion: "custom" };
    expect(
      v.parse(AnalyticsInput, form({ ...own, posthogHost: "https://ph.example.com/" })).posthog,
    ).toEqual({ key: KEY, host: "https://ph.example.com" });
    for (const host of ["http://ph.example.com", "https://ph.example.com/x", "https://localhost"]) {
      expect(v.is(AnalyticsInput, form({ ...own, posthogHost: host }))).toBe(false);
    }
  });

  it("refuse anything that isn't the service's own shape", () => {
    expect(v.is(AnalyticsInput, form({ service: "ga4", ga4: "UA-12345-1" }))).toBe(false);
    expect(v.is(AnalyticsInput, form({ service: "gtm", gtm: "GTM-<script>" }))).toBe(false);
    expect(v.is(AnalyticsInput, form({ service: "posthog", posthogKey: "sk_live_x" }))).toBe(false);
    expect(v.is(AnalyticsInput, form({ searchConsole: 'x" onload="alert(1)' }))).toBe(false);
    expect(
      v.is(AnalyticsSettings, {
        ga4: "G-ABC123",
        gtm: null,
        searchConsole: null,
        posthog: { key: "phc_0123456789abcdef", host: "https://evil.example.com/path" },
        privacyEntryId: null,
      }),
    ).toBe(false);
  });
});
