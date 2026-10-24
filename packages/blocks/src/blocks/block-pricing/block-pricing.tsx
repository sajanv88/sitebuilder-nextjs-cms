// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { CheckIcon, CreditCardIcon } from "@nuvui/icons";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import * as v from "valibot";
import { Action, cx, optionalText, text } from "../../shared";
import { surfaceField, surfaceProps } from "../../surface/surface";
import type { BlockDefinition } from "../../types";
import "./block-pricing.scss";

const Plan = v.strictObject({
  name: text(60),
  price: text(30),
  period: optionalText(40),
  features: v.pipe(v.array(text(120)), v.maxLength(12)),
  cta: Action,
  highlighted: v.optional(v.boolean(), false),
});

const Props = v.strictObject({
  ...surfaceProps,
  plans: v.pipe(v.array(Plan), v.minLength(1, "Add at least one plan"), v.maxLength(4)),
});
type Props = v.InferOutput<typeof Props>;

const newPlan = () => ({
  name: "Plan",
  price: "$10",
  period: "a month",
  features: ["What's included"],
  cta: { label: "Choose", href: { kind: "url", url: "/" } },
  highlighted: false,
});

// After nuvui's pricing block: a card for each plan, side by side from the lg breakpoint, the
// button at the foot of every card.
export const pricing: BlockDefinition<Props> = {
  type: "pricing",
  label: "Pricing",
  description: "Plans side by side, with their price, what's included and a button.",
  category: "marketing",
  icon: CreditCardIcon,
  props: Props,
  defaults: () => ({ plans: [newPlan(), { ...newPlan(), highlighted: true }] as Props["plans"] }),
  surface: true,
  fields: [
    {
      kind: "list",
      name: "plans",
      label: "Plans",
      itemLabel: "Plan",
      min: 1,
      max: 4,
      newItem: newPlan,
      title: (item) => String(item.name ?? ""),
      fields: [
        { kind: "text", name: "name", label: "Name", max: 60 },
        {
          kind: "text",
          name: "price",
          label: "Price",
          max: 30,
          description: "As shown: $10, Free, €99.",
        },
        { kind: "text", name: "period", label: "Period", max: 40, optional: true },
        {
          kind: "strings",
          name: "features",
          label: "What's included",
          itemLabel: "Feature",
          min: 0,
          max: 12,
          maxLength: 120,
        },
        { kind: "action", name: "cta", label: "Button", max: 60 },
        { kind: "toggle", name: "highlighted", label: "Recommend this plan" },
      ],
    },
    surfaceField,
  ],
  summary: (props) => props.plans.map((plan) => plan.name).join(", "),
  Render: ({ props, context }) => (
    <ul className={`block-pricing block-pricing--count-${props.plans.length}`}>
      {props.plans.map((plan, index) => {
        const href = context.href(plan.cta.href);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: plans have no ids; the list is drawn whole from stored props.
          <li key={index}>
            <Card
              className={cx(
                "block-pricing__card",
                plan.highlighted && "block-pricing__card--highlighted",
              )}
            >
              <CardHeader>
                <CardTitle asChild>
                  <h3>{plan.name}</h3>
                </CardTitle>
                {plan.highlighted ? (
                  <CardAction>
                    <Badge intent="primary">Recommended</Badge>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent className="block-pricing__body">
                <p className="block-pricing__price">
                  <span className="block-pricing__amount">{plan.price}</span>
                  {plan.period ? ` ${plan.period}` : null}
                </p>
                {plan.features.length > 0 ? (
                  <ul className="block-pricing__features">
                    {plan.features.map((feature, featureIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: features are plain strings that may repeat.
                      <li key={featureIndex} className="block-pricing__feature">
                        <CheckIcon aria-hidden="true" size={16} className="block-pricing__check" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
              {href ? (
                <CardFooter>
                  <Button
                    asChild
                    intent={plan.highlighted ? "primary" : "secondary"}
                    className="block-pricing__action"
                  >
                    <a href={href} aria-label={`${plan.cta.label}, ${plan.name}`}>
                      {plan.cta.label}
                    </a>
                  </Button>
                </CardFooter>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  ),
};
