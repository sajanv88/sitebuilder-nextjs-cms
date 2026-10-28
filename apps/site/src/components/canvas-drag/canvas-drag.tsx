// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { canMove, findBlock, locate, type Move } from "@sitebuilder/blocks";
import type { BlockList } from "@sitebuilder/schema";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./canvas-drag.scss";

// Dragging a block to another place on the editor's canvas (decisions #152), by the grip the
// selected block shows (an element with data-drag-block). Only places the editor would take are
// offered, by the same rules as its outline (moves.ts); a line shows where the block would go,
// and letting go sends the move to the editor, which checks it again. Escape puts it back. Near
// the window's top or bottom the page scrolls. The outline and Alt+↑/↓ do the same by keyboard.

// How close to the window's top or bottom the page scrolls, and by how much a frame.
const EDGE = 64;
const SPEED = 12;

interface Drop {
  move: Move;
  // A line along a block's top or bottom, one down its side, or a box around an empty container.
  kind: "along" | "across" | "inside";
  box: { top: number; left: number; width: number; height: number };
}

const frameOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);

// Whether a block's neighbours sit beside it (columns) rather than under it.
function sideBySide(blocks: BlockList, id: string): boolean {
  const own = frameOf(id)?.getBoundingClientRect();
  if (!own) return false;
  const list = locate(blocks, id)?.parent?.children ?? blocks;
  return list.some((block) => {
    if (block.id === id) return false;
    const other = frameOf(block.id)?.getBoundingClientRect();
    return other !== undefined && Math.abs(other.top - own.top) < 2 && other.left !== own.left;
  });
}

// A move that leaves the block where it is: before the block after it, or after the one before.
function staysPut(blocks: BlockList, move: Move): boolean {
  const from = move.values[0] ? locate(blocks, move.values[0]) : undefined;
  const to = locate(blocks, move.target);
  if (!from || !to || move.position === "inside" || from.parent?.id !== to.parent?.id) return false;
  return move.position === "before" ? to.index === from.index + 1 : to.index === from.index - 1;
}

// Where the block would go with the pointer here: beside the innermost block under it that may
// take it, else beside a block around that one. Inside an empty container. None over the block
// itself, or where it already is.
function findDrop(blocks: BlockList, dragId: string, x: number, y: number): Drop | null {
  let frame = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-block-id]") ?? null;
  if (!frame || frame.closest(`[data-block-id="${CSS.escape(dragId)}"]`)) return null;
  while (frame) {
    const id = frame.dataset.blockId;
    const rect = frame.getBoundingClientRect();
    if (id) {
      if (findBlock(blocks, id)?.children?.length === 0) {
        const move: Move = { values: [dragId], target: id, position: "inside" };
        if (canMove(blocks, move)) {
          return {
            move,
            kind: "inside",
            box: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          };
        }
      }
      const across = sideBySide(blocks, id);
      const after = across ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;
      const move: Move = { values: [dragId], target: id, position: after ? "after" : "before" };
      if (canMove(blocks, move)) {
        if (staysPut(blocks, move)) return null;
        return across
          ? {
              move,
              kind: "across",
              box: {
                top: rect.top,
                left: after ? rect.right : rect.left,
                width: 0,
                height: rect.height,
              },
            }
          : {
              move,
              kind: "along",
              box: {
                top: after ? rect.bottom : rect.top,
                left: rect.left,
                width: rect.width,
                height: 0,
              },
            };
      }
    }
    frame = frame.parentElement?.closest<HTMLElement>("[data-block-id]") ?? null;
  }
  return null;
}

export function CanvasDrag({
  blocks,
  enabled,
  onDrop,
}: {
  blocks: BlockList;
  enabled: boolean;
  onDrop: (move: Move) => void;
}) {
  const [drop, setDrop] = useState<Drop | null>(null);
  const latest = useRef({ blocks, onDrop });
  latest.current = { blocks, onDrop };

  useEffect(() => {
    if (!enabled) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const grip = event.target.closest<HTMLElement>("[data-drag-block]");
      const dragId = grip?.dataset.dragBlock;
      if (!grip || !dragId) return;
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);

      let point = { x: event.clientX, y: event.clientY };
      let current: Drop | null = null;
      let request = 0;
      const listening = new AbortController();
      const place = () => {
        current = findDrop(latest.current.blocks, dragId, point.x, point.y);
        setDrop(current);
      };
      const scroll = () => {
        const step = point.y < EDGE ? -SPEED : point.y > window.innerHeight - EDGE ? SPEED : 0;
        if (step !== 0) {
          window.scrollBy(0, step);
          place();
        }
        request = requestAnimationFrame(scroll);
      };
      const finish = (commit: boolean) => {
        listening.abort();
        cancelAnimationFrame(request);
        setDrop(null);
        if (commit && current) latest.current.onDrop(current.move);
      };
      const options = { signal: listening.signal };
      grip.addEventListener(
        "pointermove",
        (move) => {
          point = { x: move.clientX, y: move.clientY };
          place();
        },
        options,
      );
      grip.addEventListener("pointerup", () => finish(true), options);
      grip.addEventListener("pointercancel", () => finish(false), options);
      document.addEventListener(
        "keydown",
        (key) => {
          if (key.key !== "Escape") return;
          key.preventDefault();
          finish(false);
        },
        { ...options, capture: true },
      );
      request = requestAnimationFrame(scroll);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [enabled]);

  if (!drop) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className={`canvas-drag__drop canvas-drag__drop--${drop.kind}`}
      style={drop.box}
    />,
    document.body,
  );
}
