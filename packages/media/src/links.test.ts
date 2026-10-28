// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, it } from "vitest";
import { isShareValid, SHARE_LINK_MAX_SECONDS, shareQuery } from "./links";

const SECRET = "a-test-secret-that-is-at-least-32-characters";
const KEY = "2026/10/0b8f8a8e-6c1e-4c3f-9a1d-2f6f0c1d2e3f-report.pdf";
const NOW = 1_800_000_000;

const parse = (query: string) => {
  const params = new URLSearchParams(query);
  return { expires: params.get("expires"), sig: params.get("sig") };
};

describe("share links", () => {
  it("open the file they were made for, until they end", () => {
    const query = parse(shareQuery(KEY, NOW + 3600, SECRET));
    expect(isShareValid(KEY, query, SECRET, NOW)).toBe(true);
    expect(isShareValid(KEY, query, SECRET, NOW + 3600)).toBe(false);
  });

  it("open nothing else, and nothing once changed or under another secret", () => {
    const query = parse(shareQuery(KEY, NOW + 3600, SECRET));
    expect(isShareValid(`${KEY}x`, query, SECRET, NOW)).toBe(false);
    expect(isShareValid(KEY, { ...query, expires: String(NOW + 7200) }, SECRET, NOW)).toBe(false);
    expect(isShareValid(KEY, query, "another-test-secret-at-least-32-characters!!", NOW)).toBe(
      false,
    );
    expect(isShareValid(KEY, { expires: null, sig: null }, SECRET, NOW)).toBe(false);
  });

  it("can't last longer than 30 days", () => {
    const query = parse(shareQuery(KEY, NOW + SHARE_LINK_MAX_SECONDS + 60, SECRET));
    expect(isShareValid(KEY, query, SECRET, NOW)).toBe(false);
  });
});
