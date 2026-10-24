// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ArrowLeftRightIcon } from "@nuvui/icons";
import { Compare } from "@nuvui/react";
import * as v from "valibot";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import { mediaId, optionalText, text } from "../../shared";
import { surfaceField, surfaceProps } from "../../surface/surface";
import type { BlockDefinition, RenderContext } from "../../types";
import { MediaImage } from "../block-image/block-image";
import "./block-compare.scss";

// Omitted: the file's own alt text. Empty: decorative (design §5.5), as on an image block.
const alt = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)));

const Props = v.strictObject({
  ...surfaceProps,
  beforeMediaId: mediaId,
  beforeAlt: alt,
  afterMediaId: mediaId,
  afterAlt: alt,
  beforeLabel: v.optional(text(30), "Before"),
  afterLabel: v.optional(text(30), "After"),
  mode: v.optional(v.picklist(["slider", "switch"]), "slider"),
  // What changed, in words: a screen reader can't see a difference that's only in the picture.
  caption: optionalText(200),
});
type Props = v.InferOutput<typeof Props>;

function Picture({
  context,
  id,
  alt: own,
}: {
  context: RenderContext;
  id: string;
  alt: string | undefined;
}) {
  const media = context.media(id);
  if (!media?.mimeType.startsWith("image/")) return null;
  return (
    <MediaImage
      context={context}
      media={media}
      alt={own ?? media.alt ?? ""}
      sizes="(min-width: 48rem) 48rem, 100vw"
    />
  );
}

// Two pictures of the same thing in one box, after nuvui's before-after block: a divider
// dragged by its handle, or a switch that shows one at a time.
export const compare: BlockDefinition<Props> = {
  type: "compare",
  label: "Before and after",
  description: "Two pictures of the same thing, with a divider to drag or a switch.",
  category: "media",
  icon: ArrowLeftRightIcon,
  props: Props,
  // No files yet: the editor asks for both, and a save refuses until they're chosen.
  defaults: () => ({
    beforeMediaId: "",
    afterMediaId: "",
    beforeLabel: "Before",
    afterLabel: "After",
    mode: "slider",
  }),
  surface: true,
  fields: [
    { kind: "media", name: "beforeMediaId", label: "Before", accept: "image" },
    { kind: "alt", name: "beforeAlt", label: "Before's alt text", max: 200 },
    { kind: "media", name: "afterMediaId", label: "After", accept: "image" },
    { kind: "alt", name: "afterAlt", label: "After's alt text", max: 200 },
    { kind: "text", name: "beforeLabel", label: "Name of before", max: 30 },
    { kind: "text", name: "afterLabel", label: "Name of after", max: 30 },
    {
      kind: "choice",
      name: "mode",
      label: "Show them",
      options: [
        { value: "slider", label: "Side by side, with a divider" },
        { value: "switch", label: "One at a time, with a switch" },
      ],
    },
    {
      kind: "text",
      name: "caption",
      label: "What changed",
      description: "Said in words under the pictures, for anyone who can't see them.",
      max: 200,
      optional: true,
    },
    surfaceField,
  ],
  summary: (props) => props.caption ?? `${props.beforeLabel} and ${props.afterLabel}`,
  Render: ({ props, context }) => {
    const before = <Picture context={context} id={props.beforeMediaId} alt={props.beforeAlt} />;
    const after = <Picture context={context} id={props.afterMediaId} alt={props.afterAlt} />;
    const ready =
      context.media(props.beforeMediaId)?.mimeType.startsWith("image/") &&
      context.media(props.afterMediaId)?.mimeType.startsWith("image/");
    if (!ready) {
      return context.editing ? (
        <BlockPlaceholder icon={ArrowLeftRightIcon}>
          Choose a before and an after image
        </BlockPlaceholder>
      ) : null;
    }
    return (
      <figure className="block-compare">
        <Compare
          before={before}
          after={after}
          mode={props.mode === "switch" ? "toggle" : "slider"}
          beforeLabel={props.beforeLabel}
          afterLabel={props.afterLabel}
          dividerLabel={`${props.beforeLabel} and ${props.afterLabel}`}
        />
        {props.caption ? (
          <figcaption className="block-compare__caption">{props.caption}</figcaption>
        ) : null}
      </figure>
    );
  },
};
