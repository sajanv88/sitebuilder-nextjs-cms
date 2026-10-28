// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  cloneBlock,
  countAfterInsert,
  findBlock,
  fits,
  inParent,
  locate,
} from "@sitebuilder/blocks";
import type { Block } from "@sitebuilder/schema";

// The editor's changes to a list of blocks, as pure functions: each takes the list and returns a
// new one, so React sees every change and nothing is changed in place. The rules are the ones
// validateBlockList checks on save (design §5.2), applied here so the editor never offers a move
// the server would refuse. Where a block may go is in @sitebuilder/blocks (moves.ts), which the
// canvas's dragging shares.

export {
  applyMove,
  canMove,
  findBlock,
  fits,
  type Location,
  locate,
  type Move,
  removeBlock,
} from "@sitebuilder/blocks";

export function updateProps(
  blocks: readonly Block[],
  id: string,
  props: Record<string, unknown>,
): Block[] {
  return blocks.map((block) => {
    if (block.id === id) return { ...block, props };
    return block.children ? { ...block, children: updateProps(block.children, id, props) } : block;
  });
}

// The block with this id swapped for `replacement` (one block or several, in its place), as the
// assistant's rewrite proposes (8.7).
export function replaceBlock(
  blocks: readonly Block[],
  id: string,
  replacement: readonly Block[],
): Block[] {
  return blocks.flatMap((block) => {
    if (block.id === id) return [...replacement];
    return block.children
      ? [{ ...block, children: replaceBlock(block.children, id, replacement) }]
      : [block];
  });
}

// Where a new block goes: inside the selected block if it's a container that takes it, else
// after the selected block, else at the end of the page. undefined when nowhere fits.
export function insertBlock(
  blocks: readonly Block[],
  block: Block,
  selectedId: string | null,
): Block[] | undefined {
  const selected = selectedId ? findBlock(blocks, selectedId) : undefined;
  const where = selectedId ? locate(blocks, selectedId) : undefined;

  if (selected?.children && where && fits(blocks, block, selected.id, where.depth + 1)) {
    if (countAfterInsert(blocks, selected.id, 1)) {
      return inParent(blocks, selected.id, (children) => [...children, block]);
    }
  }
  if (where) {
    const parentId = where.parent?.id ?? null;
    if (fits(blocks, block, parentId, where.depth) && countAfterInsert(blocks, parentId, 1)) {
      return inParent(blocks, parentId, (children) => {
        children.splice(where.index + 1, 0, block);
        return children;
      });
    }
  }
  return fits(blocks, block, null, 1) ? [...blocks, block] : undefined;
}

// One place up or down among its neighbours.
export function moveBy(blocks: readonly Block[], id: string, step: -1 | 1): Block[] {
  const where = locate(blocks, id);
  if (!where) return [...blocks];
  return inParent(blocks, where.parent?.id ?? null, (children) => {
    const to = where.index + step;
    if (to < 0 || to >= children.length) return children;
    const [moved] = children.splice(where.index, 1);
    if (moved) children.splice(to, 0, moved);
    return children;
  });
}

// A copy right after the block, with new ids, if its container has room.
export function duplicateBlock(
  blocks: readonly Block[],
  id: string,
): { blocks: Block[]; copyId: string } | undefined {
  const where = locate(blocks, id);
  const block = findBlock(blocks, id);
  if (!where || !block) return undefined;
  const parentId = where.parent?.id ?? null;
  if (!countAfterInsert(blocks, parentId, 1)) return undefined;
  const copy = cloneBlock(block);
  return {
    copyId: copy.id,
    blocks: inParent(blocks, parentId, (children) => {
      children.splice(where.index + 1, 0, copy);
      return children;
    }),
  };
}

// The block a validation issue's path points at: [0, "children", 1, "props", "text"] is the
// second child of the first block, and its "text" field.
export function issueTarget(
  blocks: readonly Block[],
  path: readonly (string | number)[],
): { blockId: string; field: string | undefined } | undefined {
  let list: readonly Block[] | undefined = blocks;
  let found: Block | undefined;
  let i = 0;
  while (i < path.length && list) {
    const index = path[i];
    if (typeof index !== "number") break;
    found = list[index];
    if (!found) break;
    if (path[i + 1] === "children") {
      list = found.children;
      i += 2;
      if (typeof path[i] !== "number") break;
      continue;
    }
    break;
  }
  if (!found) return undefined;
  const propsAt = path.indexOf("props");
  const field = propsAt >= 0 ? path[propsAt + 1] : undefined;
  return { blockId: found.id, field: typeof field === "string" ? field : undefined };
}
