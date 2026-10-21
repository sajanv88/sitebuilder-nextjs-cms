// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { entries } from "../schema/entries";
import { cacheTags } from "../schema/site";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import { createEntry } from "./entries";
import { publishDueEntries } from "./scheduled";

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

const minute = 60_000;

// A post in the given state, written directly: the publish action itself is setEntryStatus's.
async function post(
  title: string,
  state: { status: "draft" | "scheduled" | "published"; at: Date | null; trashed?: boolean },
) {
  const created = await createEntry(db, {
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
    type: "post",
    authorId: adminId,
    actorId: adminId,
  });
  if (!created.ok) throw new Error(created.error);
  const [row] = await db
    .update(entries)
    .set({
      status: state.status,
      publishedAt: state.at,
      deletedAt: state.trashed ? new Date() : null,
    })
    .where(eq(entries.id, created.id))
    .returning({ id: entries.id, updatedAt: entries.updatedAt });
  if (!row) throw new Error("missing");
  return row;
}

const statusOf = async (id: string) =>
  (await db.select({ status: entries.status }).from(entries).where(eq(entries.id, id)))[0]?.status;

describe("publishDueEntries", () => {
  it("publishes scheduled posts whose time has come, and only those", async () => {
    const now = new Date();
    const due = await post("Due", { status: "scheduled", at: new Date(now.getTime() - minute) });
    const later = await post("Later", {
      status: "scheduled",
      at: new Date(now.getTime() + minute),
    });
    const trashed = await post("Trashed", {
      status: "scheduled",
      at: new Date(now.getTime() - minute),
      trashed: true,
    });
    const draft = await post("Draft", { status: "draft", at: new Date(now.getTime() - minute) });

    expect(await publishDueEntries(db, now)).toEqual([due.id]);
    expect(await statusOf(due.id)).toBe("published");
    expect(await statusOf(later.id)).toBe("scheduled");
    expect(await statusOf(trashed.id)).toBe("scheduled");
    expect(await statusOf(draft.id)).toBe("draft");
  });

  it("drops the cached copies: the entry's tag and the lists'", async () => {
    const due = await post("Due", { status: "scheduled", at: new Date(Date.now() - minute) });
    await publishDueEntries(db);
    const tags = await db
      .select({ tag: cacheTags.tag, expireSeconds: cacheTags.expireSeconds })
      .from(cacheTags)
      .where(inArray(cacheTags.tag, ["entries", `entry:${due.id}`]));
    expect(tags).toHaveLength(2);
    expect(tags.every((tag) => tag.expireSeconds === null)).toBe(true);
  });

  it("writes no tags when nothing is due", async () => {
    await post("Later", { status: "scheduled", at: new Date(Date.now() + minute) });
    expect(await publishDueEntries(db)).toEqual([]);
    expect(await db.select().from(cacheTags)).toEqual([]);
  });

  it("keeps updatedAt, so an editor with the post open can still save", async () => {
    const due = await post("Due", { status: "scheduled", at: new Date(Date.now() - minute) });
    await publishDueEntries(db);
    const [row] = await db
      .select({ updatedAt: entries.updatedAt })
      .from(entries)
      .where(eq(entries.id, due.id));
    expect(row?.updatedAt).toEqual(due.updatedAt);
  });

  it("publishes each entry once when two run at the same time", async () => {
    const due = await post("Due", { status: "scheduled", at: new Date(Date.now() - minute) });
    const [first, second] = await Promise.all([publishDueEntries(db), publishDueEntries(db)]);
    expect([...(first ?? []), ...(second ?? [])]).toEqual([due.id]);
  });
});
