// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ContentIssue } from "@sitebuilder/schema";

// A floor for how a written page reads, checked like the content rules: a page that fails goes
// back for its one repair (B7). The prompts ask for the same (prompts.ts, rule 4 and DESIGN);
// these catch what a model does anyway. The first real page showed each of them: a marker as
// a picture's alt text and in the hero, six markers, one picture twice, text after text.

const MARKER = /\[TODO\b/i;
export const MAX_MARKERS = 3;

// Where a marker may never go: what a visitor reads first, or never reads as text at all.
const NO_MARKER = new Set(["headline", "eyebrow", "label", "caption", "alt", "title", "question"]);

const isMediaKey = (key: string) => key === "mediaId" || key.endsWith("MediaId");

interface Block {
  type?: unknown;
  props?: unknown;
  children?: unknown;
}

export function designIssues(blocks: readonly unknown[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  let markers = 0;
  const pictures = new Map<string, (string | number)[]>();

  const walk = (value: unknown, path: (string | number)[], blockType: unknown): void => {
    if (typeof value === "string") {
      if (!MARKER.test(value)) return;
      markers += value.match(/\[TODO\b/gi)?.length ?? 0;
      const key = path.at(-1);
      if (
        (typeof key === "string" && NO_MARKER.has(key)) ||
        (blockType === "heading" && key === "text")
      ) {
        issues.push({
          path,
          code: "marker-placement",
          message:
            "A [TODO] marker can't go in a headline, a heading, a button, a caption or alt text: leave the thing out, or put the marker in body text",
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        walk(item, [...path, i], blockType);
      });
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      const ids = isMediaKey(key) ? [item] : key === "mediaIds" && Array.isArray(item) ? item : [];
      for (const id of ids) {
        if (typeof id !== "string") continue;
        if (pictures.has(id)) {
          issues.push({
            path: [...path, key],
            code: "picture-twice",
            message: "This picture is already used on the page: use another that fits, or none",
          });
        } else pictures.set(id, [...path, key]);
      }
      walk(item, [...path, key], blockType);
    }
  };

  blocks.forEach((raw, index) => {
    const block = (raw ?? {}) as Block;
    walk(block.props, ["blocks", index, "props"], block.type);
    if (Array.isArray(block.children)) {
      block.children.forEach((child, c) => {
        const inner = (child ?? {}) as Block;
        walk(inner.props, ["blocks", index, "children", c, "props"], inner.type);
        if (Array.isArray(inner.children)) {
          inner.children.forEach((leaf, l) => {
            const deepest = (leaf ?? {}) as Block;
            walk(
              deepest.props,
              ["blocks", index, "children", c, "children", l, "props"],
              deepest.type,
            );
          });
        }
      });
    }

    // Rhythm at the top level: text after text reads as a wall; a heading needs content after.
    const next = blocks[index + 1] as Block | undefined;
    if (block.type === "rich-text" && next?.type === "rich-text") {
      issues.push({
        path: ["blocks", index + 1],
        code: "text-after-text",
        message: "Two text blocks in a row: join them, or put them in a section or columns",
      });
    }
    if (block.type === "heading" && (!next || next.type === "heading")) {
      issues.push({
        path: ["blocks", index],
        code: "empty-heading",
        message: "A heading with nothing after it: add its content, or leave the heading out",
      });
    }
  });

  if (markers > MAX_MARKERS) {
    issues.push({
      path: ["blocks"],
      code: "too-many-markers",
      message: `${markers} [TODO] markers: at most ${MAX_MARKERS}. Leave out what you don't know instead`,
    });
  }
  return issues;
}
