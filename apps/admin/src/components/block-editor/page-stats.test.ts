// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Block } from "@sitebuilder/schema";
import { describe, expect, test } from "vitest";
import { countWords, fieldMarkers, outline, readingMinutes, todoMarkers } from "./page-stats";

const block = (id: string, type: string, props: Record<string, unknown>, children?: Block[]) => ({
  id,
  type,
  props,
  ...(children ? { children } : {}),
});

const page: Block[] = [
  block("hero-1", "hero", {
    headline: "Build a site",
    body: "From blocks.",
    primaryAction: { label: "Start now", href: { kind: "url", url: "/" } },
  }),
  block("section-1", "section", {}, [
    block("text-1", "rich-text", { html: "<h2>Why <em>it</em> works</h2><p>Fast and safe.</p>" }),
    block("faq-1", "faq", { items: [{ question: "Free?", answer: "Yes it is." }] }),
  ]),
  block("image-1", "image", { mediaId: "x", alt: "Words in alt text never count" }),
  block("heading-1", "heading", { text: "Prices", level: 3 }),
];

describe("page stats", () => {
  test("counts what visitors read: text, rich text, buttons and list items, not alt text", () => {
    // Title 2, hero 3 + 2 + 2, rich text 3 + 3, FAQ 1 + 3, heading 1.
    expect(countWords("My page", page)).toBe(20);
    expect(countWords("", [])).toBe(0);
  });

  test("reading time at 200 words a minute, at least a minute for any text", () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(20)).toBe(1);
    expect(readingMinutes(1000)).toBe(5);
  });

  test("lists the headings in order, a leading hero as the h1", () => {
    expect(outline(page)).toEqual([
      { id: "hero-1:0", blockId: "hero-1", title: "Build a site", depth: 1 },
      { id: "text-1:0", blockId: "text-1", title: "Why it works", depth: 2 },
      { id: "heading-1:0", blockId: "heading-1", title: "Prices", depth: 3 },
    ]);
  });
});

describe("[TODO] markers", () => {
  test("are found in any block, however deep, and in the entry's own fields", () => {
    const blocks: Block[] = [
      block("text-1", "rich-text", { html: "<p>Call [TODO: phone number] or [TODO: email]</p>" }),
      block("section-1", "section", {}, [
        block("faq-1", "faq", { items: [{ question: "Open?", answer: "[TODO: opening hours]" }] }),
      ]),
    ];
    expect(todoMarkers(blocks).map((m) => [m.id, m.label, m.text])).toEqual([
      ["text-1:0", "Text", "[TODO: phone number]"],
      ["text-1:1", "Text", "[TODO: email]"],
      ["faq-1:0", "Questions and answers", "[TODO: opening hours]"],
    ]);
    expect(fieldMarkers(["A title", "[TODO: a description]"])).toEqual(["[TODO: a description]"]);
    expect(todoMarkers([block("text-2", "rich-text", { html: "<p>All done</p>" })])).toEqual([]);
  });
});
