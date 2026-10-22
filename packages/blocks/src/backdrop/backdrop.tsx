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
  // Still unless the admin chooses otherwise: there's no pause button (decisions #108).
  motion: v.optional(v.picklist(["still", "moving"]), "still"),
};

export const backdropFields: readonly Field[] = [
  {
    kind: "choice",
    name: "backdrop",
    label: "Moving backdrop",
    description: "Drawn in the theme's colors, in place of the background color.",
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
    name: "motion",
    label: "Movement",
    description:
      "Moving has no pause button, so keep it for short pages. Visitors who asked their device for less motion always see it still.",
    options: [
      { value: "still", label: "Still" },
      { value: "moving", label: "Moving" },
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
// move by itself; only the pointer lights it.
export function Backdrop({
  kind,
  scrim,
  motion,
  className,
  children,
}: {
  kind: Exclude<BackdropKind, "none">;
  scrim: "soft" | "strong";
  motion: "still" | "moving";
  className: string;
  children: ReactNode;
}) {
  const box = `block-backdrop ${className}`;
  const moving = motion === "moving";
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
        <GradientBackdrop className={box} scrim={scrim} moving={moving}>
          {children}
        </GradientBackdrop>
      );
    case "stars":
      return (
        <StarsBackdrop className={box} scrim={scrim} moving={moving}>
          {children}
        </StarsBackdrop>
      );
    case "topography":
      return (
        <TopographyBackdrop className={box} scrim={scrim} moving={moving}>
          {children}
        </TopographyBackdrop>
      );
    case "hexagons":
      return (
        <HexagonBackdrop className={box} scrim={scrim} moving={moving}>
          {children}
        </HexagonBackdrop>
      );
    case "glyphs":
      return (
        <GlyphBackdrop className={box} scrim={scrim} moving={moving}>
          {children}
        </GlyphBackdrop>
      );
  }
}
