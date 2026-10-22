// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { BlockRule, BlockRules } from "@sitebuilder/schema";
import { button } from "./blocks/block-button/block-button";
import { callout } from "./blocks/block-callout/block-callout";
import { column } from "./blocks/block-column/block-column";
import { columns } from "./blocks/block-columns/block-columns";
import { compare } from "./blocks/block-compare/block-compare";
import { faq } from "./blocks/block-faq/block-faq";
import { featureGrid } from "./blocks/block-feature-grid/block-feature-grid";
import { figures } from "./blocks/block-figures/block-figures";
import { fileDownload } from "./blocks/block-file-download/block-file-download";
import { gallery } from "./blocks/block-gallery/block-gallery";
import { heading } from "./blocks/block-heading/block-heading";
import { hero } from "./blocks/block-hero/block-hero";
import { image } from "./blocks/block-image/block-image";
import { latestPosts } from "./blocks/block-latest-posts/block-latest-posts";
import { pricing } from "./blocks/block-pricing/block-pricing";
import { quote } from "./blocks/block-quote/block-quote";
import { reviews } from "./blocks/block-reviews/block-reviews";
import { richText } from "./blocks/block-rich-text/block-rich-text";
import { section } from "./blocks/block-section/block-section";
import { separator } from "./blocks/block-separator/block-separator";
import { spacer } from "./blocks/block-spacer/block-spacer";
import { table } from "./blocks/block-table/block-table";
import { timeline } from "./blocks/block-timeline/block-timeline";
import { video } from "./blocks/block-video/block-video";
import type { AnyBlockDefinition } from "./types";

// The first block set (design §5.5), with compare, figures and timeline added since
// (decisions #84). Adding a block type is a folder in src/blocks/ and a line here (design §8);
// nothing else needs to know about it.
export const BLOCKS: readonly AnyBlockDefinition[] = [
  heading,
  richText,
  quote,
  button,
  callout,
  image,
  gallery,
  video,
  compare,
  fileDownload,
  section,
  columns,
  column,
  spacer,
  separator,
  hero,
  featureGrid,
  pricing,
  faq,
  reviews,
  figures,
  latestPosts,
  table,
  timeline,
];

// Every block type in use: the built-in ones, and the installed templates' (design A9), which
// each zone registers once at start-up, before it draws or checks any content.
let registered: readonly AnyBlockDefinition[] = BLOCKS;
let byType = new Map<string, AnyBlockDefinition>();
let leaves: readonly string[] = [];
let rules: BlockRules = {};

function index(definitions: readonly AnyBlockDefinition[]): void {
  registered = definitions;
  byType = new Map(definitions.map((definition) => [definition.type, definition]));
  // Every block type that isn't a container: what a section or a column may hold (design §5.2).
  leaves = definitions.filter((definition) => !definition.container).map((d) => d.type);
  // The rules validateBlockList checks content against.
  rules = Object.fromEntries(
    definitions.map((definition): [string, BlockRule] => {
      const spec = definition.container;
      if (!spec) return [definition.type, { props: definition.props }];
      return [
        definition.type,
        {
          props: definition.props,
          container: {
            allow: spec.allow === "leaves" ? [...leaves] : [...spec.allow],
            ...(spec.min !== undefined ? { min: spec.min } : {}),
            ...(spec.max !== undefined ? { max: spec.max } : {}),
          },
        },
      ];
    }),
  );
}
index(BLOCKS);

// The installed templates' blocks, "<slug>:<name>" (template-block.tsx). Registering again
// replaces the last set: what's installed is fixed for a build.
export function registerTemplateBlocks(definitions: readonly AnyBlockDefinition[]): void {
  index([...BLOCKS, ...definitions.filter((definition) => definition.type.includes(":"))]);
}

export const allBlocks = (): readonly AnyBlockDefinition[] => registered;

export function getBlockDefinition(type: string): AnyBlockDefinition | undefined {
  return byType.get(type);
}

export const leafTypes = (): readonly string[] => leaves;

export const blockRules = (): BlockRules => rules;

// Which types may go where: at the top of the page, anything but a lone column; inside a
// container, what its rule allows.
export function allowedChildren(parentType: string | null): readonly string[] {
  if (parentType === null) return registered.filter((d) => d.type !== "column").map((d) => d.type);
  return rules[parentType]?.container?.allow ?? [];
}
