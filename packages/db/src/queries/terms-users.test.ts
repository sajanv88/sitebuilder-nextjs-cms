// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { beforeEach, describe, expect, it } from "vitest";
import { session, user } from "../schema/auth-schema";
import { redirects } from "../schema/site";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import { createEntry, getEntryForEdit } from "./entries";
import { resolveRoute } from "./public";
import { createTerm, deleteTerm, listTerms, updateTerm } from "./terms";
import { deleteUser, listUsers, setUserBanned, setUserRole } from "./users";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

let db: TestDb;
let adminId: string;

beforeEach(async () => {
  db = await createTestDb();
  const setup = await bootstrapSite(db, {
    name: "Ada",
    email: "ada@example.com",
    passwordHash: "x",
    siteUrl: "https://example.com",
    allowExistingUsers: false,
  });
  if (!setup.ok) throw new Error("setup failed");
  adminId = setup.userId;
});

async function addUser(id: string, role: string) {
  await db
    .insert(user)
    .values({ id, name: id, email: `${id}@example.com`, role, updatedAt: new Date() });
}

describe("terms", () => {
  it("makes slugs unique within a taxonomy, and refuses a typed slug that's taken", async () => {
    const news = await createTerm(db, { taxonomy: "category", name: "News", slug: "" });
    const again = await createTerm(db, { taxonomy: "category", name: "News", slug: "" });
    const tag = await createTerm(db, { taxonomy: "tag", name: "News", slug: "" });
    expect(news).toMatchObject({ ok: true, term: { slug: "news" } });
    expect(again).toMatchObject({ ok: true, term: { slug: "news-2" } });
    expect(tag).toMatchObject({ ok: true, term: { slug: "news" } });

    expect(await createTerm(db, { taxonomy: "category", name: "X", slug: "news" })).toEqual({
      ok: false,
      error: "slug-taken",
    });
    if (!again.ok) return;
    expect(await updateTerm(db, { id: again.term.id, name: "Updates", slug: "news" })).toEqual({
      ok: false,
      error: "slug-taken",
    });
    expect(
      await updateTerm(db, { id: again.term.id, name: "Updates", slug: "updates" }),
    ).toMatchObject({ ok: true, term: { name: "Updates", slug: "updates" } });
  });

  it("a new slug redirects the old archive and its pages, without chains or loops", async () => {
    const news = await createTerm(db, { taxonomy: "category", name: "News", slug: "" });
    if (!news.ok) throw new Error("no term");
    const rename = (slug: string) => updateTerm(db, { id: news.term.id, name: "News", slug });

    await rename("updates");
    expect(await resolveRoute(db, "/blog/category/news")).toEqual({
      kind: "redirect",
      to: "/blog/category/updates",
      status: 301,
    });
    expect(await resolveRoute(db, "/blog/category/news/page/2")).toMatchObject({
      kind: "redirect",
      to: "/blog/category/updates/page/2",
    });
    expect(await resolveRoute(db, "/blog/category/updates")).toEqual({
      kind: "term",
      termId: news.term.id,
      page: 1,
    });

    await rename("latest");
    expect(await resolveRoute(db, "/blog/category/news")).toMatchObject({
      to: "/blog/category/latest",
    });
    await rename("news");
    expect(await resolveRoute(db, "/blog/category/news")).toMatchObject({ kind: "term" });
    expect(await resolveRoute(db, "/blog/category/latest")).toMatchObject({
      to: "/blog/category/news",
    });
    // A name change alone leaves the redirects as they are.
    const before = await db.$count(redirects);
    await updateTerm(db, { id: news.term.id, name: "Newsroom", slug: "news" });
    expect(await db.$count(redirects)).toBe(before);
    // A tag with the same slug is a different archive.
    expect(await resolveRoute(db, "/blog/tag/updates")).toEqual({ kind: "missing" });
  });

  it("deleting a term unlinks it and keeps the posts; counts skip the trash", async () => {
    const term = await createTerm(db, { taxonomy: "tag", name: "Old", slug: "" });
    if (!term.ok) throw new Error("term");
    const post = await createEntry(db, {
      title: "Tagged",
      slug: "",
      excerpt: null,
      seoTitle: null,
      seoDescription: null,
      parentId: null,
      content: [],
      featuredMediaId: null,
      categoryIds: [],
      tagIds: [term.term.id],
      type: "post",
      authorId: adminId,
      actorId: adminId,
    });
    if (!post.ok) throw new Error(post.error);
    expect(await listTerms(db, "tag")).toEqual([
      { id: term.term.id, name: "Old", slug: "old", postCount: 1 },
    ]);

    expect(await deleteTerm(db, term.term.id)).toEqual({ ok: true });
    expect(await getEntryForEdit(db, post.id)).toMatchObject({ title: "Tagged", tagIds: [] });
  });
});

