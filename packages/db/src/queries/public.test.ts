// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { EntryKind } from "@sitebuilder/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { redirects } from "../schema/site";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import {
  createEntry,
  type EntryWrite,
  getEntryForEdit,
  setEntryStatus,
  trashEntry,
  updateEntry,
} from "./entries";
import { getMenu, resolveMenu, saveMenu } from "./menus";
import {
  getEntryForCanvas,
  getEntryForPreview,
  getPublicEntry,
  listArchiveTerms,
  listPublicPosts,
  listSitemapEntries,
  resolveRoute,
  searchPublic,
  searchTerms,
} from "./public";
import { countPosts, saveReadingSettings } from "./reading";
import { upsertSettings } from "./settings";
import { createTerm } from "./terms";

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

async function entry(type: EntryKind, title: string, overrides: Partial<EntryWrite> = {}) {
  const result = await createEntry(db, {
    title,
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
    type,
    authorId: adminId,
    actorId: adminId,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function publish(id: string, at: Date | null = null) {
  const result = await setEntryStatus(db, {
    id,
    change: { kind: "publish", at },
    expectedUpdatedAt: null,
    actorId: adminId,
    writeRevision: false,
  });
  if (!result.ok) throw new Error(result.error);
}

async function setPerPage(postsPerPage: number) {
  await upsertSettings(db, "reading", { homepageEntryId: null, postsPerPage, postsPath: "/blog" });
}

describe("page background", () => {
  it("is stored, read for the site, and kept by a save that doesn't send it", async () => {
    const page = await entry("page", "Cream", { background: "#fdf6e3" });
    expect((await getEntryForCanvas(db, page.id))?.background).toBe("#fdf6e3");
    const write = {
      title: "Cream",
      content: [],
      featuredMediaId: null,
      slug: "",
      excerpt: null,
      seoTitle: null,
      seoDescription: null,
      parentId: null,
      categoryIds: [],
      tagIds: [],
      authorId: null,
      actorId: adminId,
    };
    const kept = await updateEntry(db, {
      ...write,
      id: page.id,
      expectedUpdatedAt: page.updatedAt,
    });
    if (!kept.ok) throw new Error(kept.error);
    expect((await getEntryForEdit(db, page.id))?.background).toBe("#fdf6e3");
    const cleared = await updateEntry(db, {
      ...write,
      id: page.id,
      expectedUpdatedAt: kept.updatedAt,
      background: null,
    });
    expect(cleared.ok).toBe(true);
    expect((await getEntryForEdit(db, page.id))?.background).toBeNull();
  });
});

describe("resolveRoute", () => {
  it("finds public entries and nothing else", async () => {
    const about = await entry("page", "About");
    const draft = await entry("page", "Draft");
    await publish(about.id);
    expect(await resolveRoute(db, "/")).toEqual({ kind: "home" });
    expect(await resolveRoute(db, "/about")).toEqual({ kind: "entry", id: about.id });
    expect(await resolveRoute(db, draft.path)).toEqual({ kind: "missing" });
    expect(await resolveRoute(db, "/about/")).toEqual({ kind: "missing" });
    expect(await resolveRoute(db, "/nothing")).toEqual({ kind: "missing" });
  });

  it("hides scheduled and trashed entries", async () => {
    const later = await entry("page", "Later");
    await publish(later.id, new Date(Date.now() + 86_400_000));
    const gone = await entry("page", "Gone");
    await publish(gone.id);
    await trashEntry(db, gone.id);
    expect(await resolveRoute(db, later.path)).toEqual({ kind: "missing" });
    expect(await resolveRoute(db, gone.path)).toEqual({ kind: "missing" });
    expect(await getEntryForCanvas(db, later.id)).toMatchObject({ status: "scheduled" });
    expect(await getEntryForCanvas(db, gone.id)).toBeUndefined();
  });

  it("answers a stored redirect with its status", async () => {
    await db.insert(redirects).values({ fromPath: "/old", toPath: "/new", status: 302 });
    expect(await resolveRoute(db, "/old")).toEqual({ kind: "redirect", to: "/new", status: 302 });
  });

  it("sends the home page's own path to /", async () => {
    const home = await entry("page", "Welcome");
    await publish(home.id);
    await upsertSettings(db, "reading", {
      homepageEntryId: home.id,
      postsPerPage: 10,
      postsPath: "/blog",
    });
    expect(await resolveRoute(db, "/welcome")).toEqual({ kind: "redirect", to: "/", status: 301 });
  });

  it("routes the blog, its pages and its archives, and refuses pages past the end", async () => {
    await setPerPage(2);
    const news = await createTerm(db, { taxonomy: "category", name: "News", slug: "" });
    if (!news.ok) throw new Error("term");
    for (const title of ["One", "Two", "Three"]) {
      const post = await entry("post", title, { categoryIds: [news.term.id] });
      await publish(post.id);
    }
    expect(await resolveRoute(db, "/blog")).toEqual({ kind: "posts", page: 1 });
    expect(await resolveRoute(db, "/blog/page/2")).toEqual({ kind: "posts", page: 2 });
    expect(await resolveRoute(db, "/blog/page/3")).toEqual({ kind: "missing" });
    expect(await resolveRoute(db, "/blog/page/1")).toEqual({
      kind: "redirect",
      to: "/blog",
      status: 301,
    });
    expect(await resolveRoute(db, "/blog/page/02")).toEqual({ kind: "missing" });
    expect(await resolveRoute(db, "/blog/category/news/page/2")).toEqual({
      kind: "term",
      termId: news.term.id,
      page: 2,
    });
    expect(await resolveRoute(db, "/blog/category/sport")).toEqual({ kind: "missing" });
    expect(await resolveRoute(db, "/blog/tag/news")).toEqual({ kind: "missing" });
    expect(await resolveRoute(db, "/blog/one")).toMatchObject({ kind: "entry" });
  });

  it("serves an empty blog as one page", async () => {
    expect(await resolveRoute(db, "/blog")).toEqual({ kind: "posts", page: 1 });
    expect(await resolveRoute(db, "/blog/page/2")).toEqual({ kind: "missing" });
  });
});

describe("reserved post slugs", () => {
  it("keeps posts off the blog's own addresses", async () => {
    const post = await entry("post", "Page");
    expect(post.path).toBe("/blog/page-2");
    const typed = await createEntry(db, {
      title: "Tag",
      content: [],
      featuredMediaId: null,
      slug: "tag",
      excerpt: null,
      seoTitle: null,
      seoDescription: null,
      parentId: null,
      categoryIds: [],
      tagIds: [],
      type: "post",
      authorId: adminId,
      actorId: adminId,
    });
    expect(typed).toEqual({ ok: false, error: "reserved-slug" });
  });
});

describe("public reads", () => {
  it("lists public posts newest first, by term, with a total", async () => {
    const tag = await createTerm(db, { taxonomy: "tag", name: "Rust", slug: "" });
    if (!tag.ok) throw new Error("term");
    const old = await entry("post", "Old", { tagIds: [tag.term.id] });
    await publish(old.id, new Date("2026-01-01T00:00:00Z"));
    const recent = await entry("post", "Recent");
    await publish(recent.id, new Date("2026-02-01T00:00:00Z"));
    await entry("post", "Draft");

    const all = await listPublicPosts(db, { page: 1, perPage: 10, termId: null });
    expect(all.total).toBe(2);
    expect(all.rows.map((row) => row.title)).toEqual(["Recent", "Old"]);
    const tagged = await listPublicPosts(db, { page: 1, perPage: 10, termId: tag.term.id });
    expect(tagged.rows.map((row) => row.title)).toEqual(["Old"]);
    expect((await listArchiveTerms(db)).map((term) => term.slug)).toEqual(["rust"]);
  });

  it("reads an entry with its author and terms, and previews drafts only by path", async () => {
    const cat = await createTerm(db, { taxonomy: "category", name: "News", slug: "" });
    if (!cat.ok) throw new Error("term");
    const post = await entry("post", "Hello", { categoryIds: [cat.term.id] });
    expect(await getPublicEntry(db, post.id)).toBeUndefined();
    expect(await getEntryForPreview(db, post.path)).toMatchObject({ title: "Hello" });
    expect(await getEntryForCanvas(db, post.id)).toMatchObject({ title: "Hello", status: "draft" });
    await publish(post.id);
    expect(await getPublicEntry(db, post.id)).toMatchObject({
      authorName: "Ada",
      terms: [{ slug: "news", taxonomy: "category" }],
    });
    expect((await listSitemapEntries(db)).map((row) => row.path)).toEqual(["/blog/hello"]);
  });
});

describe("menus", () => {
  it("resolves links and marks the ones that can't be followed", async () => {
    const about = await entry("page", "About");
    await publish(about.id);
    const draft = await entry("page", "Draft");
    const tag = await createTerm(db, { taxonomy: "tag", name: "Rust", slug: "" });
    if (!tag.ok) throw new Error("term");
    const saved = await saveMenu(db, "primary", [
      { id: "item-about", label: "About", kind: "entry", entryId: about.id },
      {
        id: "item-more",
        label: "More",
        kind: "group",
        children: [
          { id: "item-draft", label: "Draft", kind: "entry", entryId: draft.id },
          { id: "item-rust", label: "Rust", kind: "term", termId: tag.term.id },
          {
            id: "item-ext",
            label: "Docs",
            kind: "url",
            url: "https://example.org",
            openInNewTab: true,
          },
        ],
      },
    ]);
    expect(saved).toEqual({ ok: true });

    const resolved = await resolveMenu(db, await getMenu(db, "primary"));
    expect(resolved[0]).toMatchObject({ href: "/about", problem: null });
    expect(resolved[1]?.children.map((child) => [child.href, child.problem])).toEqual([
      [null, "unpublished"],
      ["/blog/tag/rust", null],
      ["https://example.org", null],
    ]);
    expect(resolved[1]?.children[2]?.openInNewTab).toBe(true);
  });

  it("refuses a menu three levels deep", async () => {
    const result = await saveMenu(db, "footer", [
      {
        id: "item-group",
        label: "Group",
        kind: "group",
        children: [
          {
            id: "item-child",
            label: "Child",
            kind: "url",
            url: "/x",
            children: [{ id: "item-deep", label: "Deep", kind: "url", url: "/y" }],
          },
        ],
      },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("saveReadingSettings", () => {
  it("moves every post to a new posts path, with redirects for the public ones", async () => {
    const live = await entry("post", "Live");
    await publish(live.id);
    const draft = await entry("post", "Draft");
    expect(await countPosts(db)).toBe(2);

    const result = await saveReadingSettings(db, {
      homepageEntryId: null,
      postsPerPage: 5,
      postsPath: "/news",
    });
    expect(result).toEqual({ ok: true, moved: 2 });
    expect(await resolveRoute(db, "/news/live")).toEqual({ kind: "entry", id: live.id });
    expect(await resolveRoute(db, "/blog/live")).toEqual({
      kind: "redirect",
      to: "/news/live",
      status: 301,
    });
    expect(await resolveRoute(db, "/blog/draft")).toEqual({ kind: "missing" });
    expect((await getEntryForPreview(db, "/news/draft"))?.id).toBe(draft.id);

    // And back: no loops, the redirects point the new way.
    await saveReadingSettings(db, { homepageEntryId: null, postsPerPage: 5, postsPath: "/blog" });
    expect(await resolveRoute(db, "/blog/live")).toEqual({ kind: "entry", id: live.id });
    expect(await resolveRoute(db, "/news/live")).toEqual({
      kind: "redirect",
      to: "/blog/live",
      status: 301,
    });
  });

  it("refuses a posts path a page already has, and a home page that isn't published", async () => {
    const news = await entry("page", "News");
    expect(
      await saveReadingSettings(db, { homepageEntryId: null, postsPerPage: 5, postsPath: "/news" }),
    ).toEqual({ ok: false, error: "posts-path-taken" });
    expect(
      await saveReadingSettings(db, {
        homepageEntryId: news.id,
        postsPerPage: 5,
        postsPath: "/blog",
      }),
    ).toEqual({ ok: false, error: "invalid-homepage" });
    await publish(news.id);
    expect(
      await saveReadingSettings(db, {
        homepageEntryId: news.id,
        postsPerPage: 5,
        postsPath: "/blog",
      }),
    ).toEqual({ ok: true, moved: 0 });
  });
});

describe("dashboard", () => {
  it("counts what the viewer may see, and lists the latest changes first", async () => {
    const { dashboardCounts, recentEntries } = await import("./dashboard");
    const page = await entry("page", "About");
    await publish(page.id);
    await entry("post", "Draft post");
    const all = await dashboardCounts(db, { pages: true, ownerId: null });
    expect(all).toMatchObject({ published: { page: 1, post: 0 }, drafts: 1, scheduled: 0 });
    const postsOnly = await dashboardCounts(db, { pages: false, ownerId: null });
    expect(postsOnly.published.page).toBe(0);
    const someoneElse = await dashboardCounts(db, { pages: true, ownerId: "nobody" });
    expect(someoneElse.drafts).toBe(0);
    const recent = await recentEntries(db, { pages: true, ownerId: null });
    // The draft was written after About was published.
    expect(recent.map((row) => row.title)).toEqual(["Draft post", "About"]);
    expect(recent[0]?.authorName).toBe("Ada");
  });
});

describe("site search", () => {
  const block = (type: string, props: Record<string, unknown>) => ({
    id: `b-${Math.random().toString(36).slice(2, 12)}`,
    type,
    props,
  });

  it("turns what's typed into word beginnings, and nothing else", () => {
    expect(searchTerms("  Sourdough   BREAD ")).toBe("sourdough:* & bread:*");
    expect(searchTerms("rye & (wheat) | !spelt:*")).toBe("rye:* & wheat:* & spelt:*");
    expect(searchTerms("café")).toBe("café:*");
    expect(searchTerms("!!! ---")).toBeNull();
    expect(searchTerms("a b c d e f g h i j")?.split(" & ")).toHaveLength(8);
  });

  it("finds public pages and posts by their words, the title first, never drafts", async () => {
    const titled = await entry("page", "Sourdough classes", {
      content: [block("heading", { text: "Learn to bake", level: 2 })],
    });
    const mentioned = await entry("post", "Our week", {
      content: [block("rich-text", { html: "<p>We baked <strong>sourdough</strong> rolls.</p>" })],
    });
    await entry("post", "A draft about sourdough");
    await publish(titled.id);
    await publish(mentioned.id);

    const found = await searchPublic(db, { text: "sourd", page: 1, perPage: 10 });
    expect(found.total).toBe(2);
    expect(found.rows.map((row) => row.title)).toEqual(["Sourdough classes", "Our week"]);
    expect((await searchPublic(db, { text: "learn bake", page: 1, perPage: 10 })).total).toBe(1);
  });

  it("doesn't match ids, addresses or settings", async () => {
    const page = await entry("page", "Plain", {
      content: [
        block("section", { background: "muted", width: "wide" }),
        block("button", { label: "Go", href: { kind: "url", url: "https://example.com/grid" } }),
      ],
    });
    await publish(page.id);
    for (const text of ["muted", "wide", "grid", "example"]) {
      expect((await searchPublic(db, { text, page: 1, perPage: 10 })).total).toBe(0);
    }
    expect((await searchPublic(db, { text: "go", page: 1, perPage: 10 })).total).toBe(1);
  });

  it("answers /search while search is on", async () => {
    expect(await resolveRoute(db, "/search")).toEqual({ kind: "search" });
    await upsertSettings(db, "reading", {
      homepageEntryId: null,
      postsPerPage: 10,
      postsPath: "/blog",
      search: false,
    });
    expect(await resolveRoute(db, "/search")).toEqual({ kind: "missing" });
  });
});
