// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ContentIssue } from "@sitebuilder/schema";

// Contact details and addresses the model wrote that the owner never gave (prompt security,
// rule 5). Every email address, phone number and web address in a page must appear in what the
// owner typed; any other is an issue for the repair, and the caller replaces what's left.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Seven or more digits, possibly with a leading +, spaces, dots, dashes and brackets between.
const PHONE = /\+?\(?\d[\d\s().-]{5,}\d/g;
// Web addresses, without what usually ends a sentence after them.
const WEB = /\bhttps?:\/\/[^\s"'<>)\]]+[^\s"'<>)\].,;:!?]/gi;

// Media and entry ids, whose digits aren't phone numbers.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// The digits of a phone number without the leading zeros of a national prefix, so 09 223 45 67
// and +32 9 223 45 67 compare as the same number (one ends with the other).
const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");

export interface KnownFacts {
  emails: Set<string>;
  phones: Set<string>;
  hosts: Set<string>;
  urls: Set<string>;
}

// What the owner typed: the description and the answers.
export function knownFacts(texts: readonly string[]): KnownFacts {
  const all = texts.join("\n");
  const urls = all.match(WEB) ?? [];
  return {
    emails: new Set((all.match(EMAIL) ?? []).map((e) => e.toLowerCase())),
    phones: new Set((all.match(PHONE) ?? []).map(digits).filter((d) => d.length >= 6)),
    urls: new Set(urls.map((u) => u.toLowerCase().replace(/\/+$/, ""))),
    hosts: new Set(urls.map((u) => URL.parse(u)?.hostname.toLowerCase() ?? "")),
  };
}

// Strings in a value, with where each is.
function strings(value: unknown, path: (string | number)[], out: [string, (string | number)[]][]) {
  if (typeof value === "string") out.push([value, path]);
  else if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) strings(item, [...path, i], out);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) strings(item, [...path, key], out);
  }
}

export function inventedFacts(value: unknown, known: KnownFacts): ContentIssue[] {
  const found: [string, (string | number)[]][] = [];
  strings(value, [], found);
  const issues: ContentIssue[] = [];
  const report = (path: (string | number)[], what: string, text: string) =>
    issues.push({
      path,
      code: "invented-fact",
      message: `The ${what} ${text} isn't one the owner gave: use a [TODO: ...] marker instead`,
    });
  for (const [text, path] of found) {
    for (const email of text.match(EMAIL) ?? []) {
      if (!known.emails.has(email.toLowerCase())) report(path, "email address", email);
    }
    for (const url of text.match(WEB) ?? []) {
      const normal = url.toLowerCase().replace(/\/+$/, "");
      const host = URL.parse(url)?.hostname.toLowerCase() ?? "";
      // A page of a site the owner named is fine: they gave its address.
      if (!known.urls.has(normal) && !known.hosts.has(host)) report(path, "web address", url);
    }
    // Phone numbers, but not ids, dates, or the digits of an address already checked.
    const withoutOthers = text.replace(UUID, " ").replace(EMAIL, " ").replace(WEB, " ");
    for (const phone of withoutOthers.match(PHONE) ?? []) {
      const d = digits(phone);
      if (d.length < 6 || /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(phone.trim())) continue;
      if (![...known.phones].some((k) => k.endsWith(d) || d.endsWith(k))) {
        report(path, "phone number", phone.trim());
      }
    }
  }
  return issues;
}

// Visible markers for the owner to fill in: "[TODO: ...]".
export function countTodos(value: unknown): number {
  const found: [string, (string | number)[]][] = [];
  strings(value, [], found);
  return found.reduce((sum, [text]) => sum + (text.match(/\[TODO\b/gi)?.length ?? 0), 0);
}
