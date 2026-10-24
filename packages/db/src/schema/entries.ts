// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { BlockList } from "@sitebuilder/schema";
import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { createdAt, id, optionalTimestamp, updatedAt } from "./columns";
import { media } from "./media";

export const entryType = pgEnum("entry_type", ["page", "post"]);
// The trash is not a status: a trashed entry keeps its status and has deletedAt set (§4.1).
export const entryStatus = pgEnum("entry_status", ["draft", "scheduled", "published"]);

// Posts and pages (design §4, §4.1). `content` is validated with validateBlockList on every
// write; $type is only a promise to the compiler.
export const entries = snakeCase.table(
  "entries",
  {
    id: id(),
    type: entryType().notNull(),
    status: entryStatus().notNull().default("draft"),
    title: text().notNull(),
    slug: text().notNull(),
    // "/about", "/blog/hello-world": computed on save and stored.
    path: text().notNull(),
    // Page hierarchy only; null for posts.
    parentId: uuid(),
    excerpt: text(),
    content: jsonb().$type<BlockList>().notNull(),
    featuredMediaId: uuid().references(() => media.id, { onDelete: "set null" }),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    seoTitle: text(),
    seoDescription: text(),
    // The page's own background, "#rrggbb", or null for the site's (HexColor checks it).
    background: text(),
    // "wp:123" for imported content, null otherwise.
    sourceRef: text(),
    publishedAt: optionalTimestamp(),
    // Set = in the trash.
    deletedAt: optionalTimestamp(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A page with children can't be permanently deleted.
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "entries_parent_id_fkey",
    }).onDelete("restrict"),
    // A trashed entry frees its path.
    uniqueIndex("entries_path_key").on(t.path).where(sql`${t.deletedAt} is null`),
    // Nulls are allowed more than once.
    uniqueIndex("entries_source_ref_key").on(t.sourceRef),
    index("entries_list_idx").on(t.type, t.status, t.publishedAt),
    index("entries_parent_id_idx").on(t.parentId),
    index("entries_author_id_idx").on(t.authorId),
    index("entries_featured_media_id_idx").on(t.featuredMediaId),
  ],
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type EntryType = (typeof entryType.enumValues)[number];
export type EntryStatus = (typeof entryStatus.enumValues)[number];
