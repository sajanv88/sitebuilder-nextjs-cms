// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { RedirectInput, redirectTarget } from "./redirects";

const input = (from: string, to: string, status = "301") => ({ original: "", from, to, status });

describe("redirects", () => {
  it("send one address, or everything under one, keeping the rest when asked", () => {
    expect(redirectTarget("/old", "/new", "/old")).toBe("/new");
    expect(redirectTarget("/old", "/new", "/old/x")).toBeNull();
    expect(redirectTarget("/old-blog/*", "/blog/*", "/old-blog/2024/hello")).toBe(
      "/blog/2024/hello",
    );
    expect(redirectTarget("/old-blog/*", "/blog/*", "/old-blog")).toBe("/blog");
    expect(redirectTarget("/old-blog/*", "/blog", "/old-blog/x")).toBe("/blog");
    expect(redirectTarget("/old-blog/*", "/blog/*", "/old-blogger")).toBeNull();
  });

  it("take site paths and http(s) addresses, with one of four statuses", () => {
    expect(v.parse(RedirectInput, input("/about-us", "/about", "308")).status).toBe(308);
    expect(v.is(RedirectInput, input("/shop", "https://shop.example.com/"))).toBe(true);
    expect(v.is(RedirectInput, input("/shop", "//evil.example.com"))).toBe(false);
    expect(v.is(RedirectInput, input("/shop", "javascript:alert(1)"))).toBe(false);
    expect(v.is(RedirectInput, input("/shop", "/x", "303"))).toBe(false);
  });

  it("refuse the site's own addresses, and a star that can't be kept", () => {
    for (const from of ["/admin", "/api/x", "/media/*", "/", "/a b", "/x/*/y"]) {
      expect(v.is(RedirectInput, input(from, "/somewhere"))).toBe(false);
    }
    expect(v.is(RedirectInput, input("/old", "/new/*"))).toBe(false);
  });

  it("refuse a redirect that covers its own target", () => {
    expect(v.is(RedirectInput, input("/a", "/a"))).toBe(false);
    expect(v.is(RedirectInput, input("/a/*", "/a/x"))).toBe(false);
    expect(v.is(RedirectInput, input("/a/*", "/a/b/*"))).toBe(false);
    expect(v.is(RedirectInput, input("/a/*", "/ab/*"))).toBe(true);
    expect(v.is(RedirectInput, input("/a", "/a?b=1"))).toBe(false);
  });
});
