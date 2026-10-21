import type { MenuItem, MenuLocation, SettingsKey, SettingsValue } from "@sitebuilder/schema";
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, snakeCase, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt } from "./columns";

// Site-wide tables (design §4, §4.4, §4.5). JSON values are validated with the
// @sitebuilder/schema schemas on every write.

// Exactly two rows, "primary" and "footer", created by /setup.
export const menus = snakeCase.table("menus", {
  location: text().$type<MenuLocation>().primaryKey(),
  items: jsonb().$type<MenuItem[]>().notNull(),
});

export const redirects = snakeCase.table(
  "redirects",
  {
    fromPath: text().primaryKey(),
    toPath: text().notNull(),
    status: integer().notNull().default(301),
    createdAt: createdAt(),
  },
  (t) => [check("redirects_status_check", sql`${t.status} in (301, 302, 307, 308)`)],
);

// Keys "site", "theme", "reading", created by /setup.
export const settings = snakeCase.table("settings", {
  key: text().$type<SettingsKey>().primaryKey(),
  value: jsonb().$type<SettingsValue<SettingsKey>>().notNull(),
});

// When each cache tag was last invalidated, shared by both zones and every replica (the cache
// handler in src/cache/). One row per tag; the cached data itself stays in each process.
export const cacheTags = snakeCase.table(
  "cache_tags",
  {
    tag: text().primaryKey(),
    // Null: expire at once (updateTag). Set: stale now, expired after this many seconds
    // (revalidateTag with a profile).
    expireSeconds: integer(),
    // clock_timestamp() of the last invalidation, so readers can ask what changed since.
    updatedAt: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("cache_tags_updated_at_idx").on(t.updatedAt)],
);

export type Redirect = typeof redirects.$inferSelect;
