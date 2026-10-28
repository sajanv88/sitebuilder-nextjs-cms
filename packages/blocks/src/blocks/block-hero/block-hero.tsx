// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { SparklesIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import * as v from "valibot";
import { alignClass, alignField } from "../../align/align";
import { Backdrop, backdropFields, backdropProps } from "../../backdrop/backdrop";
import { heightClasses, heightFields, heightProps } from "../../height/height";
import { pageItemClass, pageWidthField, pageWidthOf, pageWidthProps } from "../../page/page";
import { Action, cx, mediaId, optionalText, text } from "../../shared";
import type { BlockDefinition, RenderContext } from "../../types";
import { MediaImage } from "../block-image/block-image";
import "./block-hero.scss";

const Props = v.strictObject({
  ...pageWidthProps,
  eyebrow: optionalText(60),
  headline: text(120),
  body: optionalText(300),
  primaryAction: v.optional(Action),
  secondaryAction: v.optional(Action),
  imageMediaId: v.optional(mediaId),
  // Centered, as heroes were before alignment existed.
  align: v.optional(v.picklist(["start", "center", "end"]), "center"),
  ...heightProps,
  ...backdropProps,
});
type Props = v.InferOutput<typeof Props>;

function ActionLink({
  action,
  intent,
  context,
}: {
  action: Action | undefined;
  intent: "primary" | "secondary";
  context: RenderContext;
}) {
  const href = action ? context.href(action.href) : undefined;
  if (!action || !href) return null;
  return (
    <Button asChild size="lg" intent={intent}>
      <a href={href}>{action.label}</a>
    </Button>
  );
}

// The top of a landing page, after nuvui's hero block: a line over the headline, the headline,
// a sentence, two actions, and a picture under them.
export const hero: BlockDefinition<Props> = {
  type: "hero",
  label: "Hero",
  description: "The top of a landing page: a headline, a sentence, two buttons and a picture.",
  category: "marketing",
  icon: SparklesIcon,
  props: Props,
  defaults: () => ({
    eyebrow: "New",
    headline: "Say what you do in one line",
    body: "One or two sentences on who it's for and why it helps.",
    primaryAction: { label: "Get started", href: { kind: "url", url: "/" } },
    pageWidth: "contained",
    align: "center",
    height: "content",
    place: "center",
    backdrop: "none",
    scrim: "strong",
    motion: "still",
  }),
  fields: [
    pageWidthField,
    alignField(false),
    { kind: "text", name: "eyebrow", label: "Line over the headline", max: 60, optional: true },
    { kind: "text", name: "headline", label: "Headline", max: 120 },
    {
      kind: "text",
      name: "body",
      label: "Sentence under it",
      max: 300,
      optional: true,
      multiline: true,
    },
    { kind: "action", name: "primaryAction", label: "Main button", max: 60, optional: true },
    { kind: "action", name: "secondaryAction", label: "Second button", max: 60, optional: true },
    { kind: "media", name: "imageMediaId", label: "Picture", accept: "image", optional: true },
    ...heightFields,
    ...backdropFields,
  ],
  summary: (props) => props.headline,
  Render: ({ id, props, context }) => {
    const picture = props.imageMediaId ? context.media(props.imageMediaId) : undefined;
    // A hero that opens the page holds its h1; anywhere else it's a section's heading
    // (decisions #68).
    const lead = context.headingBlockId === id;
    const placed = pageItemClass(pageWidthOf(props.pageWidth, context));
    const Heading = lead ? "h1" : "h2";
    const tall = heightClasses(props.height, props.place);
    const content = (
      <>
        <div className="block-hero__inner">
          {props.eyebrow ? <p className="block-hero__eyebrow">{props.eyebrow}</p> : null}
          <Heading className="block-hero__title">{props.headline}</Heading>
          {props.body ? <p className="block-hero__lead">{props.body}</p> : null}
          <div className="block-hero__actions">
            <ActionLink action={props.primaryAction} intent="primary" context={context} />
            <ActionLink action={props.secondaryAction} intent="secondary" context={context} />
          </div>
        </div>
        {picture?.mimeType.startsWith("image/") ? (
          <div className="block-hero__picture">
            <MediaImage
              context={context}
              media={picture}
              alt={picture.alt ?? ""}
              className="block-hero__img"
              sizes="(min-width: 60rem) 60rem, 100vw"
              priority={lead}
            />
          </div>
        ) : null}
      </>
    );
    // With a backdrop, the backdrop is the hero's box, in place of the brand-color wash.
    if (props.backdrop !== "none") {
      return (
        <section
          className={cx(
            "block-hero",
            placed,
            "block-hero--backdrop",
            picture && "block-hero--with-picture",
            alignClass(props.align),
          )}
        >
          <Backdrop
            kind={props.backdrop}
            scrim={props.scrim}
            motion={props.motion}
            className={cx("block-hero__backdrop", tall)}
          >
            {content}
          </Backdrop>
        </section>
      );
    }
    return (
      <section
        className={cx(
          "block-hero",
          placed,
          picture && "block-hero--with-picture",
          alignClass(props.align),
          tall,
        )}
      >
        {content}
      </section>
    );
  },
};
