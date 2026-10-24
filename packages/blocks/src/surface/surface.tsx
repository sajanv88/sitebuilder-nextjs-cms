// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { backgroundTone, HexColor, surfaceTokens } from "@sitebuilder/schema";
import type { CSSProperties } from "react";
import * as v from "valibot";

// A background for part of a block, such as a feature grid's cards: the theme's muted shade,
// its brand colour, or a colour of the owner's own. A colour of its own sets the part's palette
// as the page background does (@sitebuilder/schema page-background.ts): nuvui's light or dark
// tokens by data-theme, then the colour's text, muted and line colours. The block's own styles
// draw it, from the kind.

export const SURFACES = ["none", "muted", "primary"] as const;

export const SurfaceBackground = v.union([v.picklist(SURFACES), HexColor]);
export type SurfaceBackground = v.InferOutput<typeof SurfaceBackground>;

export interface Surface {
  kind: "none" | "muted" | "primary" | "custom";
  // For the element the background is drawn on.
  attributes: { "data-theme"?: "light" | "dark"; style?: CSSProperties };
}

export function surfaceOf(background: unknown): Surface {
  if (background === "muted" || background === "primary") {
    return { kind: background, attributes: {} };
  }
  // Checked again: the colour goes into a style attribute.
  if (typeof background === "string" && /^#[0-9a-f]{6}$/.test(background)) {
    return {
      kind: "custom",
      attributes: {
        "data-theme": backgroundTone(background),
        style: Object.fromEntries(surfaceTokens(background)) as CSSProperties,
      },
    };
  }
  return { kind: "none", attributes: {} };
}
