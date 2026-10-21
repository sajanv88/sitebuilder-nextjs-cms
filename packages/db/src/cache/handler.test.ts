import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/pglite";
import { type CacheEntry, type CacheHandler, createCacheHandler } from "./handler";
import { createTagStore, type TagStore } from "./tag-store";

function entry(text: string, tags: string[], timestamp: number): Promise<CacheEntry> {
  return Promise.resolve({
    value: new Response(text).body as ReadableStream<Uint8Array>,
    tags,
    stale: 30,
    timestamp,
    expire: 3600,
    revalidate: 900,
  });
}

async function read(handler: CacheHandler, key: string): Promise<string | undefined> {
  const found = await handler.get(key, []);
  return found ? new Response(found.value).text() : undefined;
}

describe("cache handler", () => {
  let store: TagStore;
  let clock: number;
  let site: CacheHandler;
  let admin: CacheHandler;

  beforeEach(async () => {
    store = createTagStore(await createTestDb());
    clock = 1_000_000;
    const options = { refreshIntervalMs: 0, now: () => clock, log: () => {} };
    // Two processes: an admin zone and a site zone, sharing only the database.
    site = createCacheHandler(store, options);
    admin = createCacheHandler(store, options);
    await site.refreshTags();
    await admin.refreshTags();
  });

  it("serves an entry until a tag it carries is invalidated by another process", async () => {
    await site.set("page", entry("v1", ["entry:1", "entries"], clock));
    clock += 10;
    await site.refreshTags();
    expect(await read(site, "page")).toBe("v1");

    await admin.updateTags(["entry:1"]);
    clock += 10;
    // Not until the site process has read the change.
    expect(await read(site, "page")).toBe("v1");
    await site.refreshTags();
    expect(await read(site, "page")).toBeUndefined();
  });

  it("keeps entries that don't carry the tag", async () => {
    await site.set("menu", entry("m", ["menu:primary"], clock));
    await admin.updateTags(["entry:1"]);
    clock += 10;
    await site.refreshTags();
    expect(await read(site, "menu")).toBe("m");
  });

  it("serves an entry made after the invalidation was read", async () => {
    await admin.updateTags(["entries"]);
    clock += 10;
    await site.refreshTags();
    await site.set("list", entry("fresh", ["entries"], clock));
    clock += 10;
    await site.refreshTags();
    expect(await read(site, "list")).toBe("fresh");
  });

  it("sees its own invalidation at once", async () => {
    await admin.set("settings", entry("s", ["settings"], clock));
    clock += 10;
    await admin.updateTags(["settings"]);
    expect(await read(admin, "settings")).toBeUndefined();
  });

  it("marks entries stale for a profile-based invalidation, and expires them later", async () => {
    await site.set("feed", entry("f", ["entries"], clock));
    clock += 10;
    await admin.updateTags(["entries"], { expire: 60 });
    await site.refreshTags();
    const stale = await site.get("feed", []);
    expect(stale?.revalidate).toBe(-1);
    clock += 61_000;
    expect(await read(site, "feed")).toBeUndefined();
  });

  it("ignores invalidations from before the process started", async () => {
    await admin.updateTags(["entry:2"]);
    const fresh = createCacheHandler(store, { refreshIntervalMs: 0, now: () => clock });
    await fresh.refreshTags();
    await fresh.set("page", entry("p", ["entry:2"], clock));
    clock += 10;
    await fresh.refreshTags();
    expect(await read(fresh, "page")).toBe("p");
  });

  it("drops the least recently used entries past its size", async () => {
    const small = createCacheHandler(store, { maxBytes: 20, refreshIntervalMs: 0 });
    await small.set("a", entry("aaaaaaaa", [], Date.now()));
    await small.set("b", entry("bbbbbbbb", [], Date.now()));
    await small.set("c", entry("cccccccc", [], Date.now()));
    expect(await read(small, "a")).toBeUndefined();
    expect(await read(small, "c")).toBe("cccccccc");
  });

  it("writes one row per tag however often it's invalidated", async () => {
    await admin.updateTags(["entries", "entries", "settings"]);
    await admin.updateTags(["entries"]);
    const changes = await store.changesSince(0);
    expect(changes.map((change) => change.tag).sort()).toEqual(["entries", "settings"]);
  });
});
