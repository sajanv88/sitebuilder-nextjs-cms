import {
  archivePath,
  MENU_LOCATIONS,
  type Menu,
  type MenuItem,
  type MenuLocation,
  MenuSchema,
} from "@sitebuilder/schema";
import { inArray } from "drizzle-orm";
import * as v from "valibot";
import type { Executor } from "../executor";
import { entries } from "../schema/entries";
import { menus } from "../schema/site";
import { terms } from "../schema/terms";
import { isPublic } from "./entries";
import { getReading } from "./public";

// The two menus (design §4.4, §5.3).

// Creates the two menu rows with empty items where they don't exist yet (design §4.4).
export async function ensureMenus(db: Executor): Promise<void> {
  await db
    .insert(menus)
    .values(MENU_LOCATIONS.map((location) => ({ location, items: [] })))
    .onConflictDoNothing({ target: menus.location });
}

// A menu's items. A row edited by hand into the wrong shape reads as empty rather than
// breaking every page's header.
export async function getMenu(db: Executor, location: MenuLocation): Promise<Menu> {
  const row = await db.query.menus.findFirst({ where: { location } });
  if (!row) return [];
  const parsed = v.safeParse(MenuSchema, row.items);
  return parsed.success ? parsed.output : [];
}

export type SaveMenuResult =
  | { ok: true }
  | { ok: false; error: "invalid"; issues: v.BaseIssue<unknown>[] };

export async function saveMenu(
  db: Executor,
  location: MenuLocation,
  items: unknown,
): Promise<SaveMenuResult> {
  const parsed = v.safeParse(MenuSchema, items);
  if (!parsed.success) return { ok: false, error: "invalid", issues: parsed.issues };
  await db
    .insert(menus)
    .values({ location, items: parsed.output })
    .onConflictDoUpdate({ target: menus.location, set: { items: parsed.output } });
  return { ok: true };
}

// Why a link can't be followed: its entry or term is gone, or the entry isn't public (a draft,
// scheduled, or in the trash). The site skips these; the admin marks them.
export type MenuLinkProblem = "missing" | "unpublished";

export interface ResolvedMenuItem {
  id: string;
  label: string;
  kind: MenuItem["kind"];
  openInNewTab: boolean;
  // Where it goes; null for a group, and for a link that can't be followed.
  href: string | null;
  problem: MenuLinkProblem | null;
  children: ResolvedMenuItem[];
}

// Entry items to their current paths (the home page to "/"), term items to their archives
// (design §5.3), in two lookups for the whole menu.
export async function resolveMenu(db: Executor, items: Menu): Promise<ResolvedMenuItem[]> {
  const all = items.flatMap((item) => [item, ...(item.children ?? [])]);
  const entryIds = all.flatMap((item) => (item.kind === "entry" ? [item.entryId] : []));
  const termIds = all.flatMap((item) => (item.kind === "term" ? [item.termId] : []));

  const reading = await getReading(db);
  const entryRows =
    entryIds.length === 0
      ? []
      : await db
          .select({ id: entries.id, path: entries.path, public: isPublic })
          .from(entries)
          .where(inArray(entries.id, [...new Set(entryIds)]));
  const termRows =
    termIds.length === 0
      ? []
      : await db
          .select({ id: terms.id, taxonomy: terms.taxonomy, slug: terms.slug })
          .from(terms)
          .where(inArray(terms.id, [...new Set(termIds)]));
  const entryById = new Map(entryRows.map((row) => [row.id, row]));
  const termById = new Map(termRows.map((row) => [row.id, row]));

  function target(item: MenuItem | NonNullable<MenuItem["children"]>[number]): {
    href: string | null;
    problem: MenuLinkProblem | null;
  } {
    switch (item.kind) {
      case "url":
        return { href: item.url, problem: null };
      case "entry": {
        const entry = entryById.get(item.entryId);
        if (!entry) return { href: null, problem: "missing" };
        if (!entry.public) return { href: null, problem: "unpublished" };
        return {
          href: entry.id === reading.homepageEntryId ? "/" : entry.path,
          problem: null,
        };
      }
      case "term": {
        const term = termById.get(item.termId);
        if (!term) return { href: null, problem: "missing" };
        return { href: archivePath(reading.postsPath, term.taxonomy, term.slug), problem: null };
      }
      case "group":
        return { href: null, problem: null };
    }
  }

  return items.map((item) => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
    openInNewTab: item.openInNewTab ?? false,
    ...target(item),
    children: (item.children ?? []).map((child) => ({
      id: child.id,
      label: child.label,
      kind: child.kind,
      openInNewTab: child.openInNewTab ?? false,
      ...target(child),
      children: [],
    })),
  }));
}
