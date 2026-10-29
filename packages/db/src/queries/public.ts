// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  type BlockList,
  type EntryKind,
  type ReadingSettings,
  SEARCH_PATH,
  TAXONOMIES,
  type TaxonomyKind,
} from "@sitebuilder/schema";
import { and, asc, count, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { user } from "../schema/auth-schema";
import { type EntryStatus, entries } from "../schema/entries";
import { redirects } from "../schema/site";
import { entryTerms, terms } from "../schema/terms";
import { isPublic } from "./entries";
import { prefixRedirect } from "./redirects";
import { getSettings } from "./settings";

// What the public site reads (design §7). Everything here applies the visibility rule of §4.1:
// published, its time reached, not in the trash. Drafts are read only by preview.

export const DEFAULT_READING: ReadingSettings = {
  homepageEntryId: null,
  postsPerPage: 10,
  postsPath: "/blog",
  showReadingProgress: true,
  search: true,
};

export async function getReading(db: Executor): Promise<ReadingSettings> {
  return (await getSettings(db, "reading")) ?? DEFAULT_READING;
}

// ── Routing ──────────────────────────────────────────────────────────────────────────────────

export type PublicRoute =
  | { kind: "home" }
  | { kind: "entry"; id: string }
  | { kind: "posts"; page: number }
  | { kind: "term"; termId: string; page: number }
  | { kind: "search" }
  | { kind: "redirect"; to: string; status: number }
  | { kind: "missing" };

// Under the posts path: nothing, /page/<n>, /<taxonomy>/<slug>, or both (decisions #67).
const LIST_PATH = /^(?:\/(category|tag)\/([a-z0-9-]{1,80}))?(?:\/page\/(\d{1,6}))?$/;

// The blog, an archive or one of their pages, or null when the path isn't one. An archive whose
// slug no term has is null too, so a redirect from a renamed term's old slug can answer it.
async function listRoute(
  db: Executor,
  reading: ReadingSettings,
  path: string,
): Promise<PublicRoute | null> {
  const list = LIST_PATH.exec(path.slice(reading.postsPath.length));
  if (!list) return null;
  const [, taxonomy, slug, pageText] = list;
  const base = taxonomy ? `${reading.postsPath}/${taxonomy}/${slug}` : reading.postsPath;
  const page = pageText ? Number(pageText) : 1;
  // /page/1 is the list itself; /page/02 isn't a page.
  if (pageText && page === 1) return { kind: "redirect", to: base, status: 301 };
  if (pageText && (page < 2 || String(page) !== pageText)) return { kind: "missing" };

  let termId: string | null = null;
  if (taxonomy && slug) {
    const term = await getTermBySlug(db, taxonomy as TaxonomyKind, slug);
    if (!term) return null;
    termId = term.id;
  }
  const total = await countPublicPosts(db, termId);
  const lastPage = Math.max(1, Math.ceil(total / reading.postsPerPage));
  if (page > lastPage) return { kind: "missing" };
  return termId ? { kind: "term", termId, page } : { kind: "posts", page };
}

// What a request path is, decided before the page renders so the response can carry the right
// status (decisions #65). A few indexed lookups; the site zone's proxy calls it per page request.
export async function resolveRoute(db: Executor, path: string): Promise<PublicRoute> {
  if (path === "/") return { kind: "home" };
  if (path.length > 2048 || path.endsWith("/")) return { kind: "missing" };
  const reading = await getReading(db);

  if (path === reading.postsPath || path.startsWith(`${reading.postsPath}/`)) {
    const list = await listRoute(db, reading, path);
    if (list) return list;
  }

  const [entry] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.path, path), isPublic))
    .limit(1);
  if (entry) {
    // The home page answers at "/" only (§4.1).
    if (entry.id === reading.homepageEntryId) return { kind: "redirect", to: "/", status: 301 };
    return { kind: "entry", id: entry.id };
  }

  // Search, unless a page took the address before it was reserved: that page keeps it.
  if (path === SEARCH_PATH && reading.search) return { kind: "search" };

  const [redirect] = await db
    .select({ to: redirects.toPath, status: redirects.status })
    .from(redirects)
    .where(eq(redirects.fromPath, path))
    .limit(1);
  if (redirect) return { kind: "redirect", to: redirect.to, status: redirect.status };
  // A "/*" redirect that covers it (decisions #145), the closest first.
  const covering = await prefixRedirect(db, path);
  if (covering) return { kind: "redirect", ...covering };
  return { kind: "missing" };
}

