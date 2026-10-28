// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  type BlockList,
  DEFAULT_TEMPLATE,
  type EntryKind,
  type Menu,
  type TemplateSettings,
  type ThemeSettings,
} from "@sitebuilder/schema";
import { and, inArray, isNull, like } from "drizzle-orm";
import type { Executor } from "../executor";
import { entries } from "../schema/entries";
import { createEntry, type EntryWriteError, setEntryStatus } from "./entries";
import { saveMenu } from "./menus";
import { getReading } from "./public";
import { getSettings, upsertSettings } from "./settings";

// Activating a template (design §14, docs/templates_and_ai_design.md A7 and A8): the settings
// row, and optionally its theme, starter pages and posts, menus and home page. The admin zone
// decides what to import and validates it; this writes it in one transaction.

export async function getTemplateSettings(db: Executor): Promise<TemplateSettings> {
  return (await getSettings(db, "template")) ?? DEFAULT_TEMPLATE;
}

export interface ImportedEntry {
  id: string;
  sourceRef: string;
  title: string;
  path: string;
  trashed: boolean;
}

// What an earlier activation already created from this template, trashed entries included:
// their source ref stays taken, so they're skipped, never created twice.
export async function listImportedEntries(db: Executor, slug: string): Promise<ImportedEntry[]> {
  const rows = await db
    .select({
      id: entries.id,
      sourceRef: entries.sourceRef,
      title: entries.title,
      path: entries.path,
      deletedAt: entries.deletedAt,
    })
    .from(entries)
    .where(like(entries.sourceRef, `template:${slug}:%`))
    .limit(100);
  return rows.flatMap((row) =>
    row.sourceRef
      ? [
          {
            id: row.id,
            sourceRef: row.sourceRef,
            title: row.title,
            path: row.path,
            trashed: row.deletedAt !== null,
          },
        ]
      : [],
  );
}

// Which of these paths a live entry already has: the dry run shows that an import there gets
// a numbered address instead.
export async function findTakenPaths(db: Executor, paths: readonly string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const rows = await db
    .select({ path: entries.path })
    .from(entries)
    .where(and(inArray(entries.path, [...paths]), isNull(entries.deletedAt)))
    .limit(paths.length);
  return new Set(rows.map((row) => row.path));
}

export interface TemplateEntryWrite {
  id: string;
  sourceRef: string;
  type: EntryKind;
  // A page created earlier in the same list, or null.
  parentId: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  // Already validated with validateContent.
  content: BlockList;
}

export interface TemplateActivation {
  actorId: string;
  template: TemplateSettings;
  // A template's colours and type. The site's page background, which a template doesn't set,
  // goes back to none; the site's custom CSS and uploaded fonts stay.
  theme?: Omit<ThemeSettings, "pageBackground" | "customCss" | "fonts"> | undefined;
  // Parents before their children.
  entries: readonly TemplateEntryWrite[];
  publish: boolean;
  menus?: { primary: Menu; footer: Menu } | undefined;
  // An entry for the home page, or null for the latest posts. Left out: unchanged.
  homepageEntryId?: string | null | undefined;
}

export interface CreatedEntry {
  id: string;
  sourceRef: string;
  title: string;
  path: string;
}

export type TemplateActivationResult =
  | { ok: true; created: CreatedEntry[] }
  | { ok: false; error: "invalid-settings" | "invalid-menu" }
  | { ok: false; error: EntryWriteError | "publish-failed"; sourceRef: string };

class Abort extends Error {
  constructor(readonly result: Exclude<TemplateActivationResult, { ok: true }>) {
    super(result.error);
  }
}

// All or nothing: any refused write rolls back every other one.
export async function activateTemplate(
  db: Executor,
  input: TemplateActivation,
): Promise<TemplateActivationResult> {
  try {
    return await db.transaction(async (tx) => {
      const fail = (result: Exclude<TemplateActivationResult, { ok: true }>): never => {
        throw new Abort(result);
      };
      if (!(await upsertSettings(tx, "template", input.template)).ok) {
        fail({ ok: false, error: "invalid-settings" });
      }
      if (input.theme) {
        const before = await getSettings(tx, "theme");
        const theme = {
          ...input.theme,
          customCss: before?.customCss ?? "",
          fonts: before?.fonts ?? [],
        };
        if (!(await upsertSettings(tx, "theme", theme)).ok) {
          fail({ ok: false, error: "invalid-settings" });
        }
      }

      const created: CreatedEntry[] = [];
      for (const entry of input.entries) {
        const result = await createEntry(tx, {
          id: entry.id,
          sourceRef: entry.sourceRef,
          type: entry.type,
          title: entry.title,
          slug: entry.slug,
          excerpt: entry.excerpt,
          seoTitle: entry.seoTitle,
          seoDescription: entry.seoDescription,
          content: entry.content,
          parentId: entry.parentId,
          featuredMediaId: null,
          categoryIds: [],
          tagIds: [],
          authorId: input.actorId,
          actorId: input.actorId,
        });
        if (!result.ok) fail({ ok: false, error: result.error, sourceRef: entry.sourceRef });
        else {
          created.push({
            id: result.id,
            sourceRef: entry.sourceRef,
            title: entry.title,
            path: result.path,
          });
          if (input.publish) {
            const published = await setEntryStatus(tx, {
              id: result.id,
              change: { kind: "publish", at: null },
              expectedUpdatedAt: null,
              actorId: input.actorId,
              writeRevision: false,
            });
            if (!published.ok)
              fail({ ok: false, error: "publish-failed", sourceRef: entry.sourceRef });
          }
        }
      }

      if (input.menus) {
        for (const location of ["primary", "footer"] as const) {
          if (!(await saveMenu(tx, location, input.menus[location])).ok) {
            fail({ ok: false, error: "invalid-menu" });
          }
        }
      }
      if (input.homepageEntryId !== undefined) {
        const reading = await getReading(tx);
        const saved = await upsertSettings(tx, "reading", {
          ...reading,
          homepageEntryId: input.homepageEntryId,
        });
        if (!saved.ok) fail({ ok: false, error: "invalid-settings" });
      }
      return { ok: true, created } as const;
    });
  } catch (error) {
    if (error instanceof Abort) return error.result;
    throw error;
  }
}
