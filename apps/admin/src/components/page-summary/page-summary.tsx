// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { TableOfContents } from "@nuvui/react";
import type { Block } from "@sitebuilder/schema";
import { type MouseEvent, useMemo } from "react";
import { countWords, outline, readingMinutes } from "@/components/block-editor/page-stats";
import "./page-summary.scss";

// At the top of the Page tab: how long the page is to read, and its headings as nuvui's
// TableOfContents. A heading's link selects its block and brings it into view in the canvas;
// the selected block's heading is the one marked.
export function PageSummary({
  title,
  blocks,
  selectedId,
  onJump,
}: {
  title: string;
  blocks: readonly Block[];
  selectedId: string | null;
  onJump: (blockId: string) => void;
}) {
  const words = useMemo(() => countWords(title, blocks), [title, blocks]);
  const items = useMemo(() => outline(blocks), [blocks]);
  const minutes = readingMinutes(words);
  const marked = items.find((item) => item.blockId === selectedId)?.id ?? null;

  // The links go to `#<block id>:<n>`, which nothing in the page has: the canvas is told
  // instead.
  function follow(event: MouseEvent<HTMLElement>) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[href^='#']");
    if (!link) return;
    event.preventDefault();
    const id = decodeURIComponent(link.getAttribute("href")?.slice(1) ?? "");
    const item = items.find((candidate) => candidate.id === id);
    if (item) onJump(item.blockId);
  }

  return (
    <section className="page-summary" aria-labelledby="page-summary-title">
      <h2 id="page-summary-title" className="page-summary__title">
        Reading
      </h2>
      <p className="page-summary__figures">
        {`${words.toLocaleString("en")} ${words === 1 ? "word" : "words"}`}
        {minutes > 0 ? `, about ${minutes} ${minutes === 1 ? "minute" : "minutes"} to read` : ""}
      </p>
      <h3 className="page-summary__title">Outline</h3>
      {items.length > 0 ? (
        <TableOfContents
          aria-label="Outline of the page"
          items={items.map(({ id, title: text, depth }) => ({ id, title: text, depth }))}
          value={marked}
          onClick={follow}
        />
      ) : (
        <p className="page-summary__empty">
          No headings yet. A Heading block, a hero or a heading in text adds one.
        </p>
      )}
    </section>
  );
}