// ── Entries ──────────────────────────────────────────────────────────────────────────────────

export interface PublicTerm {
  id: string;
  name: string;
  slug: string;
  taxonomy: TaxonomyKind;
}

export interface PublicEntry {
  id: string;
  type: EntryKind;
  // Always "published" from getPublicEntry; preview reads drafts too.
  status: EntryStatus;
  title: string;
  path: string;
  excerpt: string | null;
  content: BlockList;
  featuredMediaId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  // Its own background colour; null for the site's.
  background: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  authorId: string;
  authorName: string;
  // Categories and tags, for posts.
  terms: PublicTerm[];
}

async function readEntry(db: Executor, where: SQL | undefined): Promise<PublicEntry | undefined> {
  const [row] = await db
    .select({
      id: entries.id,
      type: entries.type,
      status: entries.status,
      title: entries.title,
      path: entries.path,
      excerpt: entries.excerpt,
      content: entries.content,
      featuredMediaId: entries.featuredMediaId,
      seoTitle: entries.seoTitle,
      seoDescription: entries.seoDescription,
      background: entries.background,
      publishedAt: entries.publishedAt,
      updatedAt: entries.updatedAt,
      authorId: entries.authorId,
      authorName: user.name,
    })
    .from(entries)
    .innerJoin(user, eq(user.id, entries.authorId))
    .where(where)
    .limit(1);
  if (!row) return undefined;
  const linked = await db
    .select({ id: terms.id, name: terms.name, slug: terms.slug, taxonomy: terms.taxonomy })
    .from(entryTerms)
    .innerJoin(terms, eq(terms.id, entryTerms.termId))
    .where(eq(entryTerms.entryId, row.id))
    .orderBy(asc(terms.taxonomy), asc(terms.name));
  return { ...row, terms: linked };
}

export async function getPublicEntry(db: Executor, id: string): Promise<PublicEntry | undefined> {
  return readEntry(db, and(eq(entries.id, id), isPublic));
}

// For preview: whatever is at the path now, published or not, as long as it isn't in the
// trash. The caller checks the viewer may see it.
export async function getEntryForPreview(
  db: Executor,
  path: string,
): Promise<PublicEntry | undefined> {
  return readEntry(db, and(eq(entries.path, path), isNull(entries.deletedAt)));
}

// For the editor's canvas: an entry by id, published or not, as long as it isn't in the trash.
// The caller checks the viewer may see it.
export async function getEntryForCanvas(
  db: Executor,
  id: string,
): Promise<PublicEntry | undefined> {
  return readEntry(db, and(eq(entries.id, id), isNull(entries.deletedAt)));
}

// ── Post lists ───────────────────────────────────────────────────────────────────────────────

export interface PublicPostCard {
  id: string;
  title: string;
  path: string;
  excerpt: string | null;
  featuredMediaId: string | null;
  publishedAt: Date;
}

// Public posts, or those linked to one term.
function postsWhere(termId: string | null) {
  return and(
    eq(entries.type, "post"),
    isPublic,
    termId
      ? sql`${entries.id} in (select ${entryTerms.entryId} from ${entryTerms} where ${entryTerms.termId} = ${termId})`
      : undefined,
  );
}

export async function countPublicPosts(db: Executor, termId: string | null): Promise<number> {
  const [row] = await db.select({ total: count() }).from(entries).where(postsWhere(termId));
  return row?.total ?? 0;
}

// One page of public posts, newest first: the blog index, an archive, the feed.
export async function listPublicPosts(
  db: Executor,
  input: { page: number; perPage: number; termId: string | null },
): Promise<{ rows: PublicPostCard[]; total: number }> {
  const rows = await db
    .select({
      id: entries.id,
      title: entries.title,
      path: entries.path,
      excerpt: entries.excerpt,
      featuredMediaId: entries.featuredMediaId,
      publishedAt: entries.publishedAt,
    })
    .from(entries)
    .where(postsWhere(input.termId))
    .orderBy(desc(entries.publishedAt), asc(entries.id))
    .limit(input.perPage)
    .offset((input.page - 1) * input.perPage);
  return {
    rows: rows.map((row) => ({ ...row, publishedAt: row.publishedAt ?? new Date(0) })),
    total: await countPublicPosts(db, input.termId),
  };
}

