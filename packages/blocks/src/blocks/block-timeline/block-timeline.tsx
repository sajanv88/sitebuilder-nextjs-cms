// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { GitCommitIcon } from "@nuvui/icons";
import {
  Timeline,
  TimelineContent,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
} from "@nuvui/react";
import * as v from "valibot";
import { optionalText, text } from "../../shared";
import { surfaceField, surfaceProps } from "../../surface/surface";
import type { BlockDefinition } from "../../types";
import "./block-timeline.scss";

const Item = v.strictObject({
  // As people write it: "2019", "March 2024", "Spring 2025".
  date: text(40),
  title: text(100),
  text: optionalText(300),
});

const Props = v.strictObject({
  ...surfaceProps,
  heading: optionalText(120),
  items: v.pipe(v.array(Item), v.minLength(1, "Add at least one event"), v.maxLength(20)),
});
type Props = v.InferOutput<typeof Props>;

const newItem = () => ({ date: "2026", title: "What happened", text: "A sentence about it." });

// A machine-readable date for <time>, when the words are one: a year, a month or a day in ISO
// form. Anything else ("Spring 2025") is written as plain text, since <time> without a
// datetime has to hold a valid date itself.
function isoDate(date: string): string | null {
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(date) ? date : null;
}

// A company's story or a project's milestones: dated events on nuvui's Timeline, in the order
// they're written.
export const timeline: BlockDefinition<Props> = {
  type: "timeline",
  label: "Timeline",
  description: "Dated events in order, such as a company's story or a project's milestones.",
  category: "data",
  icon: GitCommitIcon,
  props: Props,
  defaults: () => ({
    heading: "Our story",
    items: [
      { date: "2019", title: "Founded", text: "Two people and an idea." },
      { date: "2022", title: "First thousand customers" },
      { date: "2026", title: "Where we are now" },
    ],
  }),
  surface: true,
  fields: [
    { kind: "text", name: "heading", label: "Heading", max: 120, optional: true },
    {
      kind: "list",
      name: "items",
      label: "Events",
      itemLabel: "Event",
      min: 1,
      max: 20,
      newItem,
      title: (item) => `${String(item.date ?? "")} ${String(item.title ?? "")}`.trim(),
      fields: [
        {
          kind: "text",
          name: "date",
          label: "When",
          description: "As you'd write it, such as 2019 or March 2024.",
          max: 40,
        },
        { kind: "text", name: "title", label: "What happened", max: 100 },
        {
          kind: "text",
          name: "text",
          label: "More about it",
          max: 300,
          optional: true,
          multiline: true,
        },
      ],
    },
    surfaceField,
  ],
  summary: (props) => props.heading ?? `${props.items.length} events`,
  Render: ({ id, props }) => {
    const headingId = `block-timeline-${id}`;
    return (
      <div className="block-timeline">
        {props.heading ? (
          <h2 id={headingId} className="block-timeline__title">
            {props.heading}
          </h2>
        ) : null}
        <Timeline
          {...(props.heading ? { "aria-labelledby": headingId } : { "aria-label": "Timeline" })}
        >
          {props.items.map((item, index) => {
            const iso = isoDate(item.date);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: events have no ids; the list is drawn whole from stored props.
              <TimelineItem key={index}>
                <TimelineMarker />
                <TimelineContent>
                  {iso ? (
                    <TimelineTime dateTime={iso} className="block-timeline__date">
                      {item.date}
                    </TimelineTime>
                  ) : (
                    <p className="block-timeline__date">{item.date}</p>
                  )}
                  <TimelineTitle>{item.title}</TimelineTitle>
                  {item.text ? <TimelineDescription>{item.text}</TimelineDescription> : null}
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      </div>
    );
  },
};
