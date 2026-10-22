// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { VideoIcon } from "@nuvui/icons";
import { VideoPlayer } from "@nuvui/media/video-player";
import * as v from "valibot";
import { pageItemClass, pageWidthField, pageWidthOf, pageWidthProps } from "../../page/page";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import { cx, mediaId, text } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-video.scss";

const Props = v.strictObject({
  ...pageWidthProps,
  mediaId,
  // The player's accessible name (design §5.5), and what a phone's lock screen shows.
  title: text(120),
  posterMediaId: v.optional(mediaId),
});
type Props = v.InferOutput<typeof Props>;

// nuvui's VideoPlayer. `lazy` loads nothing until the player is near the screen. The file is
// same-origin under /media/, so the CSP needs nothing more (nuvui's CSP guide).
export const video: BlockDefinition<Props> = {
  type: "video",
  label: "Video",
  description: "An MP4 or WebM file from the media library, with a player.",
  category: "media",
  icon: VideoIcon,
  props: Props,
  defaults: () => ({ pageWidth: "contained", mediaId: "", title: "Video" }),
  fields: [
    pageWidthField,
    { kind: "media", name: "mediaId", label: "Video", accept: "video" },
    {
      kind: "text",
      name: "title",
      label: "Title",
      max: 120,
      description: "What the video is. Screen readers say it as the player's name.",
    },
    {
      kind: "media",
      name: "posterMediaId",
      label: "Picture before it plays",
      accept: "image",
      optional: true,
    },
  ],
  summary: (props) => props.title,
  Render: ({ props, context }) => {
    const media = context.media(props.mediaId);
    if (!media?.mimeType.startsWith("video/")) {
      return context.editing ? (
        <BlockPlaceholder icon={VideoIcon}>Choose a video</BlockPlaceholder>
      ) : null;
    }
    const poster = props.posterMediaId ? context.media(props.posterMediaId) : undefined;
    const width = pageWidthOf(props.pageWidth, context);
    return (
      <VideoPlayer
        className={cx("block-video", pageItemClass(width), width === "full" && "block-video--edge")}
        title={props.title}
        src={{ src: media.url, type: media.mimeType }}
        {...(poster?.mimeType.startsWith("image/") ? { poster: poster.url } : {})}
        lazy
      />
    );
  },
};
