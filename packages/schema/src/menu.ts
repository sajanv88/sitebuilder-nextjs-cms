// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { NodeId, Url, Uuid } from "./shared";

// Menu items (design §5.3). Two levels: top-level items may have children, children may not.

const itemBase = {
  id: NodeId,
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  openInNewTab: v.optional(v.boolean()),
};

// A child item: a link, never a group, never with children of its own. Strict objects, so a
// third level is rejected rather than silently dropped (v.object strips unknown keys).
const MenuChildSchema = v.variant("kind", [
  v.strictObject({ ...itemBase, kind: v.literal("entry"), entryId: Uuid }),
  v.strictObject({ ...itemBase, kind: v.literal("term"), termId: Uuid }),
  v.strictObject({ ...itemBase, kind: v.literal("url"), url: Url }),
]);

const children = v.pipe(v.array(MenuChildSchema), v.maxLength(12));

export const MenuItemSchema = v.variant("kind", [
  v.strictObject({
    ...itemBase,
    kind: v.literal("entry"),
    entryId: Uuid,
    children: v.optional(children),
  }),
  v.strictObject({
    ...itemBase,
    kind: v.literal("term"),
    termId: Uuid,
    children: v.optional(children),
  }),
  v.strictObject({ ...itemBase, kind: v.literal("url"), url: Url, children: v.optional(children) }),
  // A group has no link of its own, only a label and at least one child.
  v.strictObject({
    ...itemBase,
    kind: v.literal("group"),
    children: v.pipe(v.array(MenuChildSchema), v.minLength(1), v.maxLength(12)),
  }),
]);
export type MenuItem = v.InferOutput<typeof MenuItemSchema>;

export const MenuLocation = v.picklist(["primary", "footer"]);
export type MenuLocation = v.InferOutput<typeof MenuLocation>;
export const MENU_LOCATIONS: readonly MenuLocation[] = MenuLocation.options;

export const MenuSchema = v.pipe(
  v.array(MenuItemSchema),
  v.maxLength(20),
  v.check((items) => {
    const ids = items.flatMap((item) => [
      item.id,
      ...(item.children ?? []).map((child) => child.id),
    ]);
    return new Set(ids).size === ids.length;
  }, "Menu item ids must be unique"),
);
export type Menu = v.InferOutput<typeof MenuSchema>;
