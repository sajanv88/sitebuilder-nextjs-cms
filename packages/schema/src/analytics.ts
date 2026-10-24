// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { Uuid } from "./shared";

// Settings → Analytics: one service the site sends visits to (Google Analytics 4, Google Tag
// Manager or PostHog), and Google Search Console's verification. Each is optional; no
// `analytics` row means none. The trackers load
// on the public site only after a visitor accepts them in the consent banner; Search Console's
// verification is a meta tag and needs no consent. Every value ends up in the page or in the
// security policy, so each is held to the exact shape the service gives out.

const GA4 = /^G-[A-Z0-9]{4,16}$/;
const GTM = /^GTM-[A-Z0-9]{4,12}$/;
const VERIFICATION = /^[A-Za-z0-9_-]{10,100}$/;
const POSTHOG_KEY = /^phc_[A-Za-z0-9]{16,64}$/;

// PostHog's two clouds, or an address of the site's own that passes requests on to one (a
// reverse proxy, which ad blockers leave alone): https, a host and an optional port, no path.
export const POSTHOG_HOSTS = {
  us: "https://us.i.posthog.com",
  eu: "https://eu.i.posthog.com",
} as const;
const ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/;
const BLOCKED = /^https:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i;

export const PosthogHost = v.pipe(
  v.string(),
  v.regex(ORIGIN, "Use an https address without a path, such as https://ph.example.com"),
  v.check((s) => !BLOCKED.test(s), "Use an address on the internet"),
);

export const AnalyticsSettings = v.object({
  ga4: v.nullable(v.pipe(v.string(), v.regex(GA4))),
  gtm: v.nullable(v.pipe(v.string(), v.regex(GTM))),
  searchConsole: v.nullable(v.pipe(v.string(), v.regex(VERIFICATION))),
  posthog: v.nullable(
    v.object({ key: v.pipe(v.string(), v.regex(POSTHOG_KEY)), host: PosthogHost }),
  ),
  // The page the consent banner links to, if any.
  privacyEntryId: v.nullable(Uuid),
});
export type AnalyticsSettings = v.InferOutput<typeof AnalyticsSettings>;

// Whether anything needs the visitor's consent.
export const hasTrackers = (settings: AnalyticsSettings | null | undefined): boolean =>
  Boolean(settings && (settings.ga4 || settings.gtm || settings.posthog));

// ── What the form sends ──────────────────────────────────────────────────────────────────────

// Empty is none.
function optional(pattern: RegExp, message: string, upper: boolean) {
  return v.pipe(
    v.string(),
    v.trim(),
    v.transform((s) => (upper ? s.toUpperCase() : s)),
    v.check((s) => s === "" || pattern.test(s), message),
    v.transform((s) => (s === "" ? null : s)),
  );
}

// Search Console gives a whole meta tag to paste; its content attribute is the token.
const VerificationInput = v.pipe(
  v.string(),
  v.trim(),
  v.transform((s) => /content\s*=\s*["']([^"']*)["']/i.exec(s)?.[1] ?? s),
  v.check(
    (s) => s === "" || VERIFICATION.test(s),
    "Paste the meta tag Search Console gives, or the code in its content attribute",
  ),
  v.transform((s) => (s === "" ? null : s)),
);

// The one service the site sends visits to (the form's radio group), or none.
export const ANALYTICS_SERVICES = ["none", "ga4", "gtm", "posthog"] as const;
export type AnalyticsService = (typeof ANALYTICS_SERVICES)[number];

// Which service a saved row uses.
export const analyticsService = (
  settings: AnalyticsSettings | null | undefined,
): AnalyticsService =>
  settings?.posthog ? "posthog" : settings?.gtm ? "gtm" : settings?.ga4 ? "ga4" : "none";

// The chosen service's id must be there; the others' fields are ignored, and saved as none.
export const AnalyticsInput = v.pipe(
  v.object({
    service: v.picklist(ANALYTICS_SERVICES),
    ga4: optional(GA4, "A measurement ID looks like G-XXXXXXXXXX", true),
    gtm: optional(GTM, "A container ID looks like GTM-XXXXXXX", true),
    searchConsole: VerificationInput,
    posthogKey: optional(POSTHOG_KEY, "A project key starts with phc_", false),
    posthogRegion: v.picklist(["us", "eu", "custom"]),
    posthogHost: v.pipe(
      v.string(),
      v.trim(),
      v.transform((s) => s.replace(/\/+$/, "")),
    ),
    privacyEntryId: v.union([
      v.pipe(
        v.literal(""),
        v.transform(() => null),
      ),
      Uuid,
    ]),
  }),
  v.forward(
    v.check((input) => input.service !== "ga4" || input.ga4 !== null, "Enter the measurement ID"),
    ["ga4"],
  ),
  v.forward(
    v.check((input) => input.service !== "gtm" || input.gtm !== null, "Enter the container ID"),
    ["gtm"],
  ),
  v.forward(
    v.check(
      (input) => input.service !== "posthog" || input.posthogKey !== null,
      "Enter the project API key",
    ),
    ["posthogKey"],
  ),
  v.forward(
    v.check(
      (input) =>
        input.service !== "posthog" ||
        input.posthogRegion !== "custom" ||
        v.is(PosthogHost, input.posthogHost),
      "Use an https address without a path, such as https://ph.example.com",
    ),
    ["posthogHost"],
  ),
  v.transform(
    (input): AnalyticsSettings => ({
      ga4: input.service === "ga4" ? input.ga4 : null,
      gtm: input.service === "gtm" ? input.gtm : null,
      searchConsole: input.searchConsole,
      posthog:
        input.service === "posthog" && input.posthogKey
          ? {
              key: input.posthogKey,
              host:
                input.posthogRegion === "custom"
                  ? input.posthogHost
                  : POSTHOG_HOSTS[input.posthogRegion],
            }
          : null,
      privacyEntryId: input.privacyEntryId,
    }),
  ),
);
