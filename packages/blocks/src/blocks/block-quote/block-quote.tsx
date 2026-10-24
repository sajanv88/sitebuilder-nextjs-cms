// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { QuoteIcon } from "@nuvui/icons";
import * as v from "valibot";
import { alignClass, alignField, alignProp } from "../../align/align";
import { cx, optionalText, text } from "../../shared";
import { surfaceField, surfaceProps } from "../../surface/surface";
import type { BlockDefinition } from "../../types";
import "./block-quote.scss";

const Props = v.strictObject({
  ...surfaceProps,
  text: text(1000),
  cite: optionalText(200),
  align: alignProp,
});
type Props = v.InferOutput<typeof Props>;

export const quote: BlockDefinition<Props> = {
  type: "quote",
  label: "Quote",
  description: "Someone's words, and who said them.",
  category: "text",
  icon: QuoteIcon,
  props: Props,
  defaults: () => ({ text: "A quote worth repeating." }),
  surface: true,
  fields: [
    alignField(true),
    { kind: "text", name: "text", label: "Quote", max: 1000, multiline: true },
    { kind: "text", name: "cite", label: "Who said it", max: 200, optional: true },
    surfaceField,
  ],
  summary: (props) => props.text,
  Render: ({ props }) => (
    <figure className={cx("block-quote", alignClass(props.align))}>
      <blockquote className="block-quote__text">
        <p>{props.text}</p>
      </blockquote>
      {props.cite ? <figcaption className="block-quote__cite">{props.cite}</figcaption> : null}
    </figure>
  ),
};
