// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// The package's public surface for apps: the database, inferred types, query functions and
// Better Auth's adapter. Never the pool, never drizzle-kit, and not the tables: queries live in
// this package. drizzle-kit reads the tables through the "./schema" export instead.

export { authDatabase } from "./auth-adapter";
export { type Db, db } from "./client";
export type { Executor } from "./executor";
export {
  type AiBatchEntry,
  type AiUsage,
  aiSourceRef,
  aiUsage,
  createAiBatch,
  type DiscardAiBatchResult,
  deleteOldAiRuns,
  discardAiBatch,
  type FinishAiBatch,
  type FinishAiBatchResult,
  finishAiBatch,
  getAiBatch,
  listAiBatchEntries,
  recordAiRun,
  startOfUtcDay,
} from "./queries/ai";
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
  mediaToMove,
  mediaUsage,
  type NewMediaInput,
  type RenderMedia,
  setMediaPrivate,
  setMediaStorage,
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
  getEntryForCanvas,
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
  type SearchHit,
  type SitemapEntry,
  searchPublic,
  searchTerms,
} from "./queries/public";
export { countPosts, type SaveReadingResult, saveReadingSettings } from "./queries/reading";
export {
  deleteRedirect,
  listRedirects,
  type RedirectRow,
  redirectFor,
  type SaveRedirectResult,
  saveRedirect,
} from "./queries/redirects";
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
  activateTemplate,
  type CreatedEntry,
  findTakenPaths,
  getTemplateSettings,
  type ImportedEntry,
  listImportedEntries,
  type TemplateActivation,
  type TemplateActivationResult,
  type TemplateEntryWrite,
} from "./queries/templates";
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
export type { AiBatch, AiRun } from "./schema/ai";
export type { Entry, EntryStatus, EntryType } from "./schema/entries";
export type { EntryRevision } from "./schema/entry-revisions";
export type { Media } from "./schema/media";
export type { Redirect } from "./schema/site";
export type { Taxonomy, Term } from "./schema/terms";
