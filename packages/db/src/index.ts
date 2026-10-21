// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// The package's public surface for apps: the database, inferred types, query functions and
// Better Auth's adapter. Never the pool, never drizzle-kit, and not the tables: queries live in
// this package. drizzle-kit reads the tables through the "./schema" export instead.

export { authDatabase } from "./auth-adapter";
export { type Db, db } from "./client";
export type { Executor } from "./executor";
export { type BootstrapInput, type BootstrapResult, bootstrapSite } from "./queries/bootstrap";
export {
  type DashboardCounts,
  type DashboardScope,
  dashboardCounts,
  type RecentEntry,
  recentEntries,
} from "./queries/dashboard";
export {
  type AutosaveResult,
  autosaveEntry,
  countEntriesByAuthor,
  createEntry,
  type DeleteResult,
  deleteEntry,
  type EntryForEdit,
  type EntryLink,
  type EntryList,
  type EntryListRow,
  type EntryWrite,
  type EntryWriteError,
  type EntryWriteResult,
  getEntryForEdit,
  getEntryLinks,
  getEntryOwner,
  getPublicEntryByPath,
  type ListEntriesInput,
  listEntries,
  listLatestPosts,
  listParentOptions,
  type PostCard,
  type RestoreResult,
  restoreEntry,
  type StatusChange,
  type StatusResult,
  searchEntryLinks,
  setEntryStatus,
  type TrashResult,
  trashEntry,
  updateEntry,
} from "./queries/entries";
export {
  countMediaByStorage,
  createMedia,
  type DeleteMediaResult,
  deleteMedia,
  getMedia,
  getMediaByKey,
  getMediaForRender,
  type ListMediaInput,
  listMedia,
  type MediaFolders,
  type MediaList,
  type MediaRow,
  type MediaUse,
  mediaFolders,
  mediaUsage,
  type NewMediaInput,
  type RenderMedia,
  updateMediaAlt,
} from "./queries/media";
export {
  ensureMenus,
  getMenu,
  type MenuLinkProblem,
  type ResolvedMenuItem,
  resolveMenu,
  type SaveMenuResult,
  saveMenu,
} from "./queries/menus";
export {
  countPublicPosts,
  DEFAULT_READING,
  getEntryForPreview,
  getPublicEntry,
  getReading,
  getTerm,
  getTermBySlug,
  isPublishedPage,
  listArchiveTerms,
  listPublicPosts,
  listPublishedPages,
  listSitemapEntries,
  type PublicEntry,
  type PublicPostCard,
  type PublicRoute,
  type PublicTerm,
  resolveRoute,
  type SitemapEntry,
} from "./queries/public";
export { countPosts, type SaveReadingResult, saveReadingSettings } from "./queries/reading";
export {
  listRevisions,
  REVISIONS_KEPT,
  type RestoreRevisionResult,
  type RevisionRow,
  restoreRevision,
} from "./queries/revisions";
export { publishDueEntries } from "./queries/scheduled";
export {
  deleteSettings,
  getSettings,
  type UpsertSettingsResult,
  upsertSettings,
} from "./queries/settings";
export {
  clearFailedSignIns,
  isSignInLocked,
  recordFailedSignIn,
  SIGN_IN_LIMIT,
} from "./queries/sign-in-limits";
export {
  createTerm,
  deleteTerm,
  listTermOptions,
  listTerms,
  type TermRow,
  type TermWriteResult,
  updateTerm,
} from "./queries/terms";
export {
  countUsers,
  type DeleteUserResult,
  deleteUser,
  getUserSummary,
  listUserOptions,
  listUsers,
  setUserBanned,
  setUserRole,
  type UserRow,
} from "./queries/users";
export type { Entry, EntryStatus, EntryType } from "./schema/entries";
export type { EntryRevision } from "./schema/entry-revisions";
export type { Media } from "./schema/media";
export type { Redirect } from "./schema/site";
export type { Taxonomy, Term } from "./schema/terms";
