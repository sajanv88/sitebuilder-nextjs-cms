// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { MenuSchema } from "./menu";
import {
  defaultSettings,
  ReadingSettings,
  ReadingSettingsInput,
  SettingsSchemas,
  ThemeSettings,
} from "./settings";
import { LinkTarget, Url } from "./shared";

const uuid = "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f70";

describe("Url", () => {
  test.each([
    "/about",
    "/blog/hello?x=1#top",
    "https://example.com/a",
    "mailto:hi@example.com",
    "tel:+31 (0)20-123",
  ])("accepts %s", (url) => {
    expect(v.is(Url, url)).toBe(true);
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.example",
    "about",
    "ftp://example.com",
  ])("rejects %s", (url) => {
    expect(v.is(Url, url)).toBe(false);
  });
});

test("LinkTarget is an entry id or a url", () => {
  expect(v.is(LinkTarget, { kind: "entry", entryId: uuid })).toBe(true);
  expect(v.is(LinkTarget, { kind: "url", url: "/x" })).toBe(true);
  expect(v.is(LinkTarget, { kind: "entry", url: "/x" })).toBe(false);
});

describe("MenuSchema", () => {
  const link = (id: string) => ({ id, label: "Home", kind: "url" as const, url: "/" });

  test("accepts two levels and groups with children", () => {
    const menu = [
      { ...link("item-0001"), children: [link("item-0002")] },
      { id: "item-0003", label: "More", kind: "group", children: [link("item-0004")] },
      { id: "item-0005", label: "Post", kind: "entry", entryId: uuid },
    ];
    expect(v.is(MenuSchema, menu)).toBe(true);
  });

  test("rejects a third level, an empty group and duplicate ids", () => {
    const third = [{ ...link("item-0001"), children: [{ ...link("item-0002"), children: [] }] }];
    expect(v.is(MenuSchema, third)).toBe(false);
    expect(
      v.is(MenuSchema, [{ id: "item-0001", label: "More", kind: "group", children: [] }]),
    ).toBe(false);
    expect(v.is(MenuSchema, [link("item-0001"), link("item-0001")])).toBe(false);
  });
});

describe("settings", () => {
  test("the /setup defaults pass their own schemas", () => {
    const defaults = defaultSettings("https://example.com");
    for (const key of ["site", "reading", "theme"] as const) {
      expect(v.is(SettingsSchemas[key], defaults[key])).toBe(true);
    }
  });

  test("theme tokens refuse unsafe names and values", () => {
    const theme = (tokens: Record<string, { light?: string }>) => ({
      ...defaultSettings("https://example.com").theme,
      tokens,
    });
    expect(v.is(ThemeSettings, theme({ "--color-primary": { light: "oklch(0.6 0.2 250)" } }))).toBe(
      true,
    );
    expect(v.is(ThemeSettings, theme({ "--anything": { light: "red" } }))).toBe(false);
    expect(v.is(ThemeSettings, theme({ "--color-bg": { light: "url(x)" } }))).toBe(false);
    expect(v.is(ThemeSettings, theme({ "--color-bg": { light: "red;}body{x" } }))).toBe(false);
  });

  test("custom CSS is empty for older rows, and can't close its <style>", () => {
    const { customCss: _, ...older } = defaultSettings("https://example.com").theme;
    expect(v.parse(ThemeSettings, older).customCss).toBe("");
    const theme = (customCss: string) => ({ ...older, customCss });
    expect(v.is(ThemeSettings, theme(".site-header { color: var(--color-primary); }"))).toBe(true);
    expect(v.is(ThemeSettings, theme("a{}</style><script>alert(1)</script>"))).toBe(false);
    expect(v.is(ThemeSettings, theme("x".repeat(50_001)))).toBe(false);
  });

  test("reading progress is on for older rows, and follows the checkbox in the form", () => {
    const older = { homepageEntryId: null, postsPerPage: 10, postsPath: "/blog" };
    expect(v.parse(ReadingSettings, older).showReadingProgress).toBe(true);
    const form = { homepageEntryId: "", postsPerPage: "10", postsPath: "/blog" };
    expect(v.parse(ReadingSettingsInput, { ...form, showReadingProgress: "on" })).toMatchObject({
      showReadingProgress: true,
    });
    expect(v.parse(ReadingSettingsInput, form).showReadingProgress).toBe(false);
    expect(v.is(ReadingSettingsInput, { ...form, showReadingProgress: "yes" })).toBe(false);
  });
});
