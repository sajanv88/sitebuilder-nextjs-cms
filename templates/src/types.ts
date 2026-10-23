// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type {
  StarterContent,
  TemplateBlockDeclaration,
  TemplateManifest,
  TemplateOption,
} from "@sitebuilder/schema";
import type {
  ArchiveLayout,
  NotFoundLayout,
  PageLayout,
  PostLayout,
  SiteLayout,
  TemplateBlock,
} from "@sitebuilder/template-sdk";

// What `pnpm sitebuilder generate` writes for the admin zone (generated/admin.ts): data only,
// checked at build time. A screenshot is an image import, which the admin's bundler serves.

export interface TemplateImage {
  src: string;
  width: number;
  height: number;
}

export interface GeneratedTemplate {
  // "bundled" ships with Sitebuilder; "local" was added from a folder and isn't reviewed.
  source: "bundled" | "local";
  manifest: TemplateManifest;
  starter: StarterContent | null;
  screenshots: readonly { image: TemplateImage; label: string }[];
}

// What `generate` writes for the site zone (generated/site.ts): per template, its layouts and
// blocks, and the address of its compiled stylesheet.
export interface TemplateLayouts {
  site: SiteLayout;
  page: PageLayout;
  post: PostLayout;
  archive: ArchiveLayout;
  notFound: NotFoundLayout;
}

export interface GeneratedSiteTemplate {
  // Under /_templates/, named by a hash of its contents; null for a template without one.
  stylesheet: string | null;
  options: readonly TemplateOption[];
  // The layouts it has; the default template's draw the rest.
  layouts: Partial<TemplateLayouts>;
  // By block type, <slug>:<name>.
  blocks: Readonly<Record<string, TemplateBlock<Record<string, unknown>>>>;
}

// A loader for each block component a template declares, by block type (<slug>:<name>).
export type TemplateBlockLoaders = Readonly<
  Record<string, () => Promise<TemplateBlock<Record<string, unknown>>>>
>;

// What `generate` writes for both zones (generated/blocks.ts): each installed template's block
// declarations, as data.
export interface InstalledTemplateBlocks {
  slug: string;
  // The template's name, for the editor's note where its blocks can't be drawn.
  name: string;
  blocks: readonly TemplateBlockDeclaration[];
}
