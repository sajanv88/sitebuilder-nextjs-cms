// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ColumnsIcon } from "@nuvui/icons";
import { Children } from "react";
import * as v from "valibot";
import { pageItemClass, pageWidthField, pageWidthOf, pageWidthProps } from "../../page/page";
import { cx } from "../../shared";
import type { BlockDefinition } from "../../types";
import { COLUMN_WIDTHS, widthsOf } from "./widths";
import "./block-columns.scss";

const Props = v.strictObject({
  ...pageWidthProps,
  gap: v.optional(v.picklist(["sm", "md", "lg"]), "md"),
  // Below this breakpoint the columns stack, one under another.
  stackBelow: v.optional(v.picklist(["sm", "md"]), "md"),
  // Side by side, where each column sits beside the others (decisions #146).
  valign: v.optional(v.picklist(["start", "center", "end"]), "start"),
  // Each column's share of the row (decisions #152), dragged on the canvas or picked here.
  widths: v.optional(v.picklist(COLUMN_WIDTHS), "equal"),
});
type Props = v.InferOutput<typeof Props>;

// Two to four columns side by side (design §5.2: columns hold only `column`).
export const columns: BlockDefinition<Props> = {
  type: "columns",
  label: "Columns",
  description: "Two to four columns side by side, stacked on a phone.",
  category: "layout",
  icon: ColumnsIcon,
  props: Props,
  defaults: () => ({
    pageWidth: "contained",
    gap: "md",
    stackBelow: "md",
    valign: "start",
    widths: "equal",
  }),
  container: { allow: ["column"], min: 2, max: 4 },
  fields: [
    pageWidthField,
    {
      kind: "widths",
      name: "widths",
      label: "Widths",
      description: "Or drag the line between two columns on the page.",
    },
    {
      kind: "choice",
      name: "gap",
      label: "Space between",
      options: [
        { value: "sm", label: "Small" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
      ],
    },
    {
      kind: "choice",
      name: "stackBelow",
      label: "Stack them on",
      options: [
        { value: "sm", label: "Phones" },
        { value: "md", label: "Phones and small tablets" },
      ],
    },
    {
      kind: "choice",
      name: "valign",
      label: "Line them up",
      description: "Where a shorter column sits beside a taller one.",
      options: [
        { value: "start", label: "At the top" },
        { value: "center", label: "In the middle" },
        { value: "end", label: "At the bottom" },
      ],
    },
  ],
  summary: () => "Columns",
  Render: ({ props, children, context }) => {
    const count = Math.min(Math.max(Children.count(children), 2), 4);
    const widths = widthsOf(props.widths, count);
    return (
      <div
        className={cx(
          "block-columns",
          pageItemClass(pageWidthOf(props.pageWidth, context)),
          `block-columns--gap-${props.gap}`,
          `block-columns--stack-${props.stackBelow}`,
          `block-columns--count-${count}`,
          props.valign !== "start" && `block-columns--valign-${props.valign}`,
          widths && `block-columns--widths-${widths.join("-")}`,
        )}
      >
        {children}
      </div>
    );
  },
};
