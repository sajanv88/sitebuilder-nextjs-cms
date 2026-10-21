// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { MediaType } from "@sitebuilder/schema";
import { imageSize } from "image-size";

// Width and height of an image, as it will be shown. EXIF orientations 5 to 8 turn a photo on
// its side, so its stored width and height swap. Video and PDF have none here.
export function readDimensions(
  bytes: Uint8Array,
  type: MediaType,
): { width: number; height: number } | null {
  if (!type.startsWith("image/")) return null;
  try {
    const size = imageSize(bytes);
    const turned = size.orientation !== undefined && size.orientation >= 5;
    return turned
      ? { width: size.height, height: size.width }
      : { width: size.width, height: size.height };
  } catch {
    return null;
  }
}
