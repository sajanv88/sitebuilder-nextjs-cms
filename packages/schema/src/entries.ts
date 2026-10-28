// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { HexColor, Uuid } from "./shared";

// Entries: slugs, paths and the inputs the admin sends (design §4.1). The rules that need the
// database (unique slugs, taken paths) are in packages/db; these are the ones that don't.

export const ENTRY_TYPES = ["page", "post"] as const;
export type EntryKind = (typeof ENTRY_TYPES)[number];

// ── Slugs ────────────────────────────────────────────────────────────────────────────────────

export const SLUG_MAX_LENGTH = 80;

// Lowercase a-z, 0-9 and -, 1 to 80 characters, no hyphen at either end.
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const Slug = v.pipe(
  v.string(),
  v.maxLength(SLUG_MAX_LENGTH, `Use at most ${SLUG_MAX_LENGTH} characters`),
  v.regex(SLUG_PATTERN, "Use lowercase letters, digits and hyphens, not at either end"),
);

// A slug field in a form: empty means "make one from the title".
export const SlugField = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.check(
    (s) => s === "" || (s.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(s)),
    "Use lowercase letters, digits and hyphens, not at either end",
  ),
);

function trimHyphens(s: string): string {
  return s.replace(/^-+|-+$/g, "");
}

// "Crème brûlée & Co." → "creme-brulee-co". Never empty: a title with nothing usable in it
// becomes "untitled".
export function slugify(title: string): string {
  const slug = trimHyphens(
    title
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),
  );
  return trimHyphens(slug.slice(0, SLUG_MAX_LENGTH)) || "untitled";
}

// "about" + 2 → "about-2", shortening the slug so the result still fits.
export function withSuffix(slug: string, n: number): string {
  const suffix = `-${n}`;
  return `${trimHyphens(slug.slice(0, SLUG_MAX_LENGTH - suffix.length))}${suffix}`;
}

// ── Paths ────────────────────────────────────────────────────────────────────────────────────

// First path segments a root page can't take: other routes own them. `admin-static` is the admin
// zone's asset prefix (decisions #1).
export const RESERVED_SEGMENTS = [
  "admin",
  "admin-static",
  "setup",
  "api",
  "media",
  "search",
  "_next",
  "feed.xml",
  "sitemap.xml",
  "robots.txt",
] as const;

// The site's search page (decisions #144).
export const SEARCH_PATH = "/search";

// A root page can't take a reserved segment, or the first segment of the posts path ("blog"),
// which the blog index owns.
export function isReservedRootSlug(slug: string, postsPath: string): boolean {
  const postsSegment = postsPath.split("/")[1] ?? "";
  return slug === postsSegment || (RESERVED_SEGMENTS as readonly string[]).includes(slug);
}

// The blog's own pages under the posts path (/blog/page/2, /blog/category/news, /blog/tag/x),
// so no post can take these slugs (decisions #67).
export const RESERVED_POST_SLUGS = ["page", "category", "tag"] as const;

export function isReservedPostSlug(slug: string): boolean {
  return (RESERVED_POST_SLUGS as readonly string[]).includes(slug);
}

// A page's path is its parent's path plus its slug; a root page's is "/" plus its slug.
export function pagePath(parentPath: string | null, slug: string): string {
  return `${parentPath ?? ""}/${slug}`;
}

// A post's path is the postsPath setting plus its slug.
export function postPath(postsPath: string, slug: string): string {
  return `${postsPath}/${slug}`;
}

// A category's or tag's archive: under the posts path, as /blog/category/news.
export function archivePath(postsPath: string, taxonomy: TaxonomyKind, slug: string): string {
  return `${postsPath}/${taxonomy}/${slug}`;
}

// A list's page: the list itself for page 1, then /page/2 and on.
export function listPagePath(base: string, page: number): string {
  return page > 1 ? `${base === "/" ? "" : base}/page/${page}` : base;
}

// ── Inputs ───────────────────────────────────────────────────────────────────────────────────

// Lengths the design leaves open (decisions #31): a title fits a heading, an excerpt a card, and
// the SEO fields what search results show.
export const ENTRY_LIMITS = {
  title: 200,
  excerpt: 500,
  seoTitle: 70,
  seoDescription: 160,
} as const;

