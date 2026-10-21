// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { BlockList } from "@sitebuilder/schema";
import { index, jsonb, snakeCase, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { createdAt, id } from "./columns";
import { entries } from "./entries";

// A snapshot written on every explicit save and on publish, not on autosave (design §4.1).
export const entryRevisions = snakeCase.table(
  "entry_revisions",
  {
    id: id(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    title: text().notNull(),
    content: jsonb().$type<BlockList>().notNull(),
    createdBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("entry_revisions_entry_idx").on(t.entryId, t.createdAt),
    index("entry_revisions_created_by_idx").on(t.createdBy),
  ],
);

export type EntryRevision = typeof entryRevisions.$inferSelect;
export type NewEntryRevision = typeof entryRevisions.$inferInsert;
