// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, test } from "vitest";
import { type Action, type Actor, can, canSome } from "./can";

const admin: Actor = { id: "admin-1", role: "admin" };
const editor: Actor = { id: "editor-1", role: "editor" };
const author: Actor = { id: "author-1", role: "author" };
const mine = (type: "post" | "page" | "media") => ({ type, ownerId: author.id });
const theirs = (type: "post" | "page" | "media") => ({ type, ownerId: "someone-else" });

// One row per line of the design's matrix (§6.2): [action, admin, editor, author].
type Row = [string, Action, "post" | "page" | "media" | null, boolean, boolean, boolean];
const matrix: Row[] = [
  ["post: create", "post.create", null, true, true, true],
  ["post: read any", "post.read", "post", true, true, false],
  ["post: update any", "post.update", "post", true, true, false],
  ["post: publish any", "post.publish", "post", true, true, false],
  ["post: trash any", "post.trash", "post", true, true, false],
  ["post: delete permanently", "post.delete", "post", true, true, false],
  ["page: create", "page.create", null, true, true, false],
  ["page: read", "page.read", "page", true, true, false],
  ["page: update", "page.update", "page", true, true, false],
  ["page: publish", "page.publish", "page", true, true, false],
  ["page: trash", "page.trash", "page", true, true, false],
  ["page: delete", "page.delete", "page", true, true, false],
  ["term: create", "term.create", null, true, true, false],
  ["term: update", "term.update", null, true, true, false],
  ["term: delete", "term.delete", null, true, true, false],
  ["term: assign", "term.assign", null, true, true, true],
  ["media: upload", "media.upload", null, true, true, true],
  ["media: read any", "media.read", "media", true, true, false],
  ["media: update any", "media.update", "media", true, true, false],
  ["media: delete any", "media.delete", "media", true, true, false],
  ["menu: update", "menu.update", null, true, true, false],
  ["theme: update", "theme.update", null, true, true, false],
  ["template: activate", "template.activate", null, true, false, false],
  ["settings: update", "settings.update", null, true, false, false],
  ["user: create", "user.create", null, true, false, false],
  ["user: read", "user.read", null, true, false, false],
  ["user: update", "user.update", null, true, false, false],
  ["user: delete", "user.delete", null, true, false, false],
  ["user: setRole", "user.setRole", null, true, false, false],
];

describe("can() follows the matrix for other people's things", () => {
  test.each(matrix)("%s", (_, action, owned, forAdmin, forEditor, forAuthor) => {
    const resource = owned ? theirs(owned) : undefined;
    expect(can(admin, action, resource)).toBe(forAdmin);
    expect(can(editor, action, resource)).toBe(forEditor);
    expect(can(author, action, resource)).toBe(forAuthor);
  });
});

describe("own items", () => {
  test.each([
    "post.read",
    "post.update",
    "post.publish",
    "post.trash",
    "media.read",
    "media.update",
    "media.delete",
  ] as const)("an author may %s their own", (action) => {
    const type = action.startsWith("post") ? "post" : "media";
    expect(can(author, action, mine(type))).toBe(true);
    expect(can(author, action, theirs(type))).toBe(false);
  });

  test("an author may not permanently delete even their own post", () => {
    expect(can(author, "post.delete", mine("post"))).toBe(false);
  });

  test("an author has no rights on pages, even ones they wrote", () => {
    expect(can(author, "page.update", mine("page"))).toBe(false);
  });

  test("an owned action without a resource is refused unless the role has the full grant", () => {
    expect(can(author, "post.update")).toBe(false);
    expect(can(editor, "post.update")).toBe(true);
  });

  test("a resource of another type is refused", () => {
    expect(can(admin, "post.update", mine("media"))).toBe(false);
  });
});

test("canSome shows a screen when the actor has the action on at least their own items", () => {
  expect(canSome(author, "post.read")).toBe(true);
  expect(canSome(author, "media.read")).toBe(true);
  expect(canSome(author, "page.read")).toBe(false);
  expect(canSome(author, "user.read")).toBe(false);
  expect(canSome(editor, "settings.update")).toBe(false);
});
