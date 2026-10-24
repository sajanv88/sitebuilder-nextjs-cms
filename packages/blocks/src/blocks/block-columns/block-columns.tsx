// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ColumnsIcon } from "@nuvui/icons";
import { Children } from "react";
import * as v from "valibot";
import { pageItemClass, pageWidthField, pageWidthOf, pageWidthProps } from "../../page/page";
import { cx } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-columns.scss";

const Props = v.strictObject({
  ...pageWidthProps,
  gap: v.optional(v.picklist(["sm", "md", "lg"]), "md"),
  // Below this breakpoint the columns stack, one under another.
  stackBelow: v.optional(v.picklist(["sm", "md"]), "md"),
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
  defaults: () => ({ pageWidth: "contained", gap: "md", stackBelow: "md" }),
  container: { allow: ["column"], min: 2, max: 4 },
  fields: [
    pageWidthField,
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
  ],
  summary: () => "Columns",
  Render: ({ props, children, context }) => {
    const count = Math.min(Math.max(Children.count(children), 2), 4);
    return (
      <div
        className={cx(
          "block-columns",
          pageItemClass(pageWidthOf(props.pageWidth, context)),
          `block-columns--gap-${props.gap}`,
          `block-columns--stack-${props.stackBelow}`,
          `block-columns--count-${count}`,
        )}
      >
        {children}
      </div>
    );
  },
};
