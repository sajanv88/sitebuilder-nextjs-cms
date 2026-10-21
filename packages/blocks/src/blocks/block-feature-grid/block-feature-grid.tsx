// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { GridIcon } from "@nuvui/icons";
import { Card, CardDescription, CardHeader, CardTitle } from "@nuvui/react";
import * as v from "valibot";
import { FEATURE_ICONS, FeatureIcon } from "../../icons";
import { optionalText, text } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-feature-grid.scss";

const Item = v.strictObject({
  icon: FeatureIcon,
  title: text(80),
  text: text(240),
});

const Props = v.strictObject({
  heading: optionalText(120),
  items: v.pipe(v.array(Item), v.minLength(1, "Add at least one feature"), v.maxLength(12)),
});
type Props = v.InferOutput<typeof Props>;

const newItem = () => ({ icon: "sparkles", title: "A feature", text: "What it does for people." });

// After nuvui's feature-grid block: a card for each feature, as many to a row as fit.
export const featureGrid: BlockDefinition<Props> = {
  type: "feature-grid",
  label: "Feature grid",
  description: "Cards with an icon, a title and a sentence each.",
  category: "marketing",
  icon: GridIcon,
  props: Props,
  defaults: () => ({
    heading: "What you get",
    items: [newItem(), newItem(), newItem()] as Props["items"],
  }),
  fields: [
    { kind: "text", name: "heading", label: "Heading", max: 120, optional: true },
    {
      kind: "list",
      name: "items",
      label: "Features",
      itemLabel: "Feature",
      min: 1,
      max: 12,
      newItem,
      title: (item) => String(item.title ?? ""),
      fields: [
        { kind: "icon", name: "icon", label: "Icon" },
        { kind: "text", name: "title", label: "Title", max: 80 },
        { kind: "text", name: "text", label: "Sentence", max: 240, multiline: true },
      ],
    },
  ],
  summary: (props) => props.heading ?? `${props.items.length} features`,
  Render: ({ props }) => (
    <div className="block-feature-grid">
      {props.heading ? <h2 className="block-feature-grid__title">{props.heading}</h2> : null}
      <ul className="block-feature-grid__list">
        {props.items.map((item, index) => {
          const Icon = FEATURE_ICONS[item.icon];
          return (
            // Items have no ids; their order is their identity, and they're never reordered here.
            // biome-ignore lint/suspicious/noArrayIndexKey: the list is drawn whole from stored props.
            <li key={index}>
              <Card className="block-feature-grid__card">
                <CardHeader>
                  <span className="block-feature-grid__icon">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <CardTitle asChild>
                    <h3>{item.title}</h3>
                  </CardTitle>
                  <CardDescription>{item.text}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  ),
};
