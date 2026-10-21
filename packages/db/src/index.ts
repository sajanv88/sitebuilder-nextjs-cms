// The package's public surface for apps: the database, inferred types, query functions and
// Better Auth's adapter. Never the pool, never drizzle-kit, and not the tables: queries live in
// this package. drizzle-kit reads the tables through the "./schema" export instead.

export { authDatabase } from "./auth-adapter";
export { type Db, db } from "./client";
export type { Executor } from "./executor";
export { type BootstrapInput, type BootstrapResult, bootstrapSite } from "./queries/bootstrap";
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
  type MediaList,
  type MediaRow,
  type MediaUse,
  mediaUsage,
  type NewMediaInput,
  type RenderMedia,
  updateMediaAlt,
} from "./queries/media";
export { ensureMenus } from "./queries/menus";
export {
  listRevisions,
  REVISIONS_KEPT,
  type RestoreRevisionResult,
  type RevisionRow,
  restoreRevision,
} from "./queries/revisions";
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
