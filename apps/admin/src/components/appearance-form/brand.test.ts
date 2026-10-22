// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, test } from "vitest";
import {
  brandOf,
  brandTokens,
  contrast,
  cornersOf,
  cornerTokens,
  darkShade,
  readsOnLight,
  textOn,
} from "./brand";

describe("contrast and textOn", () => {
  test("measures as WCAG does", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBe(1);
  });

  test.each([
    ["#2563eb", "#ffffff"],
    ["#facc15", "#030712"],
    ["#0f766e", "#ffffff"],
  ])("text on %s is %s, and reads", (color, text) => {
    expect(textOn(color)).toBe(text);
    expect(contrast(textOn(color), color)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("darkShade", () => {
  test.each(["#2563eb", "#1e3a8a", "#000000", "#7c3aed", "#facc15"])(
    "%s gets a shade that reads on the dark page",
    (color) => {
      expect(contrast(darkShade(color), "#030712")).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("brandTokens", () => {
  test("writes the colour, its text and the focus ring, for light and dark", () => {
    const tokens = brandTokens("#2563eb");
    expect(Object.keys(tokens)).toEqual([
      "--color-primary",
      "--color-primary-foreground",
      "--color-ring",
    ]);
    expect(tokens["--color-primary"]?.light).toBe("#2563eb");
    expect(tokens["--color-ring"]).toEqual(tokens["--color-primary"]);
    expect(tokens["--color-primary-foreground"]?.light).toBe("#ffffff");
  });

  test("reads the colour back only when it's #rrggbb", () => {
    expect(brandOf("#2563EB")).toBe("#2563eb");
    expect(brandOf("oklch(60% 0.2 260)")).toBeNull();
    expect(brandOf(undefined)).toBeNull();
  });

  test("says when link text in the colour won't read on a light page", () => {
    expect(readsOnLight("#2563eb")).toBe(true);
    expect(readsOnLight("#facc15")).toBe(false);
  });
});

describe("corners", () => {
  test("round-trips each style, and knows the theme's and a mix", () => {
    const values = (tokens: ReturnType<typeof cornerTokens>) =>
      new Map(Object.entries(tokens).map(([name, value]) => [name, value.light]));
    expect(cornersOf(values(cornerTokens("square")))).toBe("square");
    expect(cornersOf(values(cornerTokens("rounder")))).toBe("rounder");
    expect(cornersOf(new Map())).toBe("theme");
    expect(cornersOf(new Map([["--radius-md", "3px"]]))).toBeNull();
  });
});
