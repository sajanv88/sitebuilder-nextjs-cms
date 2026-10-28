// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { FontFamilyName, type SettingsValue, TokenName, TokenValue } from "@sitebuilder/schema";
import * as v from "valibot";

// The theme's token overrides as one stylesheet (design §5.4): light values on :root and any
// data-theme="light", dark values for data-theme="dark" and, under the system's dark preference,
// data-theme="system". Unlayered, so they beat nuvui's tokens and the preset's. A value set only
// for light holds in dark too, as nuvui's theming page says: it's written for dark as well, so it
// also holds in a block drawn dark on a light page (packages/blocks surface.tsx), where nuvui's
// own dark tokens are declared again. Names and values are checked again here, though the
// settings were checked on save: this text goes into the page unescaped.

type Tokens = SettingsValue<"theme">["tokens"];

function declarations(tokens: Tokens, mode: "light" | "dark"): string {
  return Object.entries(tokens)
    .flatMap(([name, values]) => {
      const value = mode === "dark" ? (values.dark ?? values.light) : values.light;
      return value !== undefined && v.is(TokenName, name) && v.is(TokenValue, value)
        ? [`${name}:${value}`]
        : [];
    })
    .join(";");
}

export function themeStylesheet(tokens: Tokens): string {
  const light = declarations(tokens, "light");
  const dark = declarations(tokens, "dark");
  let css = light ? `:root,[data-theme=light]{${light}}` : "";
  if (dark) {
    css += `[data-theme=dark]{${dark}}`;
    css += `@media (prefers-color-scheme:dark){[data-theme=system]{${dark}}}`;
  }
  return css;
}

// Uploaded fonts (decisions #148): an @font-face for each file the media library still has,
// then the family as the text's or code's font, after a stack the browser has. swap: text shows
// at once in a fallback, then in the font once it's loaded. The name and each address are
// checked again here: this text goes into the page as it is.
const MEDIA_URL = /^\/media\/[A-Za-z0-9._~/-]+$/;
const FALLBACK = { text: "system-ui, sans-serif", code: "ui-monospace, monospace" } as const;
const TOKEN = { text: "--font-sans", code: "--font-mono" } as const;

export function fontsStylesheet(
  fonts: SettingsValue<"theme">["fonts"],
  urls: Readonly<Record<string, string>>,
): string {
  let css = "";
  const uses: string[] = [];
  for (const font of fonts) {
    if (!v.is(FontFamilyName, font.family)) continue;
    let faces = 0;
    for (const file of font.files) {
      const url = urls[file.mediaId];
      if (!url || !MEDIA_URL.test(url)) continue;
      css += `@font-face{font-family:"${font.family}";src:url("${url}") format("woff2");font-weight:${file.weight};font-style:${file.style};font-display:swap}`;
      faces += 1;
    }
    if (faces > 0 && font.use !== "none") {
      uses.push(`${TOKEN[font.use]}:"${font.family}", ${FALLBACK[font.use]}`);
    }
  }
  return uses.length > 0 ? `${css}:root{${uses.join(";")}}` : css;
}
