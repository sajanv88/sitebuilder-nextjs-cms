// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { entries } from "../schema/entries";
import { createTestDb } from "../testing/pglite";
import {
  aiSourceRef,
  aiUsage,
  createAiBatch,
  deleteOldAiRuns,
  discardAiBatch,
  finishAiBatch,
  getAiBatch,
  listAiBatchEntries,
  recordAiRun,
  startOfUtcDay,
} from "./ai";
import { bootstrapSite } from "./bootstrap";
import { createEntry } from "./entries";
import { getMenu, saveMenu } from "./menus";
import { getReading } from "./public";
import { getSettings } from "./settings";

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

const run = (kind: string, extra: Partial<Parameters<typeof recordAiRun>[1]> = {}) =>
  recordAiRun(db, {
    kind,
    userId: adminId,
    model: "m",
    inputTokens: 100,
    outputTokens: 50,
    ...extra,
  });

async function writePage(batchId: string, ref: string) {
  const id = randomUUID();
  const created = await createEntry(db, {
    id,
    sourceRef: aiSourceRef(batchId, ref),
    type: "page",
    title: ref,
    slug: ref,
    excerpt: null,
    seoTitle: null,
    seoDescription: null,
    content: [],
    parentId: null,
    featuredMediaId: null,
    categoryIds: [],
    tagIds: [],
    authorId: adminId,
    actorId: adminId,
  });
  if (!created.ok) throw new Error(created.error);
  return id;
}

describe("usage", () => {
  it("counts today's batches per user and today's tokens for the site", async () => {
    const now = new Date("2026-10-24T15:00:00Z");
    const one = randomUUID();
    const two = randomUUID();
    await run("plan", { batchId: one, createdAt: now });
    await run("page", { batchId: one, createdAt: now });
    await run("plan", { batchId: two, createdAt: now });
    await run("plan", { batchId: randomUUID(), createdAt: new Date("2026-10-23T23:59:00Z") });
    await run("seo", { createdAt: new Date(now.getTime() - 30 * 60_000) });
    const usage = await aiUsage(db, adminId, now);
    expect(usage).toEqual({ batchesToday: 2, tokensToday: 600, helpLastHour: 1 });
  });

  it("starts each day at midnight UTC", () => {
    expect(startOfUtcDay(new Date("2026-10-24T01:30:00+05:00")).toISOString()).toBe(
      "2026-10-23T00:00:00.000Z",
    );
  });

  it("removes rows past the retention", async () => {
    await run("plan", { createdAt: new Date("2026-01-01T00:00:00Z") });
    await run("plan");
    expect(await deleteOldAiRuns(db, new Date("2026-06-01T00:00:00Z"))).toBe(1);
  });
});

describe("a batch", () => {
  it("lists the pages it wrote", async () => {
    const batchId = await createAiBatch(db, adminId);
    await writePage(batchId, "home");
    await writePage(batchId, "about");
    await writePage(await createAiBatch(db, adminId), "other");
    const listed = await listAiBatchEntries(db, batchId);
    expect(listed.map((e) => [e.ref, e.status, e.edited])).toEqual([
      ["home", "draft", false],
      ["about", "draft", false],
    ]);
  });

  it("finishes once, keeping what it replaced, and discarding puts it back", async () => {
    const batchId = await createAiBatch(db, adminId);
    const home = await writePage(batchId, "home");
    await saveMenu(db, "primary", [{ id: "item-000001", label: "Old", kind: "url", url: "/old" }]);
    const before = { reading: await getReading(db), site: await getSettings(db, "site") };

    const menus = {
      primary: [{ id: "item-000002", label: "Home", kind: "entry" as const, entryId: home }],
      footer: [],
    };
    expect(
      await finishAiBatch(db, {
        batchId,
        menus,
        homepageEntryId: home,
        site: { title: "Bakery", tagline: "Bread" },
      }),
    ).toEqual({ ok: true });
    expect((await getMenu(db, "primary"))[0]?.label).toBe("Home");
    expect((await getReading(db)).homepageEntryId).toBe(home);
    expect((await getSettings(db, "site"))?.title).toBe("Bakery");
    expect(await finishAiBatch(db, { batchId })).toEqual({ ok: false, error: "finished" });

    const discarded = await discardAiBatch(db, batchId, false);
    expect(discarded).toMatchObject({ ok: true, trashed: 1, kept: [] });
    expect((await getMenu(db, "primary"))[0]?.label).toBe("Old");
    expect((await getReading(db)).homepageEntryId).toBe(before.reading.homepageEntryId);
    expect((await getSettings(db, "site"))?.title).toBe(before.site?.title);
    expect((await getAiBatch(db, batchId))?.discardedAt).not.toBeNull();
    expect(await discardAiBatch(db, batchId, false)).toEqual({ ok: false, error: "discarded" });
  });

  it("keeps pages a person has changed, unless asked to include them", async () => {
    const batchId = await createAiBatch(db, adminId);
    await writePage(batchId, "home");
    const edited = await writePage(batchId, "about");
    await db
      .update(entries)
      .set({ updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(entries.id, edited));
    const kept = await discardAiBatch(db, batchId, false);
    expect(kept).toMatchObject({ ok: true, trashed: 1 });
    expect(kept.ok && kept.kept.map((e) => e.ref)).toEqual(["about"]);

    const second = await createAiBatch(db, adminId);
    await writePage(second, "x");
    const changed = await writePage(second, "y");
    await db
      .update(entries)
      .set({ updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(entries.id, changed));
    expect(await discardAiBatch(db, second, true)).toMatchObject({ ok: true, trashed: 2 });
  });

  it("refuses an unknown batch", async () => {
    expect(await finishAiBatch(db, { batchId: randomUUID() })).toEqual({
      ok: false,
      error: "not-found",
    });
  });
});
