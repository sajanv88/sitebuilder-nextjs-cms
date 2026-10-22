// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ImageIcon } from "@nuvui/icons";
import { AspectRatio } from "@nuvui/react";
import { LinkTarget } from "@sitebuilder/schema";
import type { ReactNode } from "react";
import * as v from "valibot";
import { alignClass, alignField, alignProp } from "../../align/align";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import { cx, mediaId, optionalText } from "../../shared";
import type { BlockDefinition, ImageProps, RenderContext } from "../../types";
import "./block-image.scss";

const RATIOS = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1 } as const;

const Props = v.strictObject({
  mediaId,
  // Omitted: the file's own alt text. Empty: decorative, read by nothing (design §5.5).
  alt: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  caption: optionalText(200),
  link: v.optional(LinkTarget),
  ratio: v.optional(v.picklist(["auto", "16:9", "4:3", "1:1"]), "auto"),
  fit: v.optional(v.picklist(["cover", "contain"]), "cover"),
  align: alignProp,
});
type Props = v.InferOutput<typeof Props>;

// A picture from the media library. The site draws it with next/image, resized to the widths
// `sizes` asks for (decisions #70); the editor's canvas, and a file without stored dimensions,
// get a plain <img> with its width and height, so the page doesn't jump when it loads.
export function MediaImage({ context, ...image }: ImageProps & { context: RenderContext }) {
  const { media, alt, className, priority } = image;
  if (context.image && media.width && media.height) return context.image(image);
  return (
    // biome-ignore lint/performance/noImgElement: the editor's canvas runs in the admin zone, which doesn't serve /media for next/image (decisions #70).
    <img
      className={className}
      src={media.url}
      alt={alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

export const image: BlockDefinition<Props> = {
  type: "image",
  label: "Image",
  description: "A picture from the media library, with a caption and a link.",
  category: "media",
  icon: ImageIcon,
  props: Props,
  // No file yet: the editor asks for one, and a save refuses until it's chosen.
  defaults: () => ({ mediaId: "", ratio: "auto", fit: "cover" }),
  fields: [
    {
      ...alignField(true),
      description:
        "For a picture narrower than its column, as uploaded. With none pressed, it follows the section it's in.",
    },
    { kind: "media", name: "mediaId", label: "Image", accept: "image" },
    {
      kind: "alt",
      name: "alt",
      label: "Alt text",
      max: 200,
      description: "What the picture shows, for people who can't see it.",
    },
    { kind: "text", name: "caption", label: "Caption", max: 200, optional: true },
    { kind: "link", name: "link", label: "Links to", optional: true },
    {
      kind: "choice",
      name: "ratio",
      label: "Shape",
      options: [
        { value: "auto", label: "As uploaded" },
        { value: "16:9", label: "Wide (16:9)" },
        { value: "4:3", label: "Standard (4:3)" },
        { value: "1:1", label: "Square" },
      ],
    },
    {
      kind: "choice",
      name: "fit",
      label: "Fit",
      description: "Only for a set shape: crop to fill it, or show all of the picture.",
      options: [
        { value: "cover", label: "Fill and crop" },
        { value: "contain", label: "Show all of it" },
      ],
    },
  ],
  summary: (props) => props.caption ?? props.alt ?? "Image",
  Render: ({ props, context }) => {
    const media = context.media(props.mediaId);
    if (!media?.mimeType.startsWith("image/")) {
      return context.editing ? (
        <BlockPlaceholder icon={ImageIcon}>Choose an image</BlockPlaceholder>
      ) : null;
    }
    const alt = props.alt ?? media.alt ?? "";
    let picture: ReactNode = (
      <MediaImage
        context={context}
        media={media}
        alt={alt}
        className="block-image__img"
        // At most the widest section; a column draws it narrower, which costs a larger file.
        sizes="(min-width: 80rem) 80rem, 100vw"
      />
    );
    if (props.ratio !== "auto") {
      picture = <AspectRatio ratio={RATIOS[props.ratio]}>{picture}</AspectRatio>;
    }
    const href = props.link ? context.href(props.link) : undefined;
    if (href) {
      picture = (
        <a className="block-image__link" href={href}>
          {picture}
        </a>
      );
    }
    return (
      <figure
        className={cx(
          "block-image",
          props.fit === "contain" && "block-image--contain",
          // Only a picture at its own size can sit anywhere but across the whole column.
          props.ratio === "auto" && "block-image--natural",
          alignClass(props.align),
        )}
      >
        {picture}
        {props.caption ? (
          <figcaption className="block-image__caption">{props.caption}</figcaption>
        ) : null}
      </figure>
    );
  },
};
