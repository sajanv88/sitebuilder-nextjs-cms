// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { PAGE_SIZES } from "./entries";
import { Uuid } from "./shared";

// Uploaded files (design §4.2). The type is decided from the file's bytes by packages/media;
// these are the inputs about files that come from forms and URLs.

// The types a file may have, and the kind each belongs to for filtering.
export const MEDIA_TYPES = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/avif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "document",
  // Fonts for the theme (Appearance → Fonts, decisions #148).
  "font/woff2": "font",
} as const;
export type MediaType = keyof typeof MEDIA_TYPES;
export type MediaKind = (typeof MEDIA_TYPES)[MediaType];
export const MEDIA_KINDS = [
  "image",
  "video",
  "document",
  "font",
] as const satisfies readonly MediaKind[];

export const MEDIA_ALT_MAX = 200;

export const MediaId = Uuid;

// Alt text. Empty is allowed: it marks an image as decorative.
export const MediaAlt = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(MEDIA_ALT_MAX, `Use at most ${MEDIA_ALT_MAX} characters`),
);

// The Media screen's state, read from the URL. Like EntryListQuery, a value that doesn't parse
// falls back to its default instead of failing the page.
export const MediaListQuery = v.object({
  kind: v.fallback(v.optional(v.picklist(["all", ...MEDIA_KINDS]), "all"), "all"),
  page: v.fallback(
    v.optional(
      v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1), v.maxValue(10_000)),
      "1",
    ),
    1,
  ),
  size: v.fallback(v.optional(v.pipe(v.string(), v.toNumber(), v.picklist(PAGE_SIZES)), "20"), 20),
  q: v.fallback(v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ""), ""),
  // Files uploaded in one month, as 2026-10 (UTC, as storage keys are), or "" for any.
  month: v.fallback(v.optional(v.pipe(v.string(), v.regex(/^\d{4}-(0[1-9]|1[0-2])$/)), ""), ""),
  // Pictures in a grid, or rows in a list.
  view: v.fallback(v.optional(v.picklist(["grid", "list"]), "grid"), "grid"),
});
export type MediaListQuery = v.InferOutput<typeof MediaListQuery>;

// Where a file is stored. Each file keeps the storage it was uploaded to (decisions #48).
export const MEDIA_STORAGES = ["local", "s3"] as const;
export type MediaStorageKind = (typeof MEDIA_STORAGES)[number];
