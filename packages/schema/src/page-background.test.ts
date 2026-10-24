// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { BackgroundField } from "./entries";
import {
  backgroundTone,
  contrast,
  pageBackgroundCss,
  pageBackgroundTokens,
} from "./page-background";
import { ThemeSettings } from "./settings";

const plain = { preset: "default", tokens: {} } as const;

function tokens(hex: string, theme: Parameters<typeof pageBackgroundTokens>[1] = plain) {
  return new Map(pageBackgroundTokens(hex, theme));
}

describe("page background", () => {
  it("takes the palette that reads on the colour", () => {
    expect(backgroundTone("#fdf6e3")).toBe("light");
    expect(backgroundTone("#0f172a")).toBe("dark");
    const cream = tokens("#fdf6e3");
    expect(cream.get("color-scheme")).toBe("light");
    expect(cream.get("--nuv-light")).toBe("initial");
    expect(cream.get("--color-primary")).toBe("var(--color-blue-600)");
    const navy = tokens("#0f172a");
    expect(navy.get("--nuv-dark")).toBe("initial");
    expect(navy.get("--color-primary")).toBe("var(--color-blue-400)");
  });

  it("keeps text readable on any colour", () => {
    for (const hex of ["#ffffff", "#fdf6e3", "#7f7f7f", "#6b8e23", "#1e3a8a", "#000000"]) {
      const set = tokens(hex);
      const muted = set.get("--color-muted") ?? "";
      expect(contrast(set.get("--color-foreground") ?? "", hex)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(set.get("--color-muted-foreground") ?? "", muted)).toBeGreaterThanOrEqual(
        4.4,
      );
      expect(contrast(set.get("--color-border-strong") ?? "", hex)).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves a preset's palette to its own switches", () => {
    const set = tokens("#fdf6e3", { preset: "ember", tokens: {} });
    expect(set.has("--color-primary")).toBe(false);
    expect(set.get("--nuv-dark")).toBe(" ");
  });

  it("uses the theme's overrides for the colour's tone", () => {
    const theme = {
      preset: "default",
      tokens: { "--color-primary": { light: "#0f766e", dark: "#5eead4" } },
    } as const;
    expect(tokens("#fdf6e3", theme).get("--color-primary")).toBe("#0f766e");
    expect(tokens("#0f172a", theme).get("--color-primary")).toBe("#5eead4");
  });

  it("writes nothing for anything but #rrggbb", () => {
    expect(pageBackgroundCss("#FDF6E3", plain)).toBe("");
    expect(pageBackgroundCss("red;}body{display:none", plain)).toBe("");
    expect(pageBackgroundCss("#fdf6e3", plain)).toMatch(
      /^html\[data-theme\]\{.*--color-background:#fdf6e3/,
    );
  });

  it("reads the field and the setting", () => {
    expect(v.parse(BackgroundField, "")).toBeNull();
    expect(v.parse(BackgroundField, " #FDF6E3 ")).toBe("#fdf6e3");
    expect(v.is(BackgroundField, "url(x)")).toBe(false);
    const theme = v.parse(ThemeSettings, {
      preset: "default",
      mode: "system",
      density: "default",
      tokens: {},
    });
    expect(theme.pageBackground).toBeNull();
  });
});
