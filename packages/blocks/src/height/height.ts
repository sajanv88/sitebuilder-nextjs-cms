// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import type { Field } from "../types";
import "./height.scss";

// How tall a band is (a section, a hero), and where its content sits when it's taller than
// that content (decisions #146): as tall as the content, as was the only way before, tall, or
// the whole screen. The classes go on the element that lays the content out.

export const HEIGHTS = ["content", "tall", "screen"] as const;
export const PLACES = ["start", "center", "end"] as const;

export const heightProps = {
  height: v.optional(v.picklist(HEIGHTS), "content"),
  place: v.optional(v.picklist(PLACES), "center"),
};

export const heightFields: readonly Field[] = [
  {
    kind: "choice",
    name: "height",
    label: "Height",
    options: [
      { value: "content", label: "As tall as its content" },
      { value: "tall", label: "Tall" },
      { value: "screen", label: "The whole screen" },
    ],
  },
  {
    kind: "choice",
    name: "place",
    label: "Content's place",
    description: "Where the content sits when the height is more than it needs.",
    options: [
      { value: "start", label: "Top" },
      { value: "center", label: "Middle" },
      { value: "end", label: "Bottom" },
    ],
  },
];

export function heightClasses(
  height: (typeof HEIGHTS)[number],
  place: (typeof PLACES)[number],
): string | false {
  return (
    height !== "content" && `block-height block-height--${height} block-height--place-${place}`
  );
}
