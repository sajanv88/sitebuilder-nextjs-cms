// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { type SettingsValue, TokenName, TokenValue } from "@sitebuilder/schema";
import * as v from "valibot";

// The theme's token overrides as one stylesheet (design §5.4): light values on :root, dark
// values for data-theme="dark" and, under the system's dark preference, data-theme="system".
// Unlayered, so they beat nuvui's tokens and the preset's. A value set only for light holds in
// dark too, as nuvui's theming page says. Names and values are checked again here, though the
// settings were checked on save: this text goes into the page unescaped.

type Tokens = SettingsValue<"theme">["tokens"];

function declarations(tokens: Tokens, mode: "light" | "dark"): string {
  return Object.entries(tokens)
    .flatMap(([name, values]) => {
      const value = values[mode];
      return value !== undefined && v.is(TokenName, name) && v.is(TokenValue, value)
        ? [`${name}:${value}`]
        : [];
    })
    .join(";");
}

export function themeStylesheet(tokens: Tokens): string {
  const light = declarations(tokens, "light");
  const dark = declarations(tokens, "dark");
  let css = light ? `:root{${light}}` : "";
  if (dark) {
    css += `[data-theme=dark]{${dark}}`;
    css += `@media (prefers-color-scheme:dark){[data-theme=system]{${dark}}}`;
  }
  return css;
}
