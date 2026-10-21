// The package's public surface for apps: the database, inferred types, query functions and
// Better Auth's adapter. Never the pool, never drizzle-kit, and not the tables: queries live in
// this package. drizzle-kit reads the tables through the "./schema" export instead.

export { authDatabase } from "./auth-adapter";
export { type Db, db } from "./client";
export type { Executor } from "./executor";
export { type BootstrapInput, type BootstrapResult, bootstrapSite } from "./queries/bootstrap";
export { getPublicEntryByPath } from "./queries/entries";
export { ensureMenus } from "./queries/menus";
export { getSettings, type UpsertSettingsResult, upsertSettings } from "./queries/settings";
export { countUsers } from "./queries/users";
export type { Entry, EntryStatus, EntryType } from "./schema/entries";
export type { EntryRevision } from "./schema/entry-revisions";
export type { Media } from "./schema/media";
export type { Redirect } from "./schema/site";
export type { Taxonomy, Term } from "./schema/terms";
