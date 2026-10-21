// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { EntryListQuery } from "@sitebuilder/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { user } from "../schema/auth-schema";
import { entries } from "../schema/entries";
import { entryRevisions } from "../schema/entry-revisions";
import { redirects } from "../schema/site";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import {
  createEntry,
  deleteEntry,
  type EntryWrite,
  getEntryForEdit,
  listEntries,
  listParentOptions,
  restoreEntry,
  setEntryStatus,
  trashEntry,
  updateEntry,
} from "./entries";
import { listRevisions, REVISIONS_KEPT, restoreRevision } from "./revisions";
import { createTerm } from "./terms";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const fields = (overrides: Partial<EntryWrite> = {}): EntryWrite => ({
  title: "About us",
  content: [],
  featuredMediaId: null,
  slug: "",
  excerpt: null,
  seoTitle: null,
  seoDescription: null,
  parentId: null,
  categoryIds: [],
  tagIds: [],
  ...overrides,
});

const query = (overrides: Partial<EntryListQuery> = {}): EntryListQuery => ({
  view: "all",
  sort: "-date",
  page: 1,
  size: 20,
  q: "",
  ...overrides,
});

let db: TestDb;
let adminId: string;
let authorId: string;

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
  authorId = "author-1";
  await db.insert(user).values({
    id: authorId,
    name: "Bea",
    email: "bea@example.com",
    role: "author",
    updatedAt: new Date(),
  });
});

