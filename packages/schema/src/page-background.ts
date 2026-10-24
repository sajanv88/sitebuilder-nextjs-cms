// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { type ThemeSettings, TokenName, TokenValue } from "./settings";

// A page's background colour (its own, or the site's from the theme), as the CSS that draws it.
// One colour can't sit under both of nuvui's palettes: cream under dark mode's light text is
// unreadable. So the colour decides the page's palette: a light colour draws the page with the
// light palette and a dark one with the dark, whatever the visitor's own setting. The text,
// muted and border colours are worked out from the colour itself, each checked for contrast.
// Pure, so the site draws it on the server and the editor's canvas in the browser.

// What text sits on: the theme's white and its near-black (nuvui's gray-950).
const WHITE = "#ffffff";
const INK = "#030712";

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG's contrast ratio: 1 for a colour on itself, 21 for black on white.
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// The text colour that reads best on `hex`. One of the two always reaches 4.5:1.
export function textOn(hex: string): string {
  return contrast(WHITE, hex) >= contrast(INK, hex) ? WHITE : INK;
}

// Which palette a background takes: the light one where dark text reads best on it.
export function backgroundTone(hex: string): "light" | "dark" {
  return textOn(hex) === INK ? "light" : "dark";
}

// `share` of the way from `from` to `to`, in sRGB.
function mix(from: string, to: string, share: number): string {
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((value, i) =>
      Math.round(value + ((b[i] ?? value) - value) * share)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// The first step from `start` towards the text colour that reaches `ratio` on `on`.
function towards(hex: string, text: string, on: string, start: number, ratio: number): string {
  for (let share = start; share < 1; share += 0.05) {
    const candidate = mix(hex, text, share);
    if (contrast(candidate, on) >= ratio) return candidate;
  }
  return text;
}

// nuvui 0.8.0's own palettes, for the default theme, less what the colour itself decides. A
// preset needs none of these: its tokens follow the --nuv-light and --nuv-dark switches.
const PALETTES = {
  light: {
    "--color-surface": "var(--color-white)",
    "--color-surface-foreground": "var(--color-gray-950)",
    "--color-primary": "var(--color-blue-600)",
    "--color-primary-foreground": "var(--color-white)",
    "--color-danger": "var(--color-red-600)",
    "--color-danger-foreground": "var(--color-white)",
    "--color-success": "var(--color-green-700)",
    "--color-warning": "var(--color-amber-700)",
    "--color-ring": "var(--color-blue-600)",
    "--color-overlay": "rgb(0 0 0 / 0.5)",
  },
  dark: {
    "--color-surface": "var(--color-gray-900)",
    "--color-surface-foreground": "var(--color-gray-50)",
    "--color-primary": "var(--color-blue-400)",
    "--color-primary-foreground": "var(--color-gray-950)",
    "--color-danger": "var(--color-red-400)",
    "--color-danger-foreground": "var(--color-gray-950)",
    "--color-success": "var(--color-green-400)",
    "--color-warning": "var(--color-amber-400)",
    "--color-ring": "var(--color-blue-400)",
    "--color-overlay": "rgb(0 0 0 / 0.7)",
  },
} as const;

type Theme = Pick<ThemeSettings, "preset" | "tokens">;

// The colour and what's worked out from it: the text, a muted shade, quieter text (4.5:1 on the
// muted shade) and lines (outlines of controls 3:1). For a whole page below, and for a block's
// own background (packages/blocks surface.ts).
export function surfaceTokens(hex: string): [string, string][] {
  const text = textOn(hex);
  const muted = mix(hex, text, 0.06);
  return [
    ["--color-background", hex],
    ["--color-foreground", text],
    ["--color-muted", muted],
    ["--color-muted-foreground", towards(hex, text, muted, 0.6, 4.5)],
    ["--color-border", mix(hex, text, 0.14)],
    ["--color-border-strong", towards(hex, text, hex, 0.4, 3)],
  ];
}

// The declarations, in order: the palette for the colour's tone, the theme's own overrides for
// that tone (a light value holds in dark unless dark has its own), then the colour and what's
// worked out from it.
export function pageBackgroundTokens(hex: string, theme: Theme): [string, string][] {
  const tone = backgroundTone(hex);
  const declarations: [string, string][] = [
    ["color-scheme", tone],
    ["--nuv-light", tone === "light" ? "initial" : " "],
    ["--nuv-dark", tone === "dark" ? "initial" : " "],
  ];
  if (theme.preset === "default") declarations.push(...Object.entries(PALETTES[tone]));
  for (const [name, values] of Object.entries(theme.tokens)) {
    const value = tone === "dark" ? (values.dark ?? values.light) : values.light;
    if (value !== undefined && v.is(TokenName, name) && v.is(TokenValue, value)) {
      declarations.push([name, value]);
    }
  }
  declarations.push(...surfaceTokens(hex));
  return declarations;
}

// One rule on <html>. More specific than nuvui's and the theme's own token rules, and
// unlayered, so it wins over both. The colour is checked again: this text goes into the page.
export function pageBackgroundCss(hex: string, theme: Theme): string {
  if (!/^#[0-9a-f]{6}$/.test(hex)) return "";
  const body = pageBackgroundTokens(hex, theme)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `html[data-theme]{${body}}`;
}
