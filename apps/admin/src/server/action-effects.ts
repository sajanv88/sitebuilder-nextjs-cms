// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// What each Server Action and route handler changes on the public site, as the kinds of cache
// tags it must invalidate (design §7, decisions #63). Every export of src/actions/ is listed,
// with [] where nothing public changes; action-effects.test.ts fails on one that isn't, so a
// new action can't forget the public site.

export type Effect =
  // Entry lists, paths, archives, the sitemap and the feed; with ids, each entry's own tag.
  | "entries"
  | "redirects"
  | "terms"
  // Site, reading and theme settings.
  | "settings"
  // Alt text and the facts pages draw files with.
  | "media"
  // One menu, or several, named by the call.
  | "menu"
  // Which template the site uses.
  | "template";

export const ACTION_EFFECTS = {
  // account.ts: an author's name is printed on their posts.
  updateName: ["entries"],
  changePassword: [],
  // entry-editor.ts
  saveEntry: ["entries", "redirects"],
  // Drafts only, which visitors never see.
  autosaveDraft: [],
  searchLinkTargets: [],
  loadRevisions: [],
  restoreEntryRevision: ["entries"],
  createTermFromEditor: ["terms"],
  // entry-list.ts: a restore can move an entry onto a new path, with redirects.
  trashEntries: ["entries"],
  restoreEntries: ["entries", "redirects"],
  deleteEntries: ["entries"],
  // media-storage.ts: where files are read from; addresses stay the same.
  testStorage: [],
  testAiConnection: [],
  saveAiSettings: [],
  saveStorage: ["settings"],
  // Addresses stay the same; the media tag drops what's cached about where each file is.
  moveMediaFiles: ["media"],
  // media.ts
  listMediaPage: [],
  getMediaDetails: [],
  saveAlt: ["media"],
  // Private files leave pages' pictures alone: a used file can't be made private.
  setFilePrivate: ["media"],
  makeShareLink: [],
  deleteMediaFile: ["media"],
  // menus.ts
  saveMenuItems: ["menu"],
  searchMenuTargets: [],
  // settings.ts: a new posts path moves every post, with redirects.
  saveSiteSettings: ["settings"],
  saveReading: ["settings", "entries", "redirects"],
  saveDateSettings: ["settings"],
  saveAnalytics: ["settings"],
  // email.ts: nothing public.
  saveEmail: [],
  // redirects.ts
  saveRedirectForm: ["redirects"],
  removeRedirect: ["redirects"],
  // appearance.ts
  saveTheme: ["settings"],
  // templates.ts: a template can bring its theme, pages, menus and home page.
  previewTemplateActivation: [],
  activateTemplate: ["template", "settings", "entries", "menu"],
  // Its options change how every public page is drawn.
  saveTemplateOptions: ["template", "settings"],
  // terms.ts: archives, the categories and tags printed on posts, and a new slug's redirect.
  saveTerm: ["terms", "entries", "redirects"],
  removeTerm: ["terms", "entries"],
  // users.ts: users with content can't be deleted, and nothing else here is public.
  createUser: [],
  changeRole: [],
  changeBan: [],
  removeUser: [],
  setPassword: [],
  sendPasswordLink: [],
} as const satisfies Record<string, readonly Effect[]>;

export type ActionName = keyof typeof ACTION_EFFECTS;