async function newPage(title: string, overrides: Partial<EntryWrite> = {}) {
  const result = await createEntry(db, {
    ...fields({ title, ...overrides }),
    type: "page",
    authorId: adminId,
    actorId: adminId,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function edit(id: string, overrides: Partial<EntryWrite>) {
  const entry = await getEntryForEdit(db, id);
  if (!entry) throw new Error("missing");
  return updateEntry(db, {
    ...fields({
      title: entry.title,
      slug: entry.slug,
      parentId: entry.parent?.id ?? null,
      ...overrides,
    }),
    id,
    expectedUpdatedAt: entry.updatedAt,
    authorId: null,
    actorId: adminId,
  });
}

describe("createEntry", () => {
  it("makes the slug from the title and keeps it unique among siblings", async () => {
    const first = await newPage("About us");
    const second = await newPage("About us");
    expect(first).toMatchObject({ slug: "about-us", path: "/about-us" });
    expect(second).toMatchObject({ slug: "about-us-2", path: "/about-us-2" });

    const child = await newPage("About us", { parentId: first.id });
    expect(child.path).toBe("/about-us/about-us");
  });

  it("puts posts under the posts path, and starts with an empty block list and a revision", async () => {
    const post = await createEntry(db, {
      ...fields({ title: "Hello world" }),
      type: "post",
      authorId,
      actorId: authorId,
    });
    expect(post).toMatchObject({ ok: true, path: "/blog/hello-world" });
    if (!post.ok) return;
    const row = await db.query.entries.findFirst({ where: { id: post.id } });
    expect(row).toMatchObject({ status: "draft", content: [], authorId });
    expect(await listRevisions(db, post.id)).toHaveLength(1);
  });

  it("refuses a reserved root slug that was typed, and suffixes one made from the title", async () => {
    const typed = await createEntry(db, {
      ...fields({ title: "Admin", slug: "admin" }),
      type: "page",
      authorId: adminId,
      actorId: adminId,
    });
    expect(typed).toEqual({ ok: false, error: "reserved-slug" });

    expect(await newPage("Admin")).toMatchObject({ slug: "admin-2" });
    expect(await newPage("Blog")).toMatchObject({ slug: "blog-2" });
    const parent = await newPage("Docs");
    expect(await newPage("Admin", { parentId: parent.id })).toMatchObject({
      path: "/docs/admin",
    });
  });

  it("attaches categories and tags to posts only", async () => {
    const category = await createTerm(db, { taxonomy: "category", name: "News", slug: "" });
    const tag = await createTerm(db, { taxonomy: "tag", name: "Launch", slug: "" });
    if (!category.ok || !tag.ok) throw new Error("terms");
    const post = await createEntry(db, {
      // The tag id in categoryIds is ignored: it isn't a category.
      ...fields({
        title: "Launch day",
        categoryIds: [category.term.id, tag.term.id],
        tagIds: [tag.term.id],
      }),
      type: "post",
      authorId,
      actorId: authorId,
    });
    if (!post.ok) throw new Error(post.error);
    expect(await getEntryForEdit(db, post.id)).toMatchObject({
      categoryIds: [category.term.id],
      tagIds: [tag.term.id],
    });
  });
});

describe("updateEntry", () => {
  it("refuses a save made from a stale copy, and overwrites nothing", async () => {
    const page = await newPage("Team");
    const stale = page.updatedAt;
    expect(await edit(page.id, { title: "The team" })).toMatchObject({ ok: true });

    const late = await updateEntry(db, {
      ...fields({ title: "Overwritten", slug: "team" }),
      id: page.id,
      expectedUpdatedAt: stale,
      authorId: null,
      actorId: adminId,
    });
    expect(late).toEqual({ ok: false, error: "conflict" });
    expect((await getEntryForEdit(db, page.id))?.title).toBe("The team");
  });

  it("moves the page and its descendants, and redirects their public paths", async () => {
    const about = await newPage("About");
    const team = await newPage("Team", { parentId: about.id });
    const ada = await newPage("Ada", { parentId: team.id });
    for (const id of [about.id, team.id]) {
      await setEntryStatus(db, {
        id,
        change: { kind: "publish", at: null },
        expectedUpdatedAt: null,
        actorId: adminId,
        writeRevision: true,
      });
    }

    expect(await edit(about.id, { slug: "company" })).toMatchObject({ path: "/company" });

    const paths = await db.select({ id: entries.id, path: entries.path }).from(entries);
    expect(new Map(paths.map((row) => [row.id, row.path]))).toEqual(
      new Map([
        [about.id, "/company"],
        [team.id, "/company/team"],
        [ada.id, "/company/team/ada"],
      ]),
    );
    // Ada is a draft: visitors never saw /about/team/ada, so it gets no redirect.
    expect(
      await db.select({ from: redirects.fromPath, to: redirects.toPath }).from(redirects),
    ).toEqual(
      expect.arrayContaining([
        { from: "/about", to: "/company" },
        { from: "/about/team", to: "/company/team" },
      ]),
    );
    expect(await db.$count(redirects)).toBe(2);
  });

  it("keeps redirects free of chains and loops when a page moves back", async () => {
    const page = await newPage("A");
    await setEntryStatus(db, {
      id: page.id,
      change: { kind: "publish", at: null },
      expectedUpdatedAt: null,
      actorId: adminId,
      writeRevision: false,
    });
    await edit(page.id, { slug: "b" });
    await edit(page.id, { slug: "c" });
    expect(
      await db.select({ from: redirects.fromPath, to: redirects.toPath }).from(redirects),
    ).toEqual(
      expect.arrayContaining([
        { from: "/a", to: "/c" },
        { from: "/b", to: "/c" },
      ]),
    );

    await edit(page.id, { slug: "a" });
    const rows = await db
      .select({ from: redirects.fromPath, to: redirects.toPath })
      .from(redirects);
    expect(rows).toEqual(
      expect.arrayContaining([
        { from: "/b", to: "/a" },
        { from: "/c", to: "/a" },
      ]),
    );
    expect(rows.find((row) => row.from === "/a")).toBeUndefined();
  });

  it("refuses a parent that is the page itself or one of its descendants", async () => {
    const top = await newPage("Top");
    const below = await newPage("Below", { parentId: top.id });
    expect(await edit(top.id, { parentId: top.id })).toEqual({
      ok: false,
      error: "invalid-parent",
    });
    expect(await edit(top.id, { parentId: below.id })).toEqual({
      ok: false,
      error: "invalid-parent",
    });
    expect((await listParentOptions(db, top.id)).map((row) => row.id)).not.toContain(below.id);
  });

  it("writes a revision per save and keeps the latest 50", async () => {
    const page = await newPage("Revised");
    for (let i = 1; i <= REVISIONS_KEPT + 2; i++) {
      expect(await edit(page.id, { title: `Revised ${i}` })).toMatchObject({ ok: true });
    }
    const kept = await listRevisions(db, page.id);
    expect(kept).toHaveLength(REVISIONS_KEPT);
    expect(kept[0]?.title).toBe(`Revised ${REVISIONS_KEPT + 2}`);
    expect(await db.$count(entryRevisions, eq(entryRevisions.entryId, page.id))).toBe(
      REVISIONS_KEPT,
    );
  });
});

describe("restoreRevision", () => {
  it("copies the title back and records a new revision", async () => {
    const page = await newPage("First title");
    await edit(page.id, { title: "Second title" });
    const [, original] = await listRevisions(db, page.id);
    const current = await getEntryForEdit(db, page.id);
    if (!original || !current) throw new Error("missing");

    const result = await restoreRevision(db, {
      entryId: page.id,
      revisionId: original.id,
      expectedUpdatedAt: current.updatedAt,
      actorId: adminId,
    });
    expect(result.ok).toBe(true);
    expect((await getEntryForEdit(db, page.id))?.title).toBe("First title");
    expect(await listRevisions(db, page.id)).toHaveLength(3);

    const stale = await restoreRevision(db, {
      entryId: page.id,
      revisionId: original.id,
      expectedUpdatedAt: current.updatedAt,
      actorId: adminId,
    });
    expect(stale).toEqual({ ok: false, error: "conflict" });
  });
});

describe("setEntryStatus", () => {
  it("publishes now, schedules a future date, and unpublishes keeping the date", async () => {
    const page = await newPage("Launch");
    const now = await setEntryStatus(db, {
      id: page.id,
      change: { kind: "publish", at: null },
      expectedUpdatedAt: page.updatedAt,
      actorId: adminId,
      writeRevision: true,
    });
    expect(now).toMatchObject({ ok: true, status: "published" });

    const later = new Date(Date.now() + 86_400_000);
    const scheduled = await setEntryStatus(db, {
      id: page.id,
      change: { kind: "publish", at: later },
      expectedUpdatedAt: null,
      actorId: adminId,
      writeRevision: true,
    });
    expect(scheduled).toMatchObject({ ok: true, status: "scheduled", publishedAt: later });

    const draft = await setEntryStatus(db, {
      id: page.id,
      change: { kind: "unpublish" },
      expectedUpdatedAt: null,
      actorId: adminId,
      writeRevision: false,
    });
    expect(draft).toMatchObject({ ok: true, status: "draft", publishedAt: later });

    // Publishing a draft whose date is in the future publishes it now.
    const again = await setEntryStatus(db, {
      id: page.id,
      change: { kind: "publish", at: null },
      expectedUpdatedAt: null,
      actorId: adminId,
      writeRevision: false,
    });
    expect(again).toMatchObject({ status: "published" });
    if (again.ok) expect(again.publishedAt?.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("trash, restore and delete", () => {
  it("trashing frees the path; restoring onto a taken path returns as a draft", async () => {
    const page = await newPage("Contact");
    await setEntryStatus(db, {
      id: page.id,
      change: { kind: "publish", at: null },
      expectedUpdatedAt: null,
      actorId: adminId,
      writeRevision: false,
    });
    expect(await trashEntry(db, page.id)).toEqual({ ok: true });
    expect(await trashEntry(db, page.id)).toEqual({ ok: false, error: "in-trash" });

    const replacement = await newPage("Contact");
    expect(replacement.path).toBe("/contact");

    expect(await restoreEntry(db, page.id)).toEqual({
      ok: true,
      asDraft: true,
      path: "/contact-2",
    });
    expect(await getEntryForEdit(db, page.id)).toMatchObject({
      status: "draft",
      slug: "contact-2",
      deletedAt: null,
    });
  });

  it("restores in its previous state when the path is still free", async () => {
    const page = await newPage("Pricing");
    await trashEntry(db, page.id);
    expect(await restoreEntry(db, page.id)).toEqual({ ok: true, asDraft: false, path: "/pricing" });
    expect(await restoreEntry(db, page.id)).toEqual({ ok: false, error: "not-in-trash" });
  });

  it("deletes only from the trash, and not while the page has children", async () => {
    const parent = await newPage("Parent");
    const child = await newPage("Child", { parentId: parent.id });
    expect(await deleteEntry(db, parent.id)).toEqual({ ok: false, error: "not-in-trash" });
    await trashEntry(db, parent.id);
    expect(await deleteEntry(db, parent.id)).toEqual({ ok: false, error: "has-children" });

    await trashEntry(db, child.id);
    expect(await deleteEntry(db, child.id)).toEqual({ ok: true });
    expect(await deleteEntry(db, parent.id)).toEqual({ ok: true });
    expect(await db.$count(entryRevisions)).toBe(0);
  });
});

describe("listEntries", () => {
  async function newPost(title: string, author: string) {
    const result = await createEntry(db, {
      ...fields({ title }),
      type: "post",
      authorId: author,
      actorId: author,
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  it("filters by view, author and search, sorts by an allowed key, and counts the views", async () => {
    const a = await newPost("Apple pie", adminId);
    await newPost("banana bread", authorId);
    const c = await newPost("Cherry 100%_off", authorId);
    await setEntryStatus(db, {
      id: a.id,
      change: { kind: "publish", at: null },
      expectedUpdatedAt: null,
      actorId: adminId,
      writeRevision: false,
    });
    await trashEntry(db, c.id);

    const all = await listEntries(db, {
      ...query({ sort: "title" }),
      type: "post",
      authorId: null,
    });
    expect(all.rows.map((row) => row.title)).toEqual(["Apple pie", "banana bread"]);
    expect(all.counts).toEqual({ all: 2, published: 1, drafts: 1, scheduled: 0, trash: 1 });

    const mine = await listEntries(db, { ...query({ view: "trash" }), type: "post", authorId });
    expect(mine.rows.map((row) => row.title)).toEqual(["Cherry 100%_off"]);
    expect(mine.counts.all).toBe(1);

    // % and _ in a search are literal characters.
    const search = await listEntries(db, {
      ...query({ view: "trash", q: "100%_" }),
      type: "post",
      authorId: null,
    });
    expect(search.total).toBe(1);
    const none = await listEntries(db, { ...query({ q: "%" }), type: "post", authorId: null });
    expect(none.total).toBe(0);

    expect(
      (await listEntries(db, { ...query({ sort: "-author" }), type: "post", authorId: null }))
        .rows[0]?.author.name,
    ).toBe("Bea");
  });

  it("a page past the end shows the last page", async () => {
    for (const title of ["One", "Two", "Three"]) await newPost(title, adminId);
    const list = await listEntries(db, {
      ...query({ page: 9, size: 10 }),
      type: "post",
      authorId: null,
    });
    expect(list).toMatchObject({ page: 1, total: 3 });
    expect(list.rows).toHaveLength(3);
  });
});

describe("a parent in the trash", () => {
  it("stays the parent when the child is saved, but can't be chosen anew", async () => {
    const parent = await newPage("Old section");
    const child = await newPage("Kept", { parentId: parent.id });
    const other = await newPage("Other");
    await trashEntry(db, parent.id);

    expect(await edit(child.id, { title: "Kept, edited" })).toMatchObject({
      ok: true,
      path: "/old-section/kept",
    });
    expect(await edit(other.id, { parentId: parent.id })).toEqual({
      ok: false,
      error: "invalid-parent",
    });
  });
});
