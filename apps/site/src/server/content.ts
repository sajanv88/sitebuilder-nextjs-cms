// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import {
  collectEntryIds,
  collectMediaIds,
  type PostSummary,
  type RenderMedia,
} from "@sitebuilder/blocks";
import {
  DEFAULT_READING,
  db,
  getEntryLinks,
  getMediaForRender,
  getMenu,
  getPublicEntry,
  getSettings,
  getTerm,
  listArchiveTerms,
  listLatestPosts,
  listPublicPosts,
  listSitemapEntries,
  type PublicEntry,
  type PublicPostCard,
  type PublicTerm,
  type ResolvedMenuItem,
  resolveMenu,
  type SitemapEntry,
} from "@sitebuilder/db";
import { mediaUrl } from "@sitebuilder/media";
import {
  type BlockList,
  CacheTags,
  DEFAULT_TEMPLATE,
  defaultSettings,
  type MenuLocation,
  type SettingsValue,
} from "@sitebuilder/schema";
import { cacheLife, cacheTag } from "next/cache";
import { env } from "@/env";
import "./template-blocks";

// Everything the public site reads, cached across requests and tagged (design §7). The admin
// zone invalidates the tags on every write, and the shared cache handler carries that to every
// site process (decisions #63). The profile only bounds how long an untouched entry is kept;
// changes don't wait for it.

function life() {
  cacheLife("days");
}

// ── Settings ─────────────────────────────────────────────────────────────────────────────────

export async function getSite(): Promise<SettingsValue<"site">> {
  "use cache";
  life();
  cacheTag(CacheTags.settings);
  return (await getSettings(db, "site")) ?? defaultSettings(env().SITE_URL).site;
}

export async function getTheme(): Promise<SettingsValue<"theme">> {
  "use cache";
  life();
  cacheTag(CacheTags.settings);
  return (await getSettings(db, "theme")) ?? defaultSettings(env().SITE_URL).theme;
}

// Which template is active, and its options' saved values.
export async function getTemplateSettings(): Promise<SettingsValue<"template">> {
  "use cache";
  life();
  cacheTag(CacheTags.settings, CacheTags.template);
  return (await getSettings(db, "template")) ?? DEFAULT_TEMPLATE;
}

export async function getReadingSettings(): Promise<SettingsValue<"reading">> {
  "use cache";
  life();
  cacheTag(CacheTags.settings);
  return (await getSettings(db, "reading")) ?? DEFAULT_READING;
}

// ── Menus ────────────────────────────────────────────────────────────────────────────────────

// A menu with its links worked out: items whose entry or term is gone, or not public, are left
// out (design §5.3). Entry paths, statuses and term slugs feed it, so it carries those tags too.
export async function getSiteMenu(location: MenuLocation): Promise<ResolvedMenuItem[]> {
  "use cache";
  life();
  cacheTag(CacheTags.menu(location), CacheTags.entries, CacheTags.terms, CacheTags.settings);
  const resolved = await resolveMenu(db, await getMenu(db, location));
  return resolved
    .map((item) => ({ ...item, children: item.children.filter((child) => child.href) }))
    .filter((item) => (item.kind === "group" ? item.children.length > 0 : item.href));
}

// ── Entries ──────────────────────────────────────────────────────────────────────────────────

export async function getEntry(id: string): Promise<PublicEntry | undefined> {
  "use cache";
  life();
  cacheTag(CacheTags.entry(id), CacheTags.entries, CacheTags.terms);
  return getPublicEntry(db, id);
}

export async function getPostsPage(
  page: number,
  termId: string | null,
): Promise<{ rows: PublicPostCard[]; total: number }> {
  "use cache";
  life();
  cacheTag(CacheTags.entries, CacheTags.terms, CacheTags.settings);
  const { postsPerPage } = await getReadingSettings();
  return listPublicPosts(db, { page, perPage: postsPerPage, termId });
}

export async function getArchiveTerm(id: string): Promise<PublicTerm | undefined> {
  "use cache";
  life();
  cacheTag(CacheTags.terms);
  return getTerm(db, id);
}

// ── What blocks point at ─────────────────────────────────────────────────────────────────────

export interface RenderData {
  media: Record<string, RenderMedia>;
  // Public entries' current paths, by id. Entries that aren't public aren't here, so links to
  // them draw nothing (design §5.3).
  links: Record<string, string>;
  posts: PostSummary[];
}

async function mediaFor(ids: readonly string[]): Promise<Record<string, RenderMedia>> {
  const rows = await getMediaForRender(db, ids);
  return Object.fromEntries(
    [...rows.values()].map((row) => [
      row.id,
      {
        id: row.id,
        url: mediaUrl(row.storageKey),
        mimeType: row.mimeType,
        width: row.width,
        height: row.height,
        alt: row.alt,
        filename: row.filename,
        sizeBytes: row.sizeBytes,
      },
    ]),
  );
}

// The files, links and latest posts a page's blocks need, plus any other files the page draws
// (a featured image, cards' pictures), in a few queries for the whole page.
export async function getRenderData(
  blocks: BlockList,
  extraMediaIds: readonly string[] = [],
): Promise<RenderData> {
  "use cache";
  life();
  cacheTag(CacheTags.entries, CacheTags.terms, CacheTags.media, CacheTags.settings);
  const reading = await getReadingSettings();
  const links = await getEntryLinks(db, collectEntryIds(blocks));
  const wantsPosts = JSON.stringify(blocks).includes('"type":"latest-posts"');
  const posts = wantsPosts ? await listLatestPosts(db) : [];
  return {
    media: await mediaFor([...collectMediaIds(blocks), ...extraMediaIds]),
    links: Object.fromEntries(
      [...links.values()]
        .filter((link) => link.public)
        .map((link) => [link.id, link.id === reading.homepageEntryId ? "/" : link.path]),
    ),
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      path: post.path,
      excerpt: post.excerpt,
      publishedAt: post.publishedAt.toISOString(),
      termIds: post.termIds,
    })),
  };
}

// The pictures for a list of cards.
export async function getCardMedia(ids: readonly string[]): Promise<Record<string, RenderMedia>> {
  "use cache";
  life();
  cacheTag(CacheTags.media);
  return mediaFor(ids);
}

// ── Sitemap and feed ─────────────────────────────────────────────────────────────────────────

export async function getSitemapData(): Promise<{
  entries: SitemapEntry[];
  terms: PublicTerm[];
  homepageEntryId: string | null;
}> {
  "use cache";
  life();
  cacheTag(CacheTags.entries, CacheTags.terms, CacheTags.settings);
  const [entries, terms, reading] = await Promise.all([
    listSitemapEntries(db),
    listArchiveTerms(db),
    getReadingSettings(),
  ]);
  return { entries, terms, homepageEntryId: reading.homepageEntryId };
}

// The newest posts for feed.xml, with their excerpts.
export async function getFeedPosts(): Promise<PublicPostCard[]> {
  "use cache";
  life();
  cacheTag(CacheTags.entries);
  return (await listPublicPosts(db, { page: 1, perPage: 20, termId: null })).rows;
}
