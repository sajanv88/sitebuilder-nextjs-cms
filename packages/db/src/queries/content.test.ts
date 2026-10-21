import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { entries, type NewEntry } from "../schema/entries";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import { getPublicEntryByPath } from "./entries";
import { ensureMenus } from "./menus";
import { getSettings, upsertSettings } from "./settings";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

describe("content tables and queries", () => {
  let db: TestDb;
  let authorId: string;
  const page = (overrides: Partial<NewEntry>): NewEntry => ({
    type: "page",
    title: "About",
    slug: "about",
    path: "/about",
    content: [],
    authorId,
    ...overrides,
  });

  beforeAll(async () => {
    db = await createTestDb();
    const result = await bootstrapSite(db, {
      name: "Ada",
      email: "ada@example.com",
      passwordHash: "x",
      siteUrl: "https://example.com",
      allowExistingUsers: false,
    });
    if (!result.ok) throw new Error("setup failed");
    authorId = result.userId;
  });

  it("getPublicEntryByPath applies the visibility rule", async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3_600_000);
    await db.insert(entries).values([
      page({ path: "/live", slug: "live", status: "published", publishedAt: past }),
      page({ path: "/draft", slug: "draft", status: "draft" }),
      page({ path: "/later", slug: "later", status: "published", publishedAt: future }),
      page({
        path: "/binned",
        slug: "binned",
        status: "published",
        publishedAt: past,
        deletedAt: past,
      }),
    ]);

    expect(await getPublicEntryByPath(db, "/live")).toMatchObject({ slug: "live" });
    expect(await getPublicEntryByPath(db, "/draft")).toBeUndefined();
    expect(await getPublicEntryByPath(db, "/later")).toBeUndefined();
    expect(await getPublicEntryByPath(db, "/binned")).toBeUndefined();
    expect(await getPublicEntryByPath(db, "/missing")).toBeUndefined();
  });

  it("a path is unique among live entries, and a trashed entry frees it", async () => {
    const [first] = await db
      .insert(entries)
      .values(page({ path: "/team" }))
      .returning();
    await expect(db.insert(entries).values(page({ path: "/team" }))).rejects.toThrow();

    await db
      .update(entries)
      .set({ deletedAt: new Date() })
      .where(eq(entries.id, first?.id ?? ""));
    await expect(db.insert(entries).values(page({ path: "/team" }))).resolves.toBeDefined();
  });

  it("a page with children can't be deleted", async () => {
    const [parent] = await db
      .insert(entries)
      .values(page({ path: "/docs", slug: "docs" }))
      .returning();
    const parentId = parent?.id ?? "";
    await db.insert(entries).values(page({ path: "/docs/start", slug: "start", parentId }));
    await expect(db.delete(entries).where(eq(entries.id, parentId))).rejects.toThrow();

    const children = await db.query.entries.findFirst({
      where: { id: parentId },
      with: { children: true },
    });
    expect(children?.children.map((child) => child.path)).toEqual(["/docs/start"]);
  });

  it("upsertSettings validates and replaces the value", async () => {
    const bad = await upsertSettings(db, "reading", {
      homepageEntryId: null,
      postsPerPage: 0,
      postsPath: "/blog",
    });
    expect(bad.ok).toBe(false);

    const good = await upsertSettings(db, "reading", {
      homepageEntryId: null,
      postsPerPage: 5,
      postsPath: "/news",
    });
    expect(good).toEqual({ ok: true });
    expect(await getSettings(db, "reading")).toEqual({
      homepageEntryId: null,
      postsPerPage: 5,
      postsPath: "/news",
    });
  });

  it("ensureMenus is idempotent", async () => {
    await ensureMenus(db);
    await ensureMenus(db);
    expect(await db.query.menus.findMany()).toHaveLength(2);
  });

  it("works inside a transaction (the executor can be tx)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await upsertSettings(tx, "theme", {
          preset: "ink",
          mode: "dark",
          density: "compact",
          tokens: {},
        });
        tx.rollback();
      }),
    ).rejects.toThrow();
    expect((await getSettings(db, "theme"))?.preset).toBe("default");
  });
});
