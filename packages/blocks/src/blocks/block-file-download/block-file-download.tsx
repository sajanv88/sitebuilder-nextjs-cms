// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { DownloadIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import type { MediaType } from "@sitebuilder/schema";
import * as v from "valibot";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import { formatBytes, mediaId, text } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-file-download.scss";

const Props = v.strictObject({
  mediaId,
  label: text(80),
});
type Props = v.InferOutput<typeof Props>;

const KIND: Record<MediaType, string> = {
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/gif": "GIF image",
  "image/webp": "WebP image",
  "image/avif": "AVIF image",
  "video/mp4": "MP4 video",
  "video/webm": "WebM video",
  "application/pdf": "PDF",
};

export const fileDownload: BlockDefinition<Props> = {
  type: "file-download",
  label: "File download",
  description: "A button that downloads a file, with its type and size.",
  category: "media",
  icon: DownloadIcon,
  props: Props,
  defaults: () => ({ mediaId: "", label: "Download" }),
  fields: [
    { kind: "media", name: "mediaId", label: "File", accept: "any" },
    { kind: "text", name: "label", label: "Words on the button", max: 80 },
  ],
  summary: (props) => props.label,
  Render: ({ props, context }) => {
    const media = context.media(props.mediaId);
    if (!media) {
      return context.editing ? (
        <BlockPlaceholder icon={DownloadIcon}>Choose a file</BlockPlaceholder>
      ) : null;
    }
    const facts = `${KIND[media.mimeType]}, ${formatBytes(media.sizeBytes)}`;
    return (
      <div className="block-file-download">
        <Button asChild intent="secondary">
          <a href={media.url} download={media.filename}>
            <DownloadIcon aria-hidden="true" size={16} />
            {props.label}
            <span className="block-file-download__facts">{facts}</span>
          </a>
        </Button>
      </div>
    );
  },
};
