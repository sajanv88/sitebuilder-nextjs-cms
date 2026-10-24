// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Loading the analytics a visitor accepted, and forgetting them when they change their mind.
// Browser only. The scripts are added by this code, which ran with the page's nonce, so the
// security policy's 'strict-dynamic' lets them run (apps/site proxy.ts opens the hosts they
// send to).

export interface Trackers {
  ga4: string | null;
  gtm: string | null;
  posthog: { key: string; host: string } | null;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let loaded = false;

function script(src: string, nonce: string) {
  const element = document.createElement("script");
  element.async = true;
  element.src = src;
  // Tag Manager passes the page's nonce on to the tags it adds.
  if (nonce) element.nonce = nonce;
  document.head.append(element);
}

export function loadTrackers(trackers: Trackers, nonce: string): void {
  if (loaded) return;
  loaded = true;
  if (trackers.ga4 || trackers.gtm) window.dataLayer ??= [];

  if (trackers.ga4) {
    // gtag pushes its arguments object itself: Google's library reads that, not an array.
    window.gtag = function gtag() {
      // biome-ignore lint/complexity/noArguments: gtag.js reads the arguments object as pushed.
      window.dataLayer?.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", trackers.ga4);
    script(
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(trackers.ga4)}`,
      nonce,
    );
  }

  if (trackers.gtm) {
    window.dataLayer?.push({ "gtm.start": Date.now(), event: "gtm.js" });
    script(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(trackers.gtm)}`, nonce);
  }

  if (trackers.posthog) {
    const { key, host } = trackers.posthog;
    // Only now: a visitor who doesn't accept never downloads it.
    void import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        // Page views on every client-side navigation, and PostHog's current defaults.
        defaults: "2026-08-30",
        person_profiles: "identified_only",
      });
    });
  }
}

// The cookies Google Analytics and PostHog set on this site, removed when a visitor declines
// after accepting. The page is then loaded again, without the scripts.
export function forgetTrackers(): void {
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim() ?? "";
    if (!/^(_ga|_gid|_gat|ph_)/.test(name)) continue;
    for (const domain of domains) {
      // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API isn't in every browser the site supports yet.
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
    }
  }
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("ph_")) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing kept there.
  }
}
