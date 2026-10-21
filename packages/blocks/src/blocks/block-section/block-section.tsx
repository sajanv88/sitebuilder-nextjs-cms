// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { SquareIcon } from "@nuvui/icons";
import * as v from "valibot";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import { cx } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-section.scss";

const Props = v.strictObject({
  width: v.optional(v.picklist(["narrow", "normal", "wide", "full"]), "normal"),
  background: v.optional(v.picklist(["none", "muted", "primary"]), "none"),
  paddingY: v.optional(v.picklist(["none", "sm", "md", "lg"]), "md"),
});
type Props = v.InferOutput<typeof Props>;

// A band across the page that holds other blocks, with a width and a background (design §5.2:
// any leaf block, 0 to 50).
export const section: BlockDefinition<Props> = {
  type: "section",
  label: "Section",
  description: "A band across the page, with a width and a background, holding other blocks.",
  category: "layout",
  icon: SquareIcon,
  props: Props,
  defaults: () => ({ width: "normal", background: "none", paddingY: "md" }),
  container: { allow: "leaves", min: 0, max: 50 },
  fields: [
    {
      kind: "choice",
      name: "width",
      label: "Width",
      options: [
        { value: "narrow", label: "Narrow" },
        { value: "normal", label: "Normal" },
        { value: "wide", label: "Wide" },
        { value: "full", label: "Full width" },
      ],
    },
    {
      kind: "choice",
      name: "background",
      label: "Background",
      options: [
        { value: "none", label: "None" },
        { value: "muted", label: "Muted" },
        { value: "primary", label: "Brand color" },
      ],
    },
    {
      kind: "choice",
      name: "paddingY",
      label: "Space above and below",
      options: [
        { value: "none", label: "None" },
        { value: "sm", label: "Small" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
      ],
    },
  ],
  summary: () => "Section",
  Render: ({ props, children, context }) => (
    <section
      className={cx(
        "block-section",
        `block-section--width-${props.width}`,
        `block-section--bg-${props.background}`,
        `block-section--pad-${props.paddingY}`,
      )}
    >
      <div className="block-section__inner">
        {children ??
          (context.editing ? (
            <BlockPlaceholder icon={SquareIcon}>Add blocks to this section</BlockPlaceholder>
          ) : null)}
      </div>
    </section>
  ),
};
