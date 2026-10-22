// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { GridBackground } from "@nuvui/backgrounds/grid-background";
import type { ReactNode } from "react";
import * as v from "valibot";
import type { Field } from "../types";
import { GlyphBackdrop } from "./glyphs";
import { GradientBackdrop } from "./gradient";
import { HexagonBackdrop } from "./hexagons";
import { StarsBackdrop } from "./stars";
import { TopographyBackdrop } from "./topography";
import "./backdrop.scss";

// A moving backdrop behind a section or a hero, from @nuvui/backgrounds, in the theme's colors.
// Fireworks and the tunnel aren't offered: too busy to put text over (decisions #87).

export const BACKDROPS = [
  "none",
  "gradient",
  "grid",
  "dots",
  "stars",
  "topography",
  "hexagons",
  "glyphs",
] as const;
export type BackdropKind = (typeof BACKDROPS)[number];

export const backdropProps = {
  backdrop: v.optional(v.picklist(BACKDROPS), "none"),
  // How much of the page's color is laid over it: strong keeps body text at 4.5:1.
  scrim: v.optional(v.picklist(["soft", "strong"]), "strong"),
};

export const backdropFields: readonly Field[] = [
  {
    kind: "choice",
    name: "backdrop",
    label: "Moving backdrop",
    description:
      "Drawn in the theme's colors, in place of the background color. Visitors can pause one that moves, and it holds still for anyone who asked for less motion.",
    options: [
      { value: "none", label: "None" },
      { value: "gradient", label: "Drifting colors" },
      { value: "grid", label: "Grid of lines" },
      { value: "dots", label: "Grid of dots" },
      { value: "stars", label: "Stars" },
      { value: "topography", label: "Contour lines" },
      { value: "hexagons", label: "Hexagons" },
      { value: "glyphs", label: "Characters" },
    ],
  },
  {
    kind: "choice",
    name: "scrim",
    label: "Text over the backdrop",
    options: [
      { value: "strong", label: "Easiest to read" },
      { value: "soft", label: "More of the backdrop" },
    ],
  },
];

// Draws the backdrop as the box `className` lays out, with `children` on it. A grid doesn't
// move by itself, so it has no pause button.
export function Backdrop({
  kind,
  scrim,
  className,
  children,
}: {
  kind: Exclude<BackdropKind, "none">;
  scrim: "soft" | "strong";
  className: string;
  children: ReactNode;
}) {
  const box = `block-backdrop block-backdrop--moving ${className}`;
  switch (kind) {
    case "grid":
    case "dots":
      return (
        <GridBackground
          className={`block-backdrop ${className}`}
          scrim={scrim}
          variant={kind === "dots" ? "dots" : "lines"}
        >
          {children}
        </GridBackground>
      );
    case "gradient":
      return (
        <GradientBackdrop className={box} scrim={scrim}>
          {children}
        </GradientBackdrop>
      );
    case "stars":
      return (
        <StarsBackdrop className={box} scrim={scrim}>
          {children}
        </StarsBackdrop>
      );
    case "topography":
      return (
        <TopographyBackdrop className={box} scrim={scrim}>
          {children}
        </TopographyBackdrop>
      );
    case "hexagons":
      return (
        <HexagonBackdrop className={box} scrim={scrim}>
          {children}
        </HexagonBackdrop>
      );
    case "glyphs":
      return (
        <GlyphBackdrop className={box} scrim={scrim}>
          {children}
        </GlyphBackdrop>
      );
  }
}