// Optional text from a form: trimmed, and empty becomes null.
function optionalText(max: number) {
  return v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(max, `Use at most ${max} characters`),
    v.transform((s) => (s === "" ? null : s)),
  );
}

// An id picked from a list, or nothing ("").
const OptionalUuid = v.union([
  v.pipe(
    v.literal(""),
    v.transform(() => null),
  ),
  Uuid,
]);

// Better Auth's user ids are text.
export const UserId = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

// The page's own background colour, or none ("").
export const BackgroundField = v.union([
  v.pipe(
    v.literal(""),
    v.transform(() => null),
  ),
  HexColor,
]);

const TermIds = v.pipe(v.array(Uuid), v.maxLength(50, "Choose at most 50"));

// The fields the editor sends on save. `authorId` is honoured only for someone allowed to
// change a post's author (§6.1); `parentId` only for pages.
export const EntryFields = v.object({
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter a title"),
    v.maxLength(ENTRY_LIMITS.title, `Use at most ${ENTRY_LIMITS.title} characters`),
  ),
  slug: SlugField,
  excerpt: optionalText(ENTRY_LIMITS.excerpt),
  seoTitle: optionalText(ENTRY_LIMITS.seoTitle),
  seoDescription: optionalText(ENTRY_LIMITS.seoDescription),
  parentId: OptionalUuid,
  background: BackgroundField,
  authorId: v.optional(UserId),
  categoryIds: TermIds,
  tagIds: TermIds,
});
export type EntryFields = v.InferOutput<typeof EntryFields>;

// The entry's updatedAt as the editor last saw it (§4.1, concurrency): a save is refused when
// the stored value has moved on.
export const UpdatedAt = v.pipe(
  v.string(),
  v.isoTimestamp(),
  v.transform((s) => new Date(s)),
);

// When to publish: now (""), or at a date. A date in the future schedules the entry. The
// editor converts the browser's local time to UTC before sending.
export const PublishAt = v.union([
  v.pipe(
    v.literal(""),
    v.transform(() => null),
  ),
  v.pipe(
    v.string(),
    v.isoTimestamp("Enter a valid date and time"),
    v.transform((s) => new Date(s)),
  ),
]);

// What a save does besides saving: nothing, publish (or schedule), or unpublish.
export const SaveIntent = v.picklist(["save", "publish", "unpublish"]);
export type SaveIntent = v.InferOutput<typeof SaveIntent>;

// ── Lists ────────────────────────────────────────────────────────────────────────────────────

export const ENTRY_VIEWS = ["all", "published", "drafts", "scheduled", "trash"] as const;
export type EntryView = (typeof ENTRY_VIEWS)[number];

// The only columns a list sorts by (§8: a column id from the browser is untrusted text). A
// leading "-" sorts descending.
export const ENTRY_SORT_KEYS = ["title", "status", "author", "date"] as const;
export type EntrySortKey = (typeof ENTRY_SORT_KEYS)[number];
export const ENTRY_SORTS = ENTRY_SORT_KEYS.flatMap((key) => [key, `-${key}`] as const);
export type EntrySort = EntrySortKey | `-${EntrySortKey}`;

export const PAGE_SIZES = [10, 20, 50] as const;

// A list's state, read from the URL. A value that doesn't parse falls back to its default
// instead of failing the page: a hand-edited URL shows the list, not an error.
export const EntryListQuery = v.object({
  view: v.fallback(v.optional(v.picklist(ENTRY_VIEWS), "all"), "all"),
  sort: v.fallback(v.optional(v.picklist(ENTRY_SORTS), "-date"), "-date"),
  page: v.fallback(
    v.optional(
      v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1), v.maxValue(10_000)),
      "1",
    ),
    1,
  ),
  size: v.fallback(v.optional(v.pipe(v.string(), v.toNumber(), v.picklist(PAGE_SIZES)), "20"), 20),
  q: v.fallback(v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ""), ""),
});
export type EntryListQuery = v.InferOutput<typeof EntryListQuery>;

// ── Terms ────────────────────────────────────────────────────────────────────────────────────

export const TAXONOMIES = ["category", "tag"] as const;
export type TaxonomyKind = (typeof TAXONOMIES)[number];

export const TermInput = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter a name"),
    v.maxLength(80, "Use at most 80 characters"),
  ),
  slug: SlugField,
});
export type TermInput = v.InferOutput<typeof TermInput>;
