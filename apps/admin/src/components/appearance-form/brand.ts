// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { hexToHsv, hsvToHex, parseHex } from "@nuvui/react";
import { contrast, textOn } from "@sitebuilder/schema";

// The friendly half of Appearance: one brand colour and one corner style, each written as the
// token overrides the advanced list shows. Pure, so the arithmetic is tested on its own.

// The contrast arithmetic is shared with the page background (@sitebuilder/schema).
export { contrast, textOn };

// The theme's near-black (nuvui's gray-950), which dark pages' text is.
const INK = "#030712";

// The brand colour for dark pages: the same hue, lighter until it reads as a link on the
// theme's dark background (4.5:1), as nuvui's own dark primaries do.
export function darkShade(hex: string): string {
  const { h, s, v } = hexToHsv(hex);
  let shade = { h, s: Math.min(s, 80), v: Math.max(v, 70) };
  while (contrast(hsvToHex(shade), INK) < 4.5 && (shade.v < 100 || shade.s > 0)) {
    shade =
      shade.v < 100
        ? { ...shade, v: Math.min(100, shade.v + 5) }
        : { ...shade, s: Math.max(0, shade.s - 10) };
  }
  return hsvToHex(shade);
}

// Links and outlines are drawn in the brand colour too: below 4.5:1 on a white page, link
// text is hard to read.
export function readsOnLight(hex: string): boolean {
  return contrast(hex, "#ffffff") >= 4.5;
}

export type TokenValues = Record<string, { light: string; dark: string }>;

// Page backgrounds most sites start from: light ones and two dark. Offered here and in a page's
// settings.
export const BACKGROUND_PRESETS = [
  { value: "#ffffff", name: "White" },
  { value: "#faf7f2", name: "Paper" },
  { value: "#f3ead8", name: "Sand" },
  { value: "#eef2f7", name: "Mist" },
  { value: "#ecf5ee", name: "Mint" },
  { value: "#fbeff0", name: "Blush" },
  { value: "#1e293b", name: "Slate" },
  { value: "#0b1120", name: "Night" },
];

export const BRAND_TOKENS = [
  "--color-primary",
  "--color-primary-foreground",
  "--color-ring",
] as const;

export function brandTokens(color: string): TokenValues {
  const dark = darkShade(color);
  return {
    "--color-primary": { light: color, dark },
    "--color-primary-foreground": { light: textOn(color), dark: textOn(dark) },
    "--color-ring": { light: color, dark },
  };
}

// The brand colour the overrides hold, if they hold one as #rrggbb.
export function brandOf(light: string | undefined): string | null {
  return light ? parseHex(light) : null;
}

export const RADIUS_TOKENS = ["--radius-sm", "--radius-md", "--radius-lg", "--radius-xl"] as const;

// "theme" leaves the preset's radii alone; the others replace all four.
export const CORNERS = {
  square: ["0", "0", "0", "0"],
  round: ["0.375rem", "0.5rem", "0.75rem", "1rem"],
  rounder: ["0.75rem", "1rem", "1.25rem", "1.5rem"],
} as const;
export type Corners = keyof typeof CORNERS | "theme";

export function cornerTokens(corners: Exclude<Corners, "theme">): TokenValues {
  return Object.fromEntries(
    RADIUS_TOKENS.map((name, index) => {
      const value = CORNERS[corners][index] ?? "0";
      return [name, { light: value, dark: "" }];
    }),
  );
}

// Which style the radius overrides are: "theme" with none, null when they're a mix of the
// advanced list's own.
export function cornersOf(values: ReadonlyMap<string, string>): Corners | null {
  const present = RADIUS_TOKENS.map((name) => values.get(name));
  if (present.every((value) => value === undefined)) return "theme";
  for (const [name, set] of Object.entries(CORNERS)) {
    if (set.every((value, index) => present[index] === value)) return name as Corners;
  }
  return null;
}
