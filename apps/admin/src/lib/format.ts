// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { MEDIA_TYPES, type MediaType } from "@sitebuilder/schema";

// 1048576 → "1 MB".
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

const TYPE_NAMES: Record<MediaType, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/webp": "WebP",
  "image/avif": "AVIF",
  "video/mp4": "MP4",
  "video/webm": "WebM",
  "application/pdf": "PDF",
};

// "JPEG image", "MP4 video", "PDF document".
export function describeType(type: MediaType): string {
  return `${TYPE_NAMES[type]} ${MEDIA_TYPES[type] === "document" ? "document" : MEDIA_TYPES[type]}`;
}

export const isImage = (type: MediaType): boolean => MEDIA_TYPES[type] === "image";
