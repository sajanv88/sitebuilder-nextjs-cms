// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { StarIcon } from "@nuvui/icons";
import { Card, CardContent, Rating } from "@nuvui/react";
import * as v from "valibot";
import { CardRow, layoutField, layoutProp } from "../../card-row/card-row";
import { optionalText, text } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-reviews.scss";

const Item = v.strictObject({
  quote: text(500),
  author: text(80),
  role: optionalText(80),
  rating: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))),
});

const Props = v.strictObject({
  items: v.pipe(v.array(Item), v.minLength(1, "Add at least one review"), v.maxLength(12)),
  layout: layoutProp,
});
type Props = v.InferOutput<typeof Props>;

const newItem = () => ({ quote: "What they said about it.", author: "A customer", rating: 5 });

// After nuvui's reviews block, without its form: what people said, who said it, and their stars
// as a read-only Rating, which a screen reader reads as "5 out of 5".
export const reviews: BlockDefinition<Props> = {
  type: "reviews",
  label: "Reviews",
  description: "What customers said, with their names and stars.",
  category: "marketing",
  icon: StarIcon,
  props: Props,
  defaults: () => ({ items: [newItem(), newItem(), newItem()], layout: "grid" }),
  fields: [
    {
      kind: "list",
      name: "items",
      label: "Reviews",
      itemLabel: "Review",
      min: 1,
      max: 12,
      newItem,
      title: (item) => String(item.author ?? ""),
      fields: [
        { kind: "text", name: "quote", label: "What they said", max: 500, multiline: true },
        { kind: "text", name: "author", label: "Name", max: 80 },
        { kind: "text", name: "role", label: "Role or company", max: 80, optional: true },
        {
          kind: "choice",
          name: "rating",
          label: "Stars",
          numeric: true,
          options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
        },
      ],
    },
    layoutField,
  ],
  summary: (props) => `${props.items.length} reviews`,
  Render: ({ props }) => (
    <CardRow
      layout={props.layout}
      label="Reviews"
      className="block-reviews"
      cards={props.items.map((item, index) => ({
        // Reviews have no ids; the list is drawn whole from stored props.
        key: String(index),
        card: (
          <Card className="block-reviews__card">
            <CardContent className="block-reviews__body">
              {item.rating ? <Rating readOnly size="sm" value={item.rating} /> : null}
              <figure className="block-reviews__figure">
                <blockquote className="block-reviews__quote">
                  <p>{item.quote}</p>
                </blockquote>
                <figcaption className="block-reviews__who">
                  {item.author}
                  {item.role ? `, ${item.role}` : null}
                </figcaption>
              </figure>
            </CardContent>
          </Card>
        ),
      }))}
    />
  ),
};
