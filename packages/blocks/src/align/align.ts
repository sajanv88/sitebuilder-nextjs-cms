// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import type { Field } from "../types";
import "./align.scss";

// Horizontal alignment: start, center or end of the line, so a right-to-left site mirrors.
// A block's class sets --block-align, which its own styles read (text-align, justify-content,
// justify-self). A block left unset reads the value of the section around it, which sets it
// for everything inside; at the top of the page, start (decisions #93).

export const ALIGNS = ["start", "center", "end"] as const;
export type Align = (typeof ALIGNS)[number];

// For blocks that follow their section unless set.
export const alignProp = v.optional(v.picklist(ALIGNS));

export const alignField = (inherit: boolean): Field => ({
  kind: "align",
  name: "align",
  label: "Alignment",
  inherit,
  ...(inherit ? { description: "With none pressed, it follows the section it's in." } : {}),
});

// The class that sets --block-align, or nothing for a block that follows its section.
export const alignClass = (align: Align | undefined): string | false =>
  align !== undefined && `block-align--${align}`;
