// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { SquareIcon } from "@nuvui/icons";
import * as v from "valibot";
import { alignClass, alignField } from "../../align/align";
import { Backdrop, backdropFields, backdropProps } from "../../backdrop/backdrop";
import { pageItemClass, pageWidthField, pageWidthOf, pageWidthProps } from "../../page/page";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import { cx } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-section.scss";

const Props = v.strictObject({
  ...pageWidthProps,
  // How wide the content inside the band is.
  width: v.optional(v.picklist(["narrow", "normal", "wide", "full"]), "normal"),
  background: v.optional(v.picklist(["none", "muted", "primary"]), "none"),
  paddingY: v.optional(v.picklist(["none", "sm", "md", "lg"]), "md"),
  // For every block inside that isn't aligned itself.
  align: v.optional(v.picklist(["start", "center", "end"]), "start"),
  ...backdropProps,
});
type Props = v.InferOutput<typeof Props>;

// A band across the page that holds other blocks, with a width on the page, a width for its
// content, a background color or a moving backdrop (design §5.2: any leaf block, 0 to 50).
export const section: BlockDefinition<Props> = {
  type: "section",
  label: "Section",
  description: "A band across the page, with a width and a background, holding other blocks.",
  category: "layout",
  icon: SquareIcon,
  props: Props,
  defaults: () => ({
    pageWidth: "contained",
    width: "normal",
    background: "none",
    paddingY: "md",
    align: "start",
    backdrop: "none",
    scrim: "strong",
    motion: "still",
  }),
  container: { allow: "leaves", min: 0, max: 50 },
  fields: [
    pageWidthField,
    {
      ...alignField(false),
      description: "For the blocks inside that aren't aligned themselves.",
    },
    {
      kind: "choice",
      name: "width",
      label: "Content width",
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
    ...backdropFields,
  ],
  summary: () => "Section",
  Render: ({ props, children, context }) => {
    const inner = (
      <div className={cx("block-section__inner", alignClass(props.align))}>
        {children ??
          (context.editing ? (
            <BlockPlaceholder icon={SquareIcon}>Add blocks to this section</BlockPlaceholder>
          ) : null)}
      </div>
    );
    const backdrop = props.backdrop === "none" ? null : props.backdrop;
    return (
      <section
        className={cx(
          "block-section",
          pageItemClass(pageWidthOf(props.pageWidth, context)),
          `block-section--width-${props.width}`,
          // A backdrop is drawn in place of the background color.
          !backdrop && `block-section--bg-${props.background}`,
          `block-section--pad-${props.paddingY}`,
          backdrop && "block-section--backdrop",
        )}
      >
        {backdrop ? (
          <Backdrop
            kind={backdrop}
            scrim={props.scrim}
            motion={props.motion}
            className="block-section__backdrop"
          >
            {inner}
          </Backdrop>
        ) : (
          inner
        )}
      </section>
    );
  },
};
