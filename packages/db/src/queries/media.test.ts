import type { BlockList, MediaListQuery } from "@sitebuilder/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import {
  autosaveEntry,
  createEntry,
  type EntryWrite,
  getEntryForEdit,
  getEntryLinks,
  listLatestPosts,
  searchEntryLinks,
  setEntryStatus,
  trashEntry,
  updateEntry,
} from "./entries";
import {
  countMediaByStorage,
  createMedia,
  deleteMedia,
  getMedia,
  getMediaByKey,
  getMediaForRender,
  listMedia,
  mediaFolders,
  mediaUsage,
  type NewMediaInput,
  updateMediaAlt,
} from "./media";
import { listRevisions } from "./revisions";
import { deleteSettings, getSettings, upsertSettings } from "./settings";
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

let n = 0;
const file = (overrides: Partial<NewMediaInput> = {}): NewMediaInput => {
  n += 1;
  return {
    filename: `photo-${n}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 1000 + n,
    width: 800,
    height: 600,
    alt: null,
    storageKey: `2026/10/00000000-0000-4000-8000-${String(n).padStart(12, "0")}-photo-${n}.jpg`,
    storage: "local",
    uploadedBy: adminId,
    ...overrides,
  };
};

const query = (overrides: Partial<MediaListQuery> = {}): MediaListQuery => ({
  kind: "all",
  page: 1,
  size: 20,
  q: "",
  month: "",
  view: "grid",
  ...overrides,
});

const fields = (overrides: Partial<EntryWrite> = {}): EntryWrite => ({
  title: "Landing",
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

async function page(content: BlockList, extra: Partial<EntryWrite> = {}) {
  const created = await createEntry(db, {
    ...fields({ content, ...extra }),
    type: "page",
    authorId: adminId,
    actorId: adminId,
  });
  if (!created.ok) throw new Error(created.error);
  return created;
}

describe("media rows", () => {
  it("lists, filters by kind and searches name and alt", async () => {
    const photo = await createMedia(db, file({ filename: "beach.jpg", alt: "Sunset" }));
    await createMedia(db, file({ filename: "intro.mp4", mimeType: "video/mp4" }));
    await createMedia(db, file({ filename: "menu.pdf", mimeType: "application/pdf" }));

    const all = await listMedia(db, { ...query(), uploadedBy: null });
    expect(all.total).toBe(3);
    // Inserted within the same millisecond, so compared as a set.
    expect(all.rows.map((row) => row.filename).sort()).toEqual([
      "beach.jpg",
      "intro.mp4",
      "menu.pdf",
    ]);
    expect(all.rows[0]?.uploadedBy).toEqual({ id: adminId, name: "Ada" });

    expect((await listMedia(db, { ...query({ kind: "video" }), uploadedBy: null })).total).toBe(1);
    expect((await listMedia(db, { ...query({ q: "sunset" }), uploadedBy: null })).rows[0]?.id).toBe(
      photo.id,
    );
    // LIKE wildcards in the search are text.
    expect((await listMedia(db, { ...query({ q: "%" }), uploadedBy: null })).total).toBe(0);
    expect((await listMedia(db, { ...query(), uploadedBy: "someone-else" })).total).toBe(0);
  });

  it("files by kind and by month, and lists one month", async () => {
    await createMedia(db, file({ filename: "a.jpg" }));
    await createMedia(db, file({ filename: "b.pdf", mimeType: "application/pdf" }));
    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const folders = await mediaFolders(db, null);
    expect(folders).toEqual({
      all: 2,
      kinds: { image: 1, video: 0, document: 1 },
      months: [{ month: thisMonth, count: 2 }],
    });
    expect((await mediaFolders(db, "someone-else")).all).toBe(0);
    expect((await listMedia(db, { ...query({ month: thisMonth }), uploadedBy: null })).total).toBe(
      2,
    );
    expect((await listMedia(db, { ...query({ month: "2001-01" }), uploadedBy: null })).total).toBe(
      0,
    );
  });

  it("reads by id and by key, edits alt text, and counts by storage", async () => {
    const created = await createMedia(db, file({ storage: "s3" }));
    await createMedia(db, file());
    const row = await getMedia(db, created.id);
    expect(row).toMatchObject({ mimeType: "image/jpeg", storage: "s3", alt: null });
    if (!row) return;
    expect(await getMediaByKey(db, row.storageKey)).toMatchObject({ storage: "s3" });
    expect(await getMediaByKey(db, "2026/10/nope")).toBeUndefined();

    expect(await updateMediaAlt(db, created.id, "A beach")).toEqual({ ok: true });
    expect((await getMedia(db, created.id))?.alt).toBe("A beach");
    // Empty marks the image decorative.
    await updateMediaAlt(db, created.id, "");
    expect((await getMedia(db, created.id))?.alt).toBeNull();
    expect(await updateMediaAlt(db, "00000000-0000-4000-8000-000000000000", "x")).toEqual({
      ok: false,
      error: "not-found",
    });

    expect(await countMediaByStorage(db)).toEqual({ local: 1, s3: 1 });
    const render = await getMediaForRender(db, [created.id, created.id]);
    expect([...render.keys()]).toEqual([created.id]);
  });
});

describe("where a file is used", () => {
  it("finds featured images and media in nested blocks, trashed entries included", async () => {
    const hero = await createMedia(db, file());
    const gallery = await createMedia(db, file());
    const poster = await createMedia(db, file());
    const unused = await createMedia(db, file());

    await page([], { title: "Featured", featuredMediaId: hero.id });
    await page([
      {
        id: "columns-0001",
        type: "columns",
        props: {},
        children: [
          {
            id: "column-00001",
            type: "column",
            props: {},
            children: [{ id: "gallery-0001", type: "gallery", props: { mediaIds: [gallery.id] } }],
          },
        ],
      },
    ]);
    const trashed = await page(
      [
        {
          id: "video-000001",
          type: "video",
          props: { mediaId: hero.id, posterMediaId: poster.id },
        },
      ],
      { title: "Old video" },
    );
    await trashEntry(db, trashed.id);

    expect((await mediaUsage(db, hero.id)).map((use) => use.title)).toEqual([
      "Featured",
      "Old video",
    ]);
    expect(await mediaUsage(db, gallery.id)).toHaveLength(1);
    expect(await mediaUsage(db, poster.id)).toEqual([
      expect.objectContaining({ title: "Old video", inTrash: true }),
    ]);
    expect(await mediaUsage(db, unused.id)).toEqual([]);
  });

  it("deleting is refused while used, and hands back the key once deleted", async () => {
    const used = await createMedia(db, file());
    const free = await createMedia(db, file({ storage: "s3" }));
    await page([{ id: "image-000001", type: "image", props: { mediaId: used.id } }]);

    expect(await deleteMedia(db, used.id)).toMatchObject({
      ok: false,
      error: "in-use",
      usedIn: [expect.objectContaining({ title: "Landing" })],
    });
    const deleted = await deleteMedia(db, free.id);
    expect(deleted).toMatchObject({ ok: true, storage: "s3" });
    expect(await getMedia(db, free.id)).toBeUndefined();
    expect(await deleteMedia(db, free.id)).toEqual({ ok: false, error: "not-found" });
  });
});

describe("content and the featured image on entries", () => {
  it("saves blocks and the featured image, and refuses a missing image", async () => {
    const image = await createMedia(db, file());
    const blocks: BlockList = [{ id: "heading-0001", type: "heading", props: { text: "Hi" } }];
    const created = await page(blocks, { featuredMediaId: image.id });
    const loaded = await getEntryForEdit(db, created.id);
    expect(loaded).toMatchObject({ content: blocks, featuredMediaId: image.id });

    const missing = await updateEntry(db, {
      ...fields({ featuredMediaId: "00000000-0000-4000-8000-000000000000" }),
      id: created.id,
      expectedUpdatedAt: created.updatedAt,
      authorId: null,
      actorId: adminId,
    });
    expect(missing).toEqual({ ok: false, error: "invalid-media" });

    // The first revision holds the blocks.
    const revision = await db.query.entryRevisions.findFirst({ where: { entryId: created.id } });
    expect(revision?.content).toEqual(blocks);
  });
});

describe("autosaveEntry", () => {
  it("saves a draft's title and blocks with the conflict check, and writes no revision", async () => {
    const created = await page([]);
    const blocks: BlockList = [{ id: "heading-0001", type: "heading", props: { text: "Draft" } }];
    const saved = await autosaveEntry(db, {
      id: created.id,
      expectedUpdatedAt: created.updatedAt,
      title: "Landing v2",
      content: blocks,
    });
    expect(saved.ok).toBe(true);
    expect(await getEntryForEdit(db, created.id)).toMatchObject({
      title: "Landing v2",
      content: blocks,
    });
    expect(await listRevisions(db, created.id)).toHaveLength(1);

    // The old updatedAt no longer matches.
    expect(
      await autosaveEntry(db, {
        id: created.id,
        expectedUpdatedAt: created.updatedAt,
        title: "x",
        content: [],
      }),
    ).toEqual({ ok: false, error: "conflict" });
  });

  it("leaves published entries alone", async () => {
    const created = await page([]);
    const published = await setEntryStatus(db, {
      id: created.id,
      change: { kind: "publish", at: null },
      expectedUpdatedAt: null,
      actorId: adminId,
      writeRevision: true,
    });
    if (!published.ok) throw new Error("publish");
    expect(
      await autosaveEntry(db, {
        id: created.id,
        expectedUpdatedAt: published.updatedAt,
        title: "Live edit",
        content: [],
      }),
    ).toEqual({ ok: false, error: "not-draft" });
  });

  it("a draft created by autosave has no revision", async () => {
    const created = await createEntry(db, {
      ...fields(),
      type: "page",
      authorId: adminId,
      actorId: adminId,
      writeRevision: false,
    });
    if (!created.ok) throw new Error(created.error);
    expect(await listRevisions(db, created.id)).toEqual([]);
  });
});

describe("media storage settings", () => {
  it("has no row until an admin saves one", async () => {
    expect(await getSettings(db, "media")).toBeUndefined();
    const s3 = {
      driver: "s3",
      endpoint: "https://minio.example.ts.net",
      region: "us-east-1",
      bucket: "site-media",
      accessKeyId: "AKIDEXAMPLE",
      secret: { iv: "aXY", tag: "dGFn", data: "ZGF0YQ" },
      pathStyle: true,
    };
    expect(await upsertSettings(db, "media", s3)).toEqual({ ok: true });
    expect(await getSettings(db, "media")).toEqual(s3);
    expect((await upsertSettings(db, "media", { ...s3, secret: "plain" })).ok).toBe(false);
    await deleteSettings(db, "media");
    expect(await getSettings(db, "media")).toBeUndefined();
  });
});

describe("entries for blocks", () => {
  it("links know their current path and whether visitors can open them", async () => {
    const draft = await page([], { title: "Draft page" });
    const live = await page([], { title: "Live page" });
    await setEntryStatus(db, {
      id: live.id,
      change: { kind: "publish", at: null },
      expectedUpdatedAt: null,
      actorId: adminId,
      writeRevision: true,
    });
    const links = await getEntryLinks(db, [draft.id, live.id]);
    expect(links.get(draft.id)).toMatchObject({ path: "/draft-page", public: false });
    expect(links.get(live.id)).toMatchObject({ path: "/live-page", public: true });

    await trashEntry(db, draft.id);
    expect((await searchEntryLinks(db, "page")).map((link) => link.title)).toEqual(["Live page"]);
  });

  it("latest posts are public posts, newest first, with their terms", async () => {
    const news = await createTerm(db, { taxonomy: "category", name: "News", slug: "" });
    if (!news.ok) throw new Error("term");
    const post = async (title: string, publish: boolean) => {
      const created = await createEntry(db, {
        ...fields({ title, categoryIds: [news.term.id] }),
        type: "post",
        authorId: adminId,
        actorId: adminId,
      });
      if (!created.ok) throw new Error(created.error);
      if (publish) {
        await setEntryStatus(db, {
          id: created.id,
          change: { kind: "publish", at: null },
          expectedUpdatedAt: null,
          actorId: adminId,
          writeRevision: true,
        });
      }
    };
    await post("Hidden draft", false);
    await post("First news", true);
    const latest = await listLatestPosts(db);
    expect(latest.map((card) => card.title)).toEqual(["First news"]);
    expect(latest[0]?.termIds).toEqual([news.term.id]);
  });
});
