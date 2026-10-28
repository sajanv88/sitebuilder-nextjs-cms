// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_PAGES, placePage } from "./nav";

const content = (slug: string) => fileURLToPath(new URL(`../content/${slug}.mdx`, import.meta.url));

describe("the documentation's pages", () => {
  it("has a file for every page in the sidebar", () => {
    for (const page of ALL_PAGES) expect(existsSync(content(page.slug)), page.slug).toBe(true);
    expect(existsSync(content("index"))).toBe(true);
  });

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
