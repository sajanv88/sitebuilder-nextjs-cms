// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { RESERVED_SEGMENTS } from "./entries";

// Redirects written by hand on the Redirects screen (decisions #145), beside the ones a moved
// page writes. A redirect from a path ending in "/*" covers everything under it; its target
// may end in "/*" too, to keep the rest of the address (/old-blog/2024/x → /blog/2024/x).

export const REDIRECT_STATUSES = [301, 302, 307, 308] as const;
export type RedirectStatus = (typeof REDIRECT_STATUSES)[number];

// One segment of a path: what an address may hold without escaping, and escapes.
const SEGMENT = "[A-Za-z0-9._~%!$&'()+,;=:@-]+";
const FROM = new RegExp(`^(?:/${SEGMENT})+(?:/\\*)?$`);
// A path on this site (not "//", which is another host) or an http(s) address.
const TO = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s/]+[^\s]*)$/;

export const isPrefixRedirect = (from: string): boolean => from.endsWith("/*");

// What a "/*" redirect covers: its path without the star.
export const redirectBase = (from: string): string => from.slice(0, -2);

// Where a path goes under a redirect: the target, with the rest of the path kept when both end
// in "/*". Null when the redirect doesn't cover the path.
export function redirectTarget(from: string, to: string, path: string): string | null {
  if (!isPrefixRedirect(from)) return path === from ? to : null;
  const base = redirectBase(from);
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  return to.endsWith("/*") ? `${redirectBase(to)}${path.slice(base.length)}` : to;
}

const firstSegment = (path: string) => path.split("/")[1] ?? "";

// A redirect that covers its own target sends visitors round in a loop (/a → /a, /a/* → /a/x),
// or to ever longer addresses (/a/* → /a/b/*). Another site's address can't loop here.
function sendsBack(from: string, to: string): boolean {
  if (!to.startsWith("/")) return false;
  const target = (to.endsWith("/*") ? redirectBase(to) : to).replace(/[?#].*$/, "") || "/";
  return redirectTarget(from, to, target) !== null;
}

export const RedirectFrom = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(500, "Use at most 500 characters"),
  v.regex(FROM, "Use a path on this site, such as /old-page or /old-blog/*"),
  v.check(
    (from) => !(RESERVED_SEGMENTS as readonly string[]).includes(firstSegment(from)),
    "That address belongs to another part of the site",
  ),
);

export const RedirectTo = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2048, "Use at most 2,048 characters"),
  v.regex(TO, "Use a path on this site, such as /new-page, or an address starting with https://"),
);

// What the screen's form sends. `original` is the redirect being changed ("" for a new one).
export const RedirectInput = v.pipe(
  v.object({
    original: v.union([v.literal(""), RedirectFrom]),
    from: RedirectFrom,
    to: RedirectTo,
    status: v.pipe(
      v.string(),
      v.transform(Number),
      v.picklist(REDIRECT_STATUSES, "Choose how it redirects"),
    ),
  }),
  v.forward(
    v.check(
      (input) => !input.to.endsWith("/*") || isPrefixRedirect(input.from),
      'Only a redirect from an address ending in "/*" can keep the rest of it',
    ),
    ["to"],
  ),
  v.forward(
    v.check(
      (input) => !sendsBack(input.from, input.to),
      "It would send visitors back to where they started",
    ),
    ["to"],
  ),
);
export type RedirectInput = v.InferOutput<typeof RedirectInput>;
