// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// The role-to-actions table (design §6.1, §6.2). This plain object is the source of truth:
// can() reads it, and access-control.ts registers it with Better Auth's admin plugin.
// `xOwn` is the action `x` restricted to entries or files the actor owns.

import type { Role } from "@sitebuilder/schema";

export { ROLES, type Role } from "@sitebuilder/schema";

export const statements = {
  post: [
    "create",
    "read",
    "readOwn",
    "update",
    "updateOwn",
    "publish",
    "publishOwn",
    "trash",
    "trashOwn",
    "delete",
  ],
  page: ["create", "read", "update", "publish", "trash", "delete"],
  term: ["create", "update", "delete", "assign"],
  media: ["upload", "read", "readOwn", "update", "updateOwn", "delete", "deleteOwn"],
  menu: ["update"],
  theme: ["update"],
  // Which template the site uses, and importing its starter content (design §14). Admins only.
  template: ["activate"],
  settings: ["update"],
  user: ["create", "read", "update", "delete", "setRole"],
} as const;

export type ResourceType = keyof typeof statements;
export type Grant<R extends ResourceType> = (typeof statements)[R][number];
export type RolePermissions = { readonly [R in ResourceType]?: readonly Grant<R>[] };

const content = {
  post: statements.post,
  page: statements.page,
  term: statements.term,
  media: statements.media,
  menu: statements.menu,
  theme: statements.theme,
} as const;

export const permissions = {
  admin: {
    ...content,
    template: statements.template,
    settings: statements.settings,
    user: statements.user,
  },
  editor: content,
  author: {
    post: ["create", "readOwn", "updateOwn", "publishOwn", "trashOwn"],
    term: ["assign"],
    media: ["upload", "readOwn", "updateOwn", "deleteOwn"],
  },
} as const satisfies Record<Role, RolePermissions>;
