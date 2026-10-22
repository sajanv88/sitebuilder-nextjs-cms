// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import type { Field, RenderContext } from "../types";
import "./block-page.scss";

// How wide a block placed on the page itself runs: the site's content width (contained), the
// window less the page's margin each side (fluid), or edge to edge (full). Whatever draws a page
// of blocks (the site's entry, the editor's canvas) gives that box the `block-page` class, whose
// grid has a column for each. A block inside a section or a column fills that instead.

export const PAGE_WIDTHS = ["contained", "fluid", "full"] as const;
export type PageWidth = (typeof PAGE_WIDTHS)[number];

export const pageWidthProps = {
  pageWidth: v.optional(v.picklist(PAGE_WIDTHS), "contained"),
};

export const pageWidthField: Field = {
  kind: "choice",
  name: "pageWidth",
  label: "Width on the page",
  description:
    "Fluid runs it across the window with a margin each side; full width runs it edge to edge. Inside a section or a column, it fills that instead.",
  options: [
    { value: "contained", label: "Contained" },
    { value: "fluid", label: "Fluid" },
    { value: "full", label: "Full width" },
  ],
};

// The width a block takes on the page, or contained for one inside another block.
export const pageWidthOf = (width: PageWidth, context: RenderContext): PageWidth =>
  context.nested ? "contained" : width;

// The class that places a block in the page's grid. The editor puts it on the frame around the
// block too, which is what sits in the grid there.
export const pageItemClass = (width: PageWidth): string | false =>
  width !== "contained" && `block-page__item--${width}`;
