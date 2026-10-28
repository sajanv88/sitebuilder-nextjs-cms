// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { RedirectInput } from "@sitebuilder/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import { createEntry } from "./entries";
import { resolveRoute } from "./public";
import { deleteRedirect, listRedirects, saveRedirect } from "./redirects";

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

const redirect = (from: string, to: string, status: 301 | 302 | 307 | 308 = 301, original = "") =>
  ({ original, from, to, status }) satisfies RedirectInput;

describe("redirects by hand", () => {
  it("are added, changed, listed and removed", async () => {
    expect(await saveRedirect(db, redirect("/old", "/new"))).toEqual({ ok: true });
    expect(await resolveRoute(db, "/old")).toEqual({ kind: "redirect", to: "/new", status: 301 });
    // Changed: its address too.
    expect(await saveRedirect(db, redirect("/older", "/new", 302, "/old"))).toEqual({ ok: true });
    expect((await listRedirects(db)).map((r) => [r.fromPath, r.status])).toEqual([["/older", 302]]);
    expect(await resolveRoute(db, "/old")).toEqual({ kind: "missing" });
    expect(await deleteRedirect(db, "/older")).toBe(true);
    expect(await listRedirects(db)).toEqual([]);
  });

  it("cover everything under a path with /*, the closest first, after exact ones", async () => {
    await saveRedirect(db, redirect("/shop/*", "https://shop.example.com"));
    await saveRedirect(db, redirect("/docs/*", "/help/*"));
    await saveRedirect(db, redirect("/docs/v1/*", "/archive/v1/*", 308));
    await saveRedirect(db, redirect("/docs/start", "/help/getting-started"));
    expect(await resolveRoute(db, "/shop/hats/red")).toEqual({
      kind: "redirect",
      to: "https://shop.example.com",
      status: 301,
    });
    expect(await resolveRoute(db, "/docs/install")).toMatchObject({ to: "/help/install" });
    expect(await resolveRoute(db, "/docs/v1/install")).toEqual({
      kind: "redirect",
      to: "/archive/v1/install",
      status: 308,
    });
    expect(await resolveRoute(db, "/docs/start")).toMatchObject({ to: "/help/getting-started" });
    expect(await resolveRoute(db, "/docsy")).toEqual({ kind: "missing" });
  });

  it("refuse an address a page holds, one already used, and two that loop", async () => {
    await createEntry(db, {
      title: "About",
      content: [],
      featuredMediaId: null,
      slug: "",
      excerpt: null,
      seoTitle: null,
      seoDescription: null,
      parentId: null,
      categoryIds: [],
      tagIds: [],
      type: "page",
      authorId: adminId,
      actorId: adminId,
    });
    expect(await saveRedirect(db, redirect("/about", "/x"))).toEqual({
      ok: false,
      error: "entry-there",
    });
    await saveRedirect(db, redirect("/a", "/b"));
    expect(await saveRedirect(db, redirect("/a", "/c"))).toEqual({ ok: false, error: "taken" });
    expect(await saveRedirect(db, redirect("/b", "/a"))).toEqual({ ok: false, error: "loop" });
    await saveRedirect(db, redirect("/old/*", "/new/*"));
    expect(await saveRedirect(db, redirect("/new/x", "/old/x"))).toEqual({
      ok: false,
      error: "loop",
    });
    expect(await saveRedirect(db, redirect("/z", "/y", 301, "/gone"))).toEqual({
      ok: false,
      error: "not-found",
    });
  });
});
