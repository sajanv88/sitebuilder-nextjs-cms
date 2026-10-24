// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { MenuItem } from "@sitebuilder/schema";
import { index, integer, jsonb, snakeCase, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { createdAt, id, optionalTimestamp } from "./columns";
import { entries } from "./entries";

// The AI assistant's records (design §15, templates_and_ai_design B9, B10). Metadata only:
// prompts and answers are never stored.

// One row per provider call, for the limits (per user per day, per site per day) and for an
// admin's look at what was spent. Kept 180 days (the scheduler and the cron route remove older
// rows).
export const aiRuns = snakeCase.table(
  "ai_runs",
  {
    id: id(),
    // "questions", "plan", "page"; later "rewrite", "seo", "alt".
    kind: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    batchId: uuid(),
    // The entry a page or a help action was for.
    entryId: uuid().references(() => entries.id, { onDelete: "set null" }),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    durationMs: integer(),
    // One of the provider layer's codes (packages/ai), or null when the call worked.
    errorCode: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_runs_kind_created_at_idx").on(t.kind, t.createdAt),
    index("ai_runs_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("ai_runs_batch_id_idx").on(t.batchId),
    index("ai_runs_entry_id_idx").on(t.entryId),
  ],
);

// What finishing a batch changed, so discarding it can put it back (B5.2).
export interface AiBatchUndo {
  menus: { primary: MenuItem[]; footer: MenuItem[] } | null;
  // The home page before, when finishing set one: an entry id, or null for the latest posts.
  homepageEntryId?: string | null;
  // The site's title and tagline before, when finishing set them.
  site?: { title: string; tagline: string };
}

// A site designed with the assistant: one per plan. Its pages carry the source ref
// "ai:<batch id>:<page ref>".
export const aiBatches = snakeCase.table(
  "ai_batches",
  {
    id: id(),
    createdBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    finishedAt: optionalTimestamp(),
    undo: jsonb().$type<AiBatchUndo>(),
    discardedAt: optionalTimestamp(),
  },
  (t) => [index("ai_batches_created_by_idx").on(t.createdBy)],
);

export type AiRun = typeof aiRuns.$inferSelect;
export type NewAiRun = typeof aiRuns.$inferInsert;
export type AiBatch = typeof aiBatches.$inferSelect;
