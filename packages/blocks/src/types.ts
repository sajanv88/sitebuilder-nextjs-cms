// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { IconComponent } from "@nuvui/icons";
import type { DateSettings, LinkTarget, MediaKind, MediaType } from "@sitebuilder/schema";
import type { ComponentType, ReactNode } from "react";
import type * as v from "valibot";

// A block type (design §5.5, §8 "Adding a block type"): what its props are, how it's drawn, and
// how the editor's inspector edits it. Each one lives in src/blocks/block-<type>/ and is listed
// in the registry.

// ── What a block can read while it's drawn ───────────────────────────────────────────────────

export interface RenderMedia {
  id: string;
  // Where browsers load it: /media/<key>, served by the site zone.
  url: string;
  mimeType: MediaType;
  width: number | null;
  height: number | null;
  alt: string | null;
  filename: string;
  sizeBytes: number;
}

export interface PostSummary {
  id: string;
  title: string;
  path: string;
  excerpt: string | null;
  // ISO, in UTC.
  publishedAt: string;
  termIds: readonly string[];
}

// Blocks don't query anything themselves. Whoever draws them (the site zone, or the editor's
// canvas) gathers what the blocks name and hands it over here.
export interface RenderContext {
  media(id: string): RenderMedia | undefined;
  // An entry's current path, or the URL itself. undefined for an entry that's gone or not public.
  href(target: LinkTarget): string | undefined;
  // The newest public posts, for latest-posts.
  posts: readonly PostSummary[];
  // True in the editor's canvas: blocks with nothing to show yet draw a placeholder.
  editing: boolean;
  // How dates are written, and the site's language for month names.
  dates: DateSettings & { language: string };
  // The block whose heading is the page's h1: a hero that opens the page (decisions #68).
  headingBlockId: string | null;
  // Draws a picture. The site zone passes one built on next/image (decisions #70); without
  // it, a plain <img> with the stored width and height.
  image?: ((props: ImageProps) => ReactNode) | undefined;
}

export interface ImageProps {
  media: RenderMedia;
  alt: string;
  className?: string | undefined;
  // How wide it's drawn, for choosing a file size: the `sizes` attribute.
  sizes: string;
  // Near the top of the page: load it first rather than lazily.
  priority?: boolean | undefined;
}

export interface BlockRenderProps<P> {
  id: string;
  props: P;
  context: RenderContext;
  // Containers only: their child blocks, already drawn.
  children?: ReactNode;
}

// ── How the inspector edits a block's props ──────────────────────────────────────────────────
// Fields are described here and drawn by the admin zone with nuvui controls, so this package
// has no editor UI in it.

export interface Choice {
  value: string;
  label: string;
}

interface FieldBase {
  name: string;
  label: string;
  description?: string;
}

export type Field =
  // Plain text. Optional ones are removed from the props when emptied.
  | (FieldBase & { kind: "text"; max: number; optional?: boolean; multiline?: boolean })
  // HTML, edited with nuvui's RichTextEditor and cleaned on the server.
  | (FieldBase & { kind: "richtext" })
  // `numeric`: the prop is a number, though the choices are written as text.
  | (FieldBase & { kind: "choice"; options: readonly Choice[]; numeric?: boolean })
  | (FieldBase & { kind: "toggle" })
  | (FieldBase & { kind: "number"; min: number; max: number })
  // A LinkTarget: an entry (followed through renames) or a URL.
  | (FieldBase & { kind: "link"; optional?: boolean })
  // { label, href: LinkTarget }, as a hero's or a plan's button.
  | (FieldBase & { kind: "action"; optional?: boolean; max: number })
  | (FieldBase & { kind: "media"; accept: MediaKind | "any"; optional?: boolean })
  | (FieldBase & { kind: "media-list"; accept: MediaKind; max: number })
  // An image's alt text: the file's own, written here, or none (decorative).
  | (FieldBase & { kind: "alt"; max: number })
  | (FieldBase & { kind: "icon" })
  // A list of short strings, such as a plan's features or a table's column labels.
  | (FieldBase & {
      kind: "strings";
      itemLabel: string;
      min: number;
      max: number;
      maxLength: number;
    })
  // Categories and tags, by id.
  | (FieldBase & { kind: "terms" })
  // Repeating items with fields of their own, such as questions in a FAQ.
  | (FieldBase & {
      kind: "list";
      itemLabel: string;
      min: number;
      max: number;
      fields: readonly Field[];
      newItem: () => Record<string, unknown>;
      // A line naming an item in the list, from its props.
      title: (item: Record<string, unknown>) => string;
    })
  // A table's rows: one text cell per column, as many columns as the `columns` field holds.
  | (FieldBase & { kind: "rows"; columnsFrom: string; max: number; maxLength: number });

export type BlockCategory = "text" | "media" | "layout" | "marketing" | "data";

export interface BlockDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  label: string;
  // A line for the inserter.
  description: string;
  category: BlockCategory;
  icon: IconComponent;
  // Strict: unknown props are refused, not ignored (design §5.2 check 4).
  props: v.GenericSchema<unknown, P>;
  // Props of a block just added. They may not pass `props` yet (an image with no file chosen);
  // the editor shows what's missing, and a save refuses until it's filled.
  defaults: () => P;
  // Containers only. "leaves" is every block type that isn't a container (design §5.2).
  container?: { allow: "leaves" | readonly string[]; min?: number; max?: number };
  fields: readonly Field[];
  // A short name for the block in the outline, from its props.
  summary: (props: P) => string;
  Render: ComponentType<BlockRenderProps<P>>;
}

// The registry holds definitions of different prop types side by side.
// biome-ignore lint/suspicious/noExplicitAny: each entry's own P is checked where it's defined; the list erases it, and props are parsed by the entry's schema before use.
export type AnyBlockDefinition = BlockDefinition<any>;
