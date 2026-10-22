// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { HeadingIcon } from "@nuvui/icons";
import * as v from "valibot";
import { alignClass, alignField, alignProp } from "../../align/align";
import { cx, text } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-heading.scss";

const Props = v.strictObject({
  text: text(200),
  level: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(6)), 2),
  // Headings saved before decisions #93 carry "start"; new ones follow their section.
  align: alignProp,
});
type Props = v.InferOutput<typeof Props>;

const TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export const heading: BlockDefinition<Props> = {
  type: "heading",
  label: "Heading",
  description: "A title for a part of the page.",
  category: "text",
  icon: HeadingIcon,
  props: Props,
  defaults: () => ({ text: "Heading", level: 2 }),
  fields: [
    alignField(true),
    { kind: "text", name: "text", label: "Text", max: 200 },
    {
      kind: "choice",
      name: "level",
      label: "Level",
      description: "Level 1 is the page's title; use 2 for the parts under it, 3 inside those.",
      options: TAGS.map((tag, index) => ({ value: String(index + 1), label: tag.toUpperCase() })),
      numeric: true,
    },
  ],
  summary: (props) => props.text,
  Render: ({ props }) => {
    const Tag = TAGS[props.level - 1] ?? "h2";
    return (
      <Tag
        className={cx(
          "block-heading",
          `block-heading--level-${props.level}`,
          alignClass(props.align),
        )}
      >
        {props.text}
      </Tag>
    );
  },
};
