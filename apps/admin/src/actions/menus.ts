"use server";

import { can } from "@sitebuilder/auth";
import { db, saveMenu, searchEntryLinks } from "@sitebuilder/db";
import { MenuLocation } from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { invalidate } from "@/server/invalidate";

// The Menus screen (design §4.4, §5.3). menu.update covers reading the screen too (§6.1).

export type SaveMenuResult = { ok: true } | { ok: false; error: string };

export async function saveMenuItems(location: unknown, items: unknown): Promise<SaveMenuResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Your session has ended. Sign in again." };
  if (!can(viewer, "menu.update")) return { ok: false, error: "You can't change the menus." };
  const where = v.safeParse(MenuLocation, location);
  if (!where.success) return { ok: false, error: "That menu doesn't exist." };
  // saveMenu validates the items with MenuSchema before writing them.
  const result = await saveMenu(db, where.output, items);
  if (!result.ok) {
    return { ok: false, error: "The menu has an item that isn't complete. Check each one." };
  }
  invalidate("saveMenuItems", { menu: where.output });
  return { ok: true };
}

export interface MenuTarget {
  id: string;
  title: string;
  path: string;
  type: "page" | "post";
  public: boolean;
}

// Pages and posts to link to, by title. Drafts are listed too, marked: a link to one shows on
// the site once it's published.
export async function searchMenuTargets(q: unknown): Promise<MenuTarget[]> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "menu.update")) return [];
  const query = v.safeParse(v.pipe(v.string(), v.trim(), v.maxLength(100)), q);
  if (!query.success) return [];
  const rows = await searchEntryLinks(db, query.output);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    path: row.path,
    type: row.type,
    public: row.public,
  }));
}
