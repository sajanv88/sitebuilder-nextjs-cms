// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { type Block, MAX_DEPTH } from "@sitebuilder/schema";
import { allowedChildren, blockRules } from "./registry";

// Where blocks may go in a page, as pure functions over the list of blocks. The editor's outline
// and the canvas's dragging use the same rules, which are the ones validateBlockList checks on
// save (design §5.2), so neither offers a move the server would refuse.

export interface Location {
  // The container the block is in; null at the top of the page.
  parent: Block | null;
  index: number;
  depth: number;
}

// Where a block is, or undefined.
export function locate(blocks: readonly Block[], id: string): Location | undefined {
  const walk = (
    list: readonly Block[],
    parent: Block | null,
    depth: number,
  ): Location | undefined => {
    for (const [index, block] of list.entries()) {
      if (block.id === id) return { parent, index, depth };
      if (block.children) {
        const found = walk(block.children, block, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(blocks, null, 1);
}

export function findBlock(blocks: readonly Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const inside = block.children ? findBlock(block.children, id) : undefined;
    if (inside) return inside;
  }
  return undefined;
}

// The list with `change` applied to the children of `parentId` (null: the top level).
export function inParent(
  blocks: readonly Block[],
  parentId: string | null,
  change: (children: Block[]) => Block[],
): Block[] {
  if (parentId === null) return change([...blocks]);
  return blocks.map((block) => {
    if (block.id === parentId) return { ...block, children: change([...(block.children ?? [])]) };
    return block.children
      ? { ...block, children: inParent(block.children, parentId, change) }
      : block;
  });
}

export function removeBlock(blocks: readonly Block[], id: string): Block[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) =>
      block.children ? { ...block, children: removeBlock(block.children, id) } : block,
    );
}

// How deep a block goes: 1 for a leaf, 3 for columns > column > leaf.
function height(block: Block): number {
  return 1 + Math.max(0, ...(block.children ?? []).map(height));
}

// Whether `block` may go into the container `parentId` (null: the top of the page) at `depth`,
// leaving aside where it comes from.
export function fits(
  blocks: readonly Block[],
  block: Block,
  parentId: string | null,
  depth: number,
): boolean {
  if (depth - 1 + height(block) > MAX_DEPTH) return false;
  const parentType = parentId === null ? null : findBlock(blocks, parentId)?.type;
  if (parentType === undefined) return false;
  return allowedChildren(parentType).includes(block.type);
}

// Adding to a container may not take it over its most (columns hold at most four).
export function countAfterInsert(
  blocks: readonly Block[],
  parentId: string | null,
  adding: number,
): boolean {
  if (parentId === null) return true;
  const parent = findBlock(blocks, parentId);
  const max = parent ? blockRules()[parent.type]?.container?.max : undefined;
  return max === undefined || (parent?.children?.length ?? 0) + adding <= max;
}

// Leaving a container may not take it under its least count (columns hold at least two).
function countAfterRemove(blocks: readonly Block[], id: string): boolean {
  const where = locate(blocks, id);
  if (!where?.parent) return true;
  const min = blockRules()[where.parent.type]?.container?.min;
  return min === undefined || (where.parent.children?.length ?? 0) - 1 >= min;
}

// nuvui Tree's move (TreeMove): rows `values` go `before`, `after` or `inside` the row `target`.
// The canvas sends the same shape when a block is dragged there.
export interface Move {
  values: string[];
  target: string;
  position: "before" | "after" | "inside";
}

// Whether a drag or an Alt+arrow move may go there.
export function canMove(blocks: readonly Block[], move: Move): boolean {
  const target = locate(blocks, move.target);
  if (!target) return false;
  const parentId = move.position === "inside" ? move.target : (target.parent?.id ?? null);
  const depth = move.position === "inside" ? target.depth + 1 : target.depth;
  if (move.position === "inside" && !findBlock(blocks, move.target)?.children) return false;
  const moving = move.values.map((id) => findBlock(blocks, id));
  const staying = moving.filter(
    (block) => block && locate(blocks, block.id)?.parent?.id === parentId,
  ).length;
  if (!countAfterInsert(blocks, parentId, moving.length - staying)) return false;
  return moving.every(
    (block) =>
      block !== undefined &&
      (locate(blocks, block.id)?.parent?.id === parentId || countAfterRemove(blocks, block.id)) &&
      fits(blocks, block, parentId, depth),
  );
}

export function applyMove(blocks: readonly Block[], move: Move): Block[] {
  if (!canMove(blocks, move)) return [...blocks];
  const taken = move.values
    .map((id) => findBlock(blocks, id))
    .filter((block): block is Block => block !== undefined);
  let rest: Block[] = [...blocks];
  for (const block of taken) rest = removeBlock(rest, block.id);
  if (move.position === "inside") {
    return inParent(rest, move.target, (children) => [...children, ...taken]);
  }
  const target = locate(rest, move.target);
  if (!target) return [...blocks];
  return inParent(rest, target.parent?.id ?? null, (children) => {
    children.splice(move.position === "before" ? target.index : target.index + 1, 0, ...taken);
    return children;
  });
}
