// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, it } from "vitest";
import { ALL_PAGES, placePage } from "./nav";

describe("the documentation's pages", () => {
  it("lists each page once", () => {
    const slugs = ALL_PAGES.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("places a page between its neighbours", () => {
    const [first, second] = ALL_PAGES;
    expect(placePage(first?.slug ?? "")?.previous).toBeNull();
    expect(placePage(first?.slug ?? "")?.next).toEqual(second);
    expect(placePage("no/such/page")).toBeNull();
  });
});
