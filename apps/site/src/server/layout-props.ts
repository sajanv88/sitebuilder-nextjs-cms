// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import type { RenderMedia } from "@sitebuilder/blocks";
import type { PublicEntry, PublicPostCard, ResolvedMenuItem } from "@sitebuilder/db";
import { archivePath, formatDate, listPagePath, type SettingsValue } from "@sitebuilder/schema";
import type {
  DateInfo,
  EntryInfo,
  ImageInfo,
  MenuItem,
  Pagination,
  PostCard,
  SiteInfo,
  TermLink,
} from "@sitebuilder/template-sdk";
import type { RenderData } from "./content";

// The site's data as a template's layouts receive it (@sitebuilder/template-sdk): plain values,
// dates already written in the site's format, addresses already worked out.

type Site = SettingsValue<"site">;

export function siteInfo(site: Site): SiteInfo {
  return { title: site.title, tagline: site.tagline, language: site.language, url: site.siteUrl };
}

export function menuItems(items: readonly ResolvedMenuItem[]): MenuItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    openInNewTab: item.openInNewTab,
    children: menuItems(item.children),
  }));
}

function dateInfo(date: Date, site: Site): DateInfo {
  return { iso: date.toISOString(), text: formatDate(date, site, site.language) };
}

// Pictures only; another kind of file isn't one a layout can draw.
function imageInfo(media: RenderMedia | undefined, alt: string | null): ImageInfo | null {
  if (!media?.mimeType.startsWith("image/")) return null;
  return { src: media.url, width: media.width, height: media.height, alt: alt ?? "" };
}

export function entryInfo(entry: PublicEntry, data: RenderData, site: Site): EntryInfo {
  const featured = entry.featuredMediaId ? data.media[entry.featuredMediaId] : undefined;
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    path: entry.path,
    excerpt: entry.excerpt,
    published: entry.publishedAt ? dateInfo(entry.publishedAt, site) : null,
    updated: dateInfo(entry.updatedAt, site),
    authorName: entry.authorName,
    featured: imageInfo(featured, featured?.alt ?? null),
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
  };
}

// A post's categories and tags, as links to their archives under the posts path.
export function termLinks(entry: PublicEntry, postsPath: string): TermLink[] {
  return entry.terms.map((term) => ({
    taxonomy: term.taxonomy,
    name: term.name,
    href: archivePath(postsPath, term.taxonomy, term.slug),
  }));
}

export function postCards(
  posts: readonly PublicPostCard[],
  media: Record<string, RenderMedia>,
  site: Site,
): PostCard[] {
  return posts.map((post) => ({
    id: post.id,
    title: post.title,
    path: post.path,
    excerpt: post.excerpt,
    published: dateInfo(post.publishedAt, site),
    image: imageInfo(post.featuredMediaId ? media[post.featuredMediaId] : undefined, ""),
  }));
}

// Pages are addresses: /blog, /blog/page/2.
export function pagination(
  page: number,
  total: number,
  perPage: number,
  basePath: string,
): Pagination {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return {
    page,
    pages,
    previous: page > 1 ? listPagePath(basePath, page - 1) : null,
    next: page < pages ? listPagePath(basePath, page + 1) : null,
    links: Array.from({ length: pages }, (_, index) => ({
      page: index + 1,
      href: listPagePath(basePath, index + 1),
    })),
  };
}
