// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { allowedChildren, blockRules, cloneBlock } from "@sitebuilder/blocks";
import { type Block, MAX_DEPTH } from "@sitebuilder/schema";

// The editor's changes to a list of blocks, as pure functions: each takes the list and returns a
// new one, so React sees every change and nothing is changed in place. The rules are the ones
// validateBlockList checks on save (design §5.2), applied here so the editor never offers a move
// the server would refuse.

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
function inParent(
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

function countAfterInsert(
  blocks: readonly Block[],
  parentId: string | null,
  adding: number,
): boolean {
  if (parentId === null) return true;
  const parent = findBlock(blocks, parentId);
  const max = parent ? blockRules[parent.type]?.container?.max : undefined;
  return max === undefined || (parent?.children?.length ?? 0) + adding <= max;
}

// Leaving a container may not take it under its least count (columns hold at least two).
function countAfterRemove(blocks: readonly Block[], id: string): boolean {
  const where = locate(blocks, id);
  if (!where?.parent) return true;
  const min = blockRules[where.parent.type]?.container?.min;
  return min === undefined || (where.parent.children?.length ?? 0) - 1 >= min;
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

// nuvui Tree's move (TreeMove): rows `values` go `before`, `after` or `inside` the row `target`.
export interface Move {
  values: string[];
  target: string;
  position: "before" | "after" | "inside";
}

// Whether the outline may offer a place for a drag or Alt+arrow move.
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
