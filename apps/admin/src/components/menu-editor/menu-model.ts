import type { Menu, MenuItem } from "@sitebuilder/schema";

// The menu editor's changes, as plain functions over the items (design §5.3): two levels, groups
// only at the top, a group never empty, at most 20 items at the top and 12 under one. The
// server checks the same with MenuSchema; these keep the screen from offering what it'd refuse.

export type MenuChild = NonNullable<MenuItem["children"]>[number];
export type AnyItem = MenuItem | MenuChild;

export const MAX_TOP = 20;
export const MAX_CHILDREN = 12;

// nuvui Tree's move: rows `values` go `before`, `after` or `inside` the row `target`.
export interface MenuMove {
  values: string[];
  target: string;
  position: "before" | "after" | "inside";
}

interface Found {
  item: AnyItem;
  // The top-level item it's under; null at the top.
  parent: MenuItem | null;
}

export function findItem(items: Menu, id: string): Found | undefined {
  for (const item of items) {
    if (item.id === id) return { item, parent: null };
    const child = item.children?.find((c) => c.id === id);
    if (child) return { item: child, parent: item };
  }
  return undefined;
}

const hasChildren = (item: AnyItem) => "children" in item && (item.children?.length ?? 0) > 0;

export function canMoveItems(items: Menu, move: MenuMove): boolean {
  const target = findItem(items, move.target);
  if (!target || move.values.includes(move.target)) return false;
  const moving = move.values.map((id) => findItem(items, id));
  if (moving.some((found) => !found)) return false;
  const found = moving as Found[];

  // Where they'd land: the top level, or under one top-level item.
  const parentId =
    move.position === "inside"
      ? target.parent
        ? null
        : target.item.id
      : (target.parent?.id ?? null);
  if (move.position === "inside" && target.parent) return false;

  if (parentId !== null) {
    // A child is a link: never a group, never with children of its own.
    if (found.some(({ item }) => item.kind === "group" || hasChildren(item))) return false;
    const parent = items.find((item) => item.id === parentId);
    const staying = found.filter(({ parent: p }) => p?.id === parentId).length;
    if ((parent?.children?.length ?? 0) + found.length - staying > MAX_CHILDREN) return false;
  } else {
    const staying = found.filter(({ parent }) => parent === null).length;
    if (items.length + found.length - staying > MAX_TOP) return false;
  }

  // A group can't be left empty.
  for (const { parent } of found) {
    if (parent?.kind !== "group" || parent.id === parentId) continue;
    const leaving = found.filter((f) => f.parent?.id === parent.id).length;
    if ((parent.children?.length ?? 0) - leaving < 1) return false;
  }
  return true;
}

function without(items: Menu, ids: ReadonlySet<string>): Menu {
  return items
    .filter((item) => !ids.has(item.id))
    .map((item) =>
      item.children ? { ...item, children: item.children.filter((c) => !ids.has(c.id)) } : item,
    ) as Menu;
}

function asChild(item: AnyItem): MenuChild {
  const { children: _children, ...rest } = item as MenuItem;
  return rest as MenuChild;
}

export function applyMenuMove(items: Menu, move: MenuMove): Menu {
  if (!canMoveItems(items, move)) return items;
  const ids = new Set(move.values);
  const taken = move.values.map((id) => findItem(items, id)?.item).filter((i) => i !== undefined);
  const rest = without(items, ids);

  if (move.position === "inside") {
    return rest.map((item) =>
      item.id === move.target
        ? ({ ...item, children: [...(item.children ?? []), ...taken.map(asChild)] } as MenuItem)
        : item,
    ) as Menu;
  }

  const target = findItem(rest, move.target);
  if (!target) return items;
  const offset = move.position === "before" ? 0 : 1;
  if (!target.parent) {
    const index = rest.findIndex((item) => item.id === move.target) + offset;
    const next = [...rest];
    next.splice(index, 0, ...(taken as MenuItem[]));
    return next as Menu;
  }
  return rest.map((item) => {
    if (item.id !== target.parent?.id) return item;
    const children = [...(item.children ?? [])];
    const index = children.findIndex((c) => c.id === move.target) + offset;
    children.splice(index, 0, ...taken.map(asChild));
    return { ...item, children } as MenuItem;
  }) as Menu;
}

// Adds an item at the end: at the top, or under a top-level item.
export function addItem(items: Menu, item: AnyItem, parentId: string | null): Menu {
  if (parentId === null) return [...items, item as MenuItem] as Menu;
  return items.map((top) =>
    top.id === parentId
      ? ({ ...top, children: [...(top.children ?? []), asChild(item)] } as MenuItem)
      : top,
  ) as Menu;
}

// Replaces an item, keeping its children and its place.
export function replaceItem(items: Menu, item: AnyItem): Menu {
  return items.map((top) => {
    if (top.id === item.id) {
      return { ...item, ...(top.children ? { children: top.children } : {}) } as MenuItem;
    }
    if (!top.children?.some((c) => c.id === item.id)) return top;
    return {
      ...top,
      children: top.children.map((c) => (c.id === item.id ? asChild(item) : c)),
    } as MenuItem;
  }) as Menu;
}

// Removes an item and, at the top, everything under it. A group left empty goes too.
export function removeItem(items: Menu, id: string): Menu {
  return without(items, new Set([id])).filter(
    (item) => item.kind !== "group" || (item.children?.length ?? 0) > 0,
  ) as Menu;
}

export function canAddUnder(items: Menu, parentId: string | null): boolean {
  if (parentId === null) return items.length < MAX_TOP;
  const parent = items.find((item) => item.id === parentId);
  return parent !== undefined && (parent.children?.length ?? 0) < MAX_CHILDREN;
}
