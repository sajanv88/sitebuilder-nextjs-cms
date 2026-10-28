// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { BlockList } from "@sitebuilder/schema";
import { sql } from "drizzle-orm";
import {
  customType,
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

// Postgres full-text search's document type. Only the database writes it (below).
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

// The words of the props visitors read, by name: headings, text, questions and answers,
// button labels, quotes, names, a plan's features, a table's cells. Ids, addresses and settings
// aren't among them, so a search for "muted" or "grid" doesn't find every page.
const READ_PROPS =
  "text|html|headline|body|heading|eyebrow|title|description|caption|cite|quote|author|role|name|question|answer|label|features|columns|rows|price|prefix|suffix";

// What site search matches (decisions #144): the title first, then the excerpt and search
// description, then the blocks' words. "simple": no language's stemming, so every site
// language is treated the same; searches match word beginnings instead. Computed by Postgres on
// every write, so saves, autosaves, restored revisions and imports all keep it current.
const searchDocument = sql.raw(`
  setweight(to_tsvector('simple', title), 'A') ||
  setweight(to_tsvector('simple', coalesce(excerpt, '') || ' ' || coalesce(seo_description, '')), 'B') ||
  setweight(jsonb_to_tsvector('simple', jsonb_path_query_array(content, 'lax $.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "^(${READ_PROPS})$").value'), '["string"]'), 'C')`);

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
    search: tsvector().generatedAlwaysAs(searchDocument),
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
    index("entries_search_idx").using("gin", t.search),
  ],
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type EntryType = (typeof entryType.enumValues)[number];
export type EntryStatus = (typeof entryStatus.enumValues)[number];
