// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { type Field, getBlockDefinition, headingBlockId } from "@sitebuilder/blocks";
import type { Block } from "@sitebuilder/schema";

// What the Page tab says about the page: how many words a visitor reads, how long that takes,
// and its headings. Read from the blocks' own fields, so alt text, links and settings don't
// count, and nothing depends on how the canvas happens to be drawn.

export const WORDS_A_MINUTE = 200;

const TAG = /<[^>]*>/g;
const words = (text: string) => text.replace(TAG, " ").split(/\s+/).filter(Boolean).length;

function textOf(fields: readonly Field[], props: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const field of fields) {
    const value = props[field.name];
    switch (field.kind) {
      case "text":
      case "richtext":
        if (typeof value === "string") found.push(value);
        break;
      case "action":
        if (value && typeof value === "object" && "label" in value) found.push(String(value.label));
        break;
      case "strings":
        if (Array.isArray(value)) found.push(...value.map(String));
        break;
      case "rows":
        if (Array.isArray(value)) found.push(...value.flat().map(String));
        break;
      case "list":
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === "object") {
              found.push(...textOf(field.fields, item as Record<string, unknown>));
            }
          }
        }
        break;
      default:
        break;
    }
  }
  return found;
}

function each(blocks: readonly Block[], visit: (block: Block) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.children) each(block.children, visit);
  }
}

export function countWords(title: string, blocks: readonly Block[]): number {
  let total = words(title);
  each(blocks, (block) => {
    const definition = getBlockDefinition(block.type);
    if (!definition) return;
    for (const text of textOf(definition.fields, block.props)) total += words(text);
  });
  return total;
}

// Minutes to read it, rounded up; none for an empty page.
export const readingMinutes = (count: number) =>
  count === 0 ? 0 : Math.max(1, Math.round(count / WORDS_A_MINUTE));

export interface OutlineItem {
  // `<block id>:<n>`: a rich-text block can hold several headings.
  id: string;
  blockId: string;
  title: string;
  depth: 1 | 2 | 3 | 4;
}

const HEADING = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
// Blocks whose `heading` prop is drawn as an h2.
const TITLED = new Set(["feature-grid", "figures", "timeline"]);

const depthOf = (level: number) => Math.min(4, Math.max(1, level)) as OutlineItem["depth"];

// The page's headings in order, as the site draws them: heading blocks at their level, a hero
// that opens the page as the h1 and any other as an h2, a block's own heading as an h2, and the
// headings inside rich text.
export function outline(blocks: readonly Block[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lead = headingBlockId(blocks);
  const add = (block: Block, title: unknown, level: number) => {
    const text = typeof title === "string" ? title.replace(TAG, "").trim() : "";
    if (!text) return;
    const count = items.filter((item) => item.blockId === block.id).length;
    items.push({
      id: `${block.id}:${count}`,
      blockId: block.id,
      title: text,
      depth: depthOf(level),
    });
  };
  each(blocks, (block) => {
    const props = block.props;
    if (block.type === "heading") add(block, props.text, Number(props.level) || 2);
    else if (block.type === "hero") add(block, props.headline, lead === block.id ? 1 : 2);
    else if (TITLED.has(block.type)) add(block, props.heading, 2);
    else if (block.type === "rich-text" && typeof props.html === "string") {
      for (const match of props.html.matchAll(HEADING)) add(block, match[2], Number(match[1]));
    }
  });
  return items;
}