// ── Terms ────────────────────────────────────────────────────────────────────────────────────

export async function getTermBySlug(
  db: Executor,
  taxonomy: TaxonomyKind,
  slug: string,
): Promise<PublicTerm | undefined> {
  if (!(TAXONOMIES as readonly string[]).includes(taxonomy)) return undefined;
  const [term] = await db
    .select({ id: terms.id, name: terms.name, slug: terms.slug, taxonomy: terms.taxonomy })
    .from(terms)
    .where(and(eq(terms.taxonomy, taxonomy), eq(terms.slug, slug)))
    .limit(1);
  return term;
}

export async function getTerm(db: Executor, id: string): Promise<PublicTerm | undefined> {
  const [term] = await db
    .select({ id: terms.id, name: terms.name, slug: terms.slug, taxonomy: terms.taxonomy })
    .from(terms)
    .where(eq(terms.id, id))
    .limit(1);
  return term;
}

// ── Sitemap ──────────────────────────────────────────────────────────────────────────────────

export interface SitemapEntry {
  id: string;
  path: string;
  updatedAt: Date;
}

// Every public entry, for sitemap.xml. The limit is the sitemap format's own.
export async function listSitemapEntries(db: Executor): Promise<SitemapEntry[]> {
  return db
    .select({ id: entries.id, path: entries.path, updatedAt: entries.updatedAt })
    .from(entries)
    .where(isPublic)
    .orderBy(asc(entries.path))
    .limit(50_000);
}

// Terms with at least one public post: the archives worth listing.
export async function listArchiveTerms(db: Executor): Promise<PublicTerm[]> {
  return db
    .selectDistinct({ id: terms.id, name: terms.name, slug: terms.slug, taxonomy: terms.taxonomy })
    .from(terms)
    .innerJoin(entryTerms, eq(entryTerms.termId, terms.id))
    .innerJoin(entries, and(eq(entries.id, entryTerms.entryId), isPublic))
    .orderBy(asc(terms.taxonomy), asc(terms.slug))
    .limit(10_000);
}

// Published pages, for choosing the home page.
export async function listPublishedPages(
  db: Executor,
): Promise<{ id: string; title: string; path: string }[]> {
  return db
    .select({ id: entries.id, title: entries.title, path: entries.path })
    .from(entries)
    .where(and(eq(entries.type, "page"), isPublic))
    .orderBy(asc(entries.path))
    .limit(2000);
}

export async function isPublishedPage(db: Executor, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.type, "page"), isPublic))
    .limit(1);
  return row !== undefined;
}

// ── Search ───────────────────────────────────────────────────────────────────────────────────

// What someone typed, as a full-text query: its first eight words, each matching words that
// start with it, all of them needed. Only letters and digits get through, so nothing typed is
// query syntax. Null when there's nothing to search for.
export function searchTerms(text: string): string | null {
  const words = (
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
    .filter((word) => word.length <= 40)
    .slice(0, 8);
  return words.length > 0 ? words.map((word) => `${word}:*`).join(" & ") : null;
}

export interface SearchHit {
  id: string;
  type: EntryKind;
  title: string;
  path: string;
  // The excerpt, else the search description.
  summary: string | null;
  publishedAt: Date | null;
}

// Public pages and posts that match, best first (the title counts most), a page at a time.
export async function searchPublic(
  db: Executor,
  input: { text: string; page: number; perPage: number },
): Promise<{ rows: SearchHit[]; total: number }> {
  const terms = searchTerms(input.text);
  if (!terms) return { rows: [], total: 0 };
  const query = sql`to_tsquery('simple', ${terms})`;
  const where = and(isPublic, sql`${entries.search} @@ ${query}`);
  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: entries.id,
        type: entries.type,
        title: entries.title,
        path: entries.path,
        excerpt: entries.excerpt,
        seoDescription: entries.seoDescription,
        publishedAt: entries.publishedAt,
      })
      .from(entries)
      .where(where)
      .orderBy(
        desc(sql`ts_rank(${entries.search}, ${query})`),
        desc(entries.publishedAt),
        asc(entries.id),
      )
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage),
    db.select({ total: count() }).from(entries).where(where),
  ]);
  return {
    rows: rows.map(({ excerpt, seoDescription, ...row }) => ({
      ...row,
      summary: excerpt ?? seoDescription,
    })),
    total: counted?.total ?? 0,
  };
}
