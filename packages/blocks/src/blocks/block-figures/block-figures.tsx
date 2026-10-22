// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { TrendingUpIcon } from "@nuvui/icons";
import { FormattedNumber, Stat, StatDescription, StatLabel, StatValue } from "@nuvui/react";
import * as v from "valibot";
import { alignClass, alignField, alignProp } from "../../align/align";
import { cx, optionalText, text } from "../../shared";
import type { BlockDefinition } from "../../types";
import { RollingNumber } from "./rolling-number";
import "./block-figures.scss";

const Item = v.strictObject({
  value: v.pipe(v.number(), v.finite(), v.minValue(-1e12), v.maxValue(1e12)),
  // Written around the number, such as "$" before or "+" or "%" after.
  prefix: optionalText(4),
  suffix: optionalText(8),
  label: text(60),
  description: optionalText(160),
});

const Props = v.strictObject({
  heading: optionalText(120),
  items: v.pipe(v.array(Item), v.minLength(1, "Add at least one figure"), v.maxLength(4)),
  animate: v.optional(v.boolean(), true),
  align: alignProp,
});
type Props = v.InferOutput<typeof Props>;

const newItem = () => ({ value: 100, suffix: "+", label: "Happy customers" });

// Digits after the point: as many as the number has, up to two.
const decimals = (value: number) => Math.min(2, (String(value).split(".")[1] ?? "").length);

// A row of big numbers that say how much, after nuvui's live-figures block: each with what it
// counts and a line about it. With `animate`, each rolls into place once, as it comes into view.
export const figures: BlockDefinition<Props> = {
  type: "figures",
  label: "Figures",
  description: "Up to four big numbers, such as customers served, that roll into place.",
  category: "marketing",
  icon: TrendingUpIcon,
  props: Props,
  defaults: () => ({
    items: [
      { value: 12000, suffix: "+", label: "Customers" },
      { value: 99.9, suffix: "%", label: "Uptime" },
      { value: 24, suffix: "/7", label: "Support" },
    ],
    animate: true,
  }),
  fields: [
    alignField(true),
    { kind: "text", name: "heading", label: "Heading", max: 120, optional: true },
    {
      kind: "list",
      name: "items",
      label: "Figures",
      itemLabel: "Figure",
      min: 1,
      max: 4,
      newItem,
      title: (item) => String(item.label ?? ""),
      fields: [
        { kind: "number", name: "value", label: "Number", min: -1e12, max: 1e12 },
        { kind: "text", name: "prefix", label: "Before the number", max: 4, optional: true },
        { kind: "text", name: "suffix", label: "After the number", max: 8, optional: true },
        { kind: "text", name: "label", label: "What it counts", max: 60 },
        {
          kind: "text",
          name: "description",
          label: "A line about it",
          max: 160,
          optional: true,
          multiline: true,
        },
      ],
    },
    {
      kind: "toggle",
      name: "animate",
      label: "Roll the numbers into place",
      description: "Once, as they come into view. Never for anyone who asked for less motion.",
    },
  ],
  summary: (props) => props.heading ?? props.items.map((item) => item.label).join(", "),
  Render: ({ props, context }) => (
    <div className={cx("block-figures", alignClass(props.align))}>
      {props.heading ? <h2 className="block-figures__title">{props.heading}</h2> : null}
      <ul className="block-figures__list">
        {props.items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: figures have no ids; the list is drawn whole from stored props.
          <li key={index}>
            <Stat className="block-figures__figure">
              <StatValue className="block-figures__value">
                {item.prefix}
                {props.animate ? (
                  <RollingNumber
                    value={item.value}
                    locale={context.dates.language}
                    maximumFractionDigits={decimals(item.value)}
                  />
                ) : (
                  <FormattedNumber
                    value={item.value}
                    locale={context.dates.language}
                    maximumFractionDigits={decimals(item.value)}
                  />
                )}
                {item.suffix}
              </StatValue>
              <StatLabel>{item.label}</StatLabel>
              {item.description ? <StatDescription>{item.description}</StatDescription> : null}
            </Stat>
          </li>
        ))}
      </ul>
    </div>
  ),
};
