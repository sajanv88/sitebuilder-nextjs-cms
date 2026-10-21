// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { CacheTags } from "@sitebuilder/schema";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { createTagStore } from "../cache/tag-store";
import type { Executor } from "../executor";
import { entries } from "../schema/entries";

// Scheduled entries whose time has come become published (design §4.1, §7), and both zones'
// cached copies are dropped through the cache handler's table, in the same transaction, so a
// post can't go live without its tags changing.
//
// Run once a minute by every admin process and by the cron route (decisions #75). No lock is
// needed: under read committed, a second UPDATE that reaches the same row waits for the first
// to commit, then sees the row is no longer `scheduled` and skips it, so each entry is
// published, and reported, once. `updatedAt` stays as it was, so an editor that has the entry
// open can still save.
export async function publishDueEntries(db: Executor, now = new Date()): Promise<string[]> {
  return db.transaction(async (tx) => {
    const published = await tx
      .update(entries)
      // Kept as it was: the column's $onUpdate would otherwise set it to now.
      .set({ status: "published", updatedAt: sql`${entries.updatedAt}` })
      .where(
        and(
          eq(entries.status, "scheduled"),
          lte(entries.publishedAt, now),
          isNull(entries.deletedAt),
        ),
      )
      .returning({ id: entries.id });
    const ids = published.map((row) => row.id);
    if (ids.length > 0) {
      await createTagStore(tx).write([CacheTags.entries, ...ids.map(CacheTags.entry)], null);
    }
    return ids;
  });
}
