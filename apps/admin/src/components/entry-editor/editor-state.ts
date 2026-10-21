import type { EntryForEdit } from "@sitebuilder/db";

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
  | "publishAt";

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
}

// The stored entry, with dates as ISO strings for the browser.
export interface EditorEntry {
  id: string;
  status: EntryForEdit["status"];
  path: string;
  publishedAt: string | null;
  updatedAt: string;
}

export interface EditorState {
  result: "idle" | "saved" | "invalid" | "conflict" | "failed";
  message?: string;
  errors?: Partial<Record<EditorField, string>>;
  values: EditorValues;
  entry: EditorEntry | null;
  // Changes on every save, so the editor can say "Saved" once per save.
  savedAt?: number;
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
  };
}
