// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// Share links for private files (decisions #149): the file's address with when the link stops
// working and a signature over both, an HMAC under a key derived from AUTH_SECRET with a label of
// its own. Nothing is stored: a link can't be taken back before it ends, except by changing
// AUTH_SECRET, which ends them all. Links last at most 30 days.

const INFO = "sitebuilder:media-link:v1";
export const SHARE_LINK_MAX_SECONDS = 30 * 24 * 3600;

const keyFrom = (authSecret: string): Buffer =>
  Buffer.from(hkdfSync("sha256", authSecret, "", INFO, 32));

const signature = (key: string, expires: number, authSecret: string): string =>
  createHmac("sha256", keyFrom(authSecret)).update(`${key}\n${expires}`).digest("base64url");

// The query that opens a private file until `expires` (seconds since 1970).
export function shareQuery(key: string, expires: number, authSecret: string): string {
  return `expires=${expires}&sig=${signature(key, expires, authSecret)}`;
}

// Whether the query a request came with opens this file now.
export function isShareValid(
  key: string,
  query: { expires: string | null; sig: string | null },
  authSecret: string,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!query.expires || !query.sig || !/^\d{9,11}$/.test(query.expires)) return false;
  const expires = Number(query.expires);
  if (expires <= now || expires > now + SHARE_LINK_MAX_SECONDS) return false;
  const expected = Buffer.from(signature(key, expires, authSecret));
  const given = Buffer.from(query.sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
