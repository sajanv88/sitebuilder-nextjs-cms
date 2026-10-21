// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ImageProps } from "@sitebuilder/blocks";
import Image from "next/image";

// Block pictures on the public site, resized by the site zone's image optimiser to the widths
// `sizes` asks for, as AVIF or WebP (decisions #70). The file is read from /media/<key>, the
// one local path next.config.ts allows.
export function SiteImage({ media, alt, className, sizes, priority }: ImageProps) {
  if (!media.width || !media.height) return null;
  return (
    <Image
      src={media.url}
      width={media.width}
      height={media.height}
      alt={alt}
      sizes={sizes}
      {...(className ? { className } : {})}
      // Next 16 prefers these to `preload` for a picture near the top of the page.
      {...(priority ? { loading: "eager", fetchPriority: "high" } : {})}
    />
  );
}
