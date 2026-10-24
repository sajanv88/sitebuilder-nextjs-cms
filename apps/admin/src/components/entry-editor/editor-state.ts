// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { EntryForEdit } from "@sitebuilder/db";
import type { BlockList } from "@sitebuilder/schema";

// The editor's form state, shared by the save action (server) and the editor (browser). Dates
// travel as ISO strings.

export type EditorField =
  | "title"
  | "slug"
  | "excerpt"
  | "seoTitle"
  | "seoDescription"
  | "parentId"
  | "authorId"
  | "categoryIds"
  | "tagIds"
  | "publishAt"
  | "featuredMediaId"
  | "background";

// What the form shows. Strings, as typed: a failed save gives them back so nothing is lost.
export interface EditorValues {
  title: string;
  slug: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  parentId: string;
  authorId: string;
  categoryIds: string[];
  tagIds: string[];
  // "" for none.
  featuredMediaId: string;
  // The page's own background, "#rrggbb", or "" for the site's.
  background: string;
}

// The stored entry, with dates as ISO strings for the browser.
export interface EditorEntry {
  id: string;
  status: EntryForEdit["status"];
  path: string;
  publishedAt: string | null;
  updatedAt: string;
}

// A problem validateBlockList found, pinned to the block it's about (and its field, if any).
export interface BlockIssue {
  blockId: string;
  field: string | undefined;
  message: string;
}

export interface EditorState {
  result: "idle" | "saved" | "invalid" | "conflict" | "failed";
  message?: string;
  errors?: Partial<Record<EditorField, string>>;
  // Problems in the blocks: nothing was saved, and the editor marks each block.
  blockIssues?: BlockIssue[];
  values: EditorValues;
  entry: EditorEntry | null;
  // The blocks as stored after a save (rich text cleaned), which the editor takes up.
  content?: BlockList;
  // Changes on every save, so the editor can say "Saved" once per save.
  savedAt?: number;
  // The site's background after a save that set it ("" for none).
  siteBackground?: string;
}

export function toEditorEntry(entry: EntryForEdit): EditorEntry {
  return {
    id: entry.id,
    status: entry.status,
    path: entry.path,
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function toEditorValues(entry: EntryForEdit): EditorValues {
  return {
    title: entry.title,
    slug: entry.slug,
    excerpt: entry.excerpt ?? "",
    seoTitle: entry.seoTitle ?? "",
    seoDescription: entry.seoDescription ?? "",
    parentId: entry.parent?.id ?? "",
    authorId: entry.author.id,
    categoryIds: entry.categoryIds,
    tagIds: entry.tagIds,
    featuredMediaId: entry.featuredMediaId ?? "",
    background: entry.background ?? "",
  };
}
