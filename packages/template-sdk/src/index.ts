// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ComponentType, ReactNode } from "react";

// What a template's code receives (design §14, docs/templates_and_ai_design.md A4). Plain props
// only: a layout never queries anything, and the host draws the blocks. A template imports
// from here, React, nuvui, next/link and next/image, and nothing else (TPL-IMPORT-001), so
// these types are the whole of the contract. They move with SITEBUILDER_VERSION in
// @sitebuilder/schema.

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────

export interface SiteInfo {
  title: string;
  tagline: string;
  // A BCP 47 tag, as on <html lang>.
  language: string;
  // The site's own address, with no trailing slash.
  url: string;
}

export interface MenuItem {
  id: string;
  label: string;
  // Where it goes; null for a group, and for a link that can't be followed.
  href: string | null;
  openInNewTab: boolean;
  // One level only.
  children: readonly MenuItem[];
}

export interface Menus {
  primary: readonly MenuItem[];
  footer: readonly MenuItem[];
}

// A date as the site writes it ("22/10/2026", in the site's format and time zone), and as a
// machine reads it, for <time dateTime>.
export interface DateInfo {
  iso: string;
  text: string;
}

// A picture from the media library. Draw it with next/image (its address is optimised by the
// site) or a plain <img> with these dimensions.
export interface ImageInfo {
  src: string;
  width: number | null;
  height: number | null;
  // Empty: decorative.
  alt: string;
}

// The values of the template's options (template.json `options`), each defaulted and checked.
export type TemplateOptionValues = Readonly<Record<string, boolean | string>>;

// ── Layouts ──────────────────────────────────────────────────────────────────────────────────

export interface EntryInfo {
  id: string;
  type: "page" | "post";
  title: string;
  path: string;
  excerpt: string | null;
  published: DateInfo | null;
  updated: DateInfo;
  authorName: string | null;
  // A post's featured picture.
  featured: ImageInfo | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface TermLink {
  taxonomy: "category" | "tag";
  name: string;
  href: string;
}

export interface PostCard {
  id: string;
  title: string;
  path: string;
  excerpt: string | null;
  published: DateInfo | null;
  image: ImageInfo | null;
}

export interface Pagination {
  page: number;
  pages: number;
  previous: string | null;
  next: string | null;
  // Every page's address, for numbered links.
  links: readonly { page: number; href: string }[];
}

// Around every public page: the header, the footer and the frame between them. `children` is
// the page's own layout. Every layout has a skip link to target: give the main region
// id="content".
export interface SiteLayoutProps {
  site: SiteInfo;
  menus: Menus;
  // The address the visitor is on, to mark the current menu item.
  currentPath: string;
  options: TemplateOptionValues;
  children: ReactNode;
}

// A page. `children` is its blocks, in a box the host draws as the page's grid (block-page,
// decisions #107), where fluid and full-width blocks run wider than the content column. Give it
// the page's full width, and set on an element around it the grid's margin each side
// (--block-page-gutter), its content width (--block-page-max) and, if you like, the space
// between blocks (--block-page-gap).
export interface PageLayoutProps {
  site: SiteInfo;
  entry: EntryInfo;
  // A hero that opens the page holds its h1 (decisions #68): then the layout doesn't print the
  // title as one.
  titleInContent: boolean;
  options: TemplateOptionValues;
  children: ReactNode;
}

export interface PostLayoutProps extends PageLayoutProps {
  terms: readonly TermLink[];
  // Settings → Reading: show a reading progress bar on posts.
  readingProgress: boolean;
}

// The blog, a category or a tag: a list of posts, a page at a time.
export interface ArchiveLayoutProps {
  site: SiteInfo;
  kind: "posts" | "category" | "tag";
  title: string;
  description: string | null;
  posts: readonly PostCard[];
  pagination: Pagination;
  options: TemplateOptionValues;
}

export interface NotFoundLayoutProps {
  site: SiteInfo;
  options: TemplateOptionValues;
}

export type SiteLayout = ComponentType<SiteLayoutProps>;
export type PageLayout = ComponentType<PageLayoutProps>;
export type PostLayout = ComponentType<PostLayoutProps>;
export type ArchiveLayout = ComponentType<ArchiveLayoutProps>;
export type NotFoundLayout = ComponentType<NotFoundLayoutProps>;

// ── Blocks ───────────────────────────────────────────────────────────────────────────────────
// A template block's fields, defaults and label are declared in template.json (decisions #112);
// its component file default-exports what defineBlock returns. It's drawn on the server for
// the site and in the browser for the editor's canvas, so it can't rely on either.

export type LinkTarget = { kind: "entry"; entryId: string } | { kind: "url"; url: string };

export interface MediaInfo extends ImageInfo {
  id: string;
  mimeType: string;
}

export interface TemplateBlockProps<P> {
  props: P;
  // A file named by a media field (mediaId, or a name ending in MediaId).
  media(id: string): MediaInfo | undefined;
  // Where a link field goes; undefined for an entry that's gone or not public.
  href(target: LinkTarget): string | undefined;
  // True in the editor's canvas: draw something for a block that's still empty.
  editing: boolean;
}

export type TemplateBlock<P> = ComponentType<TemplateBlockProps<P>>;

// Types a block's component by its props. The props have already passed the schema built from
// the declared fields, so they're what template.json says.
export function defineBlock<P extends Record<string, unknown>>(
  Render: TemplateBlock<P>,
): TemplateBlock<P> {
  return Render;
}
