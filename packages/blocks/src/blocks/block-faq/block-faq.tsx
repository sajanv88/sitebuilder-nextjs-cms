// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { HelpCircleIcon } from "@nuvui/icons";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@nuvui/react";
import * as v from "valibot";
import { text } from "../../shared";
import { surfaceField, surfaceProps } from "../../surface/surface";
import type { BlockDefinition } from "../../types";
import "./block-faq.scss";

const Item = v.strictObject({
  question: text(200),
  answer: text(1000),
});

const Props = v.strictObject({
  ...surfaceProps,
  items: v.pipe(v.array(Item), v.minLength(1, "Add at least one question"), v.maxLength(20)),
});
type Props = v.InferOutput<typeof Props>;

const newItem = () => ({ question: "A question people ask?", answer: "The answer." });

// After nuvui's faq block: one answer open at a time, and the open one can be closed.
export const faq: BlockDefinition<Props> = {
  type: "faq",
  label: "Questions and answers",
  description: "Questions that open to show their answers.",
  category: "marketing",
  icon: HelpCircleIcon,
  props: Props,
  defaults: () => ({ items: [newItem(), newItem()] }),
  surface: true,
  fields: [
    {
      kind: "list",
      name: "items",
      label: "Questions",
      itemLabel: "Question",
      min: 1,
      max: 20,
      newItem,
      title: (item) => String(item.question ?? ""),
      fields: [
        { kind: "text", name: "question", label: "Question", max: 200 },
        { kind: "text", name: "answer", label: "Answer", max: 1000, multiline: true },
      ],
    },
    surfaceField,
  ],
  summary: (props) => `${props.items.length} questions`,
  Render: ({ id, props }) => (
    <Accordion type="single" collapsible className="block-faq">
      {props.items.map((item, index) => (
        // The block's id keeps item values unique when a page has two of these.
        // biome-ignore lint/suspicious/noArrayIndexKey: questions have no ids; the list is drawn whole from stored props.
        <AccordionItem key={index} value={`${id}-${index}`}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  ),
};
