import type { MenuItem, MenuLocation, SettingsKey, SettingsValue } from "@sitebuilder/schema";
import { sql } from "drizzle-orm";
import { check, integer, jsonb, snakeCase, text } from "drizzle-orm/pg-core";
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

export type Redirect = typeof redirects.$inferSelect;
