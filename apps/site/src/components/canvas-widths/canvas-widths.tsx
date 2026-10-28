// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { dragColumnLine, findBlock, locate } from "@sitebuilder/blocks";
import type { BlockList } from "@sitebuilder/schema";
import {
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "./canvas-widths.scss";

// Columns' widths on the editor's canvas (decisions #152): while a columns block, or a block in
// one, is selected, the line between each two columns can be dragged. It snaps to 1/4, 1/3, 1/2,
// 2/3 or 3/4 of the row (block-columns/widths.ts), the canvas shows each step, and letting go
// sends the widths to the editor. Escape puts them back. Only while the columns are side by side.
// The inspector's Widths field does the same by keyboard.

interface Line {
  // Between column `index` and the next.
  index: number;
  x: number;
  top: number;
  height: number;
}

interface Row {
  id: string;
  count: number;
  // Where the row starts and ends on the screen, and which way it runs.
  start: number;
  end: number;
  rtl: boolean;
  lines: Line[];
}

const frameOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);

// The columns block the selection is, or is in.
function columnsAround(blocks: BlockList, selectedId: string | null): string | null {
  let id = selectedId;
  while (id) {
    if (findBlock(blocks, id)?.type === "columns") return id;
    id = locate(blocks, id)?.parent?.id ?? null;
  }
  return null;
}

// Where its lines are, or null when its columns are stacked or always equal.
function measure(blocks: BlockList, id: string): Row | null {
  const children = findBlock(blocks, id)?.children ?? [];
  if (children.length < 2 || children.length > 3) return null;
  const rects = children.map((child) => frameOf(child.id)?.getBoundingClientRect());
  if (rects.some((rect) => !rect)) return null;
  const boxes = rects as DOMRect[];
  const first = boxes[0] as DOMRect;
  if (boxes.some((box) => Math.abs(box.top - first.top) > 2)) return null;
  const rtl = (boxes[1] as DOMRect).left < first.left;
  const top = Math.min(...boxes.map((box) => box.top));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  const lines = boxes.slice(0, -1).map((box, index) => {
    const next = boxes[index + 1] as DOMRect;
    const x = rtl ? (next.right + box.left) / 2 : (box.right + next.left) / 2;
    return { index, x, top, height: bottom - top };
  });
  return {
    id,
    count: children.length,
    start: rtl ? Math.max(...boxes.map((b) => b.right)) : Math.min(...boxes.map((b) => b.left)),
    end: rtl ? Math.min(...boxes.map((b) => b.left)) : Math.max(...boxes.map((b) => b.right)),
    rtl,
    lines,
  };
}

const withWidths = (list: BlockList, id: string, widths: string): BlockList =>
  list.map((block) => {
    if (block.id === id) return { ...block, props: { ...block.props, widths } };
    return block.children ? { ...block, children: withWidths(block.children, id, widths) } : block;
  });

export function CanvasWidths({
  blocks,
  selectedId,
  enabled,
  onPreview,
  onWidths,
}: {
  blocks: BlockList;
  selectedId: string | null;
  enabled: boolean;
  // The canvas drawn with these blocks while a line is dragged.
  onPreview: (blocks: BlockList) => void;
  onWidths: (blockId: string, widths: string) => void;
}) {
  const columnsId = useMemo(
    () => (enabled ? columnsAround(blocks, selectedId) : null),
    [blocks, selectedId, enabled],
  );
  const [row, setRow] = useState<Row | null>(null);
  const latest = useRef({ blocks, onPreview, onWidths });
  latest.current = { blocks, onPreview, onWidths };

  // Measured after every drawing, and again when the page scrolls or anything changes size.
  useLayoutEffect(() => {
    if (!columnsId) {
      setRow(null);
      return;
    }
    let request = 0;
    const update = () => setRow(measure(blocks, columnsId));
    const later = () => {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(later);
    observer.observe(document.body);
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      window.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
    };
  }, [columnsId, blocks]);

  function start(line: Line, event: ReactPointerEvent<HTMLDivElement>) {
    const now = latest.current.blocks;
    const block = row ? findBlock(now, row.id) : undefined;
    if (event.button !== 0 || !row || !block) return;
    event.preventDefault();
    event.stopPropagation();
    const handle: HTMLDivElement = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const before = typeof block.props.widths === "string" ? block.props.widths : "equal";
    const { id, count, start: from, end: to } = row;
    let value = before;
    const listening = new AbortController();
    const options = { signal: listening.signal };
    const finish = (commit: boolean) => {
      listening.abort();
      if (value === before) return;
      if (commit) latest.current.onWidths(id, value);
      else latest.current.onPreview(now);
    };
    handle.addEventListener(
      "pointermove",
      (move) => {
        const next = dragColumnLine(value, count, line.index, (move.clientX - from) / (to - from));
        if (next === value) return;
        value = next;
        latest.current.onPreview(withWidths(now, id, next));
      },
      options,
    );
    handle.addEventListener("pointerup", () => finish(true), options);
    handle.addEventListener("pointercancel", () => finish(false), options);
    document.addEventListener(
      "keydown",
      (key) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        finish(false);
      },
      { ...options, capture: true },
    );
  }

  if (!row) return null;
  return createPortal(
    <div aria-hidden="true" data-canvas-handle="">
      {row.lines.map((line) => (
        <div
          key={line.index}
          className="canvas-widths__line"
          style={{ top: line.top, left: line.x, height: line.height }}
          onPointerDown={(event) => start(line, event)}
        />
      ))}
    </div>,
    document.body,
  );
}