describe("the last-admin rule", () => {
  it("the only admin can't be demoted, banned or deleted, even by themselves", async () => {
    expect(await setUserRole(db, adminId, "editor")).toEqual({ ok: false, error: "last-admin" });
    expect(await setUserBanned(db, adminId, true)).toEqual({ ok: false, error: "last-admin" });
    expect(await deleteUser(db, adminId, null)).toEqual({ ok: false, error: "last-admin" });
  });

  it("with a second admin, one can go; a banned admin doesn't count", async () => {
    await addUser("grace", "admin");
    expect(await setUserBanned(db, "grace", true)).toEqual({ ok: true });
    expect(await setUserRole(db, adminId, "editor")).toEqual({ ok: false, error: "last-admin" });

    expect(await setUserBanned(db, "grace", false)).toEqual({ ok: true });
    expect(await setUserRole(db, adminId, "editor")).toEqual({ ok: true });
    expect((await listUsers(db)).map((row) => [row.id, row.role])).toEqual(
      expect.arrayContaining([
        [adminId, "editor"],
        ["grace", "admin"],
      ]),
    );
  });

  it("banning ends the user's sessions", async () => {
    await addUser("bea", "author");
    await db.insert(session).values({
      id: "s1",
      token: "t1",
      userId: "bea",
      expiresAt: new Date(Date.now() + 60_000),
      updatedAt: new Date(),
    });
    expect(await setUserBanned(db, "bea", true)).toEqual({ ok: true });
    expect(await db.$count(session)).toBe(0);
  });
});

describe("deleteUser", () => {
  it("refuses while the user has content, and moves it when told who gets it", async () => {
    await addUser("bea", "author");
    const post = await createEntry(db, {
      title: "Bea's post",
      slug: "",
      excerpt: null,
      seoTitle: null,
      seoDescription: null,
      parentId: null,
      content: [],
      featuredMediaId: null,
      categoryIds: [],
      tagIds: [],
      type: "post",
      authorId: "bea",
      actorId: "bea",
    });
    if (!post.ok) throw new Error(post.error);

    expect(await deleteUser(db, "bea", null)).toEqual({ ok: false, error: "has-content" });
    expect(await deleteUser(db, "bea", "bea")).toEqual({ ok: false, error: "invalid-reassign" });
    expect(await deleteUser(db, "bea", "nobody")).toEqual({
      ok: false,
      error: "invalid-reassign",
    });

    expect(await deleteUser(db, "bea", adminId)).toEqual({ ok: true });
    expect(await getEntryForEdit(db, post.id)).toMatchObject({ author: { id: adminId } });
    expect((await listUsers(db)).map((row) => row.id)).toEqual([adminId]);
  });

  it("deletes a user with no content without asking", async () => {
    await addUser("cy", "editor");
    expect(await deleteUser(db, "cy", null)).toEqual({ ok: true });
  });
});

describe("sign-in limits per account", () => {
  it("locks after 10 failures within 15 minutes, and a success or the window clears it", async () => {
    const { SIGN_IN_LIMIT, clearFailedSignIns, isSignInLocked, recordFailedSignIn } = await import(
      "./sign-in-limits"
    );
    const start = 1_000_000;
    for (let i = 0; i < SIGN_IN_LIMIT.max - 1; i++) {
      await recordFailedSignIn(db, "ada@example.com", start + i);
    }
    expect(await isSignInLocked(db, "ada@example.com", start + 10)).toBe(false);
    await recordFailedSignIn(db, "ada@example.com", start + 10);
    expect(await isSignInLocked(db, "ada@example.com", start + 11)).toBe(true);
    // Another account isn't affected.
    expect(await isSignInLocked(db, "bea@example.com", start + 11)).toBe(false);
    // Once the window has passed since the last failure, it's open again.
    expect(await isSignInLocked(db, "ada@example.com", start + 10 + SIGN_IN_LIMIT.windowMs)).toBe(
      false,
    );
    // And the next failure starts a new count.
    await recordFailedSignIn(db, "ada@example.com", start + 10 + SIGN_IN_LIMIT.windowMs);
    expect(await isSignInLocked(db, "ada@example.com", start + 11 + SIGN_IN_LIMIT.windowMs)).toBe(
      false,
    );

    for (let i = 0; i < SIGN_IN_LIMIT.max; i++)
      await recordFailedSignIn(db, "bea@example.com", start);
    await clearFailedSignIns(db, "bea@example.com");
    expect(await isSignInLocked(db, "bea@example.com", start)).toBe(false);
  });
});
