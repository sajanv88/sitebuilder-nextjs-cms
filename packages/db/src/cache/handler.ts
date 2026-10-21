import type { TagStore } from "./tag-store";

// A cache handler for "use cache" (Next's `cacheHandlers.default`, the CacheHandler interface in
// next/cache): entries in this process's memory, as Next's own default handler keeps them, and
// tag invalidations shared through Postgres (decisions #63). The types are written out here
// because this package doesn't depend on Next; they match next/cache's CacheEntry.

export interface CacheEntry {
  value: ReadableStream<Uint8Array>;
  tags: string[];
  stale: number;
  timestamp: number;
  expire: number;
  revalidate: number;
}

export interface CacheHandler {
  get(cacheKey: string, softTags: string[]): Promise<CacheEntry | undefined>;
  set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void>;
  refreshTags(): Promise<void>;
  getExpiration(tags: string[]): Promise<number>;
  updateTags(tags: string[], durations?: { expire?: number }): Promise<void>;
}

export interface CacheHandlerOptions {
  // Bytes of entries kept in memory before the least recently used go. Next's default is 50 MB.
  maxBytes?: number;
  // How often refreshTags() asks Postgres at most. Requests in between use what it last read.
  refreshIntervalMs?: number;
  // Changes are read again for this long after they were first seen, so a row that committed
  // a little after a later one isn't missed.
  overlapMs?: number;
  now?: () => number;
  log?: (message: string, error: unknown) => void;
}

// "Stale, never expired": about 68 years, the largest value the integer column holds.
const STALE_ONLY = 2_147_483_647;

interface Stored {
  meta: Omit<CacheEntry, "value">;
  value: Uint8Array;
}

// Times are this process's own clock. A change read from Postgres counts from when this
// process learned of it, so a difference between servers' clocks can't keep a stale entry.
interface TagTimes {
  stale?: number;
  expired?: number;
}

export function createCacheHandler(
  store: TagStore,
  options: CacheHandlerOptions = {},
): CacheHandler {
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
  const refreshIntervalMs = options.refreshIntervalMs ?? 500;
  const overlapMicros = (options.overlapMs ?? 5000) * 1000;
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? ((message, error) => console.error(`[cache] ${message}`, error));
  const dev = Boolean(process.env.__NEXT_DEV_SERVER);

  // A Map keeps insertion order: re-inserting on read makes the first key the least recent.
  const entries = new Map<string, Stored>();
  let bytes = 0;
  const pending = new Map<string, Promise<void>>();

  const tagTimes = new Map<string, TagTimes>();
  // The change time (database clock) last applied per tag, so a row read twice counts once.
  const applied = new Map<string, number>();
  let since: number | null = null;
  let lastRefresh = Number.NEGATIVE_INFINITY;
  let refreshing: Promise<void> | null = null;

  function remove(key: string): void {
    const stored = entries.get(key);
    if (!stored) return;
    entries.delete(key);
    bytes -= stored.value.byteLength + key.length;
  }

  function markTags(tags: readonly string[], expireSeconds: number | null, at: number): void {
    for (const tag of tags) {
      const times = { ...tagTimes.get(tag) };
      if (expireSeconds === null) {
        times.expired = at;
      } else {
        times.stale = at;
        times.expired = at + expireSeconds * 1000;
      }
      tagTimes.set(tag, times);
    }
  }

  async function readChanges(): Promise<void> {
    if (since === null) {
      // A new process has nothing cached yet, so earlier invalidations don't concern it. Those
      // inside the overlap window are recorded as seen, or the next read would apply them.
      const latest = await store.latest();
      for (const change of await store.changesSince(latest - overlapMicros)) {
        applied.set(change.tag, change.changedAt);
      }
      since = latest;
      return;
    }
    const changes = await store.changesSince(since - overlapMicros);
    const at = now();
    for (const change of changes) {
      if ((applied.get(change.tag) ?? 0) >= change.changedAt) continue;
      applied.set(change.tag, change.changedAt);
      markTags([change.tag], change.expireSeconds, at);
      if (change.changedAt > since) since = change.changedAt;
    }
  }

  return {
    async get(cacheKey) {
      const waiting = pending.get(cacheKey);
      if (waiting) await waiting;
      const stored = entries.get(cacheKey);
      if (!stored) return undefined;
      const { meta } = stored;
      // A negative expire marks an entry for removal (Next's dev-only tiered handler).
      if (meta.expire < 0) return undefined;
      // As Next's default handler: production drops an in-memory entry once it's due for
      // revalidation; the dev server keeps it until it expires, so reloads stay fast.
      const maxAge = dev ? meta.expire : meta.revalidate;
      if (now() > meta.timestamp + maxAge * 1000) {
        remove(cacheKey);
        return undefined;
      }
      let revalidate = meta.revalidate;
      for (const tag of meta.tags) {
        const times = tagTimes.get(tag);
        if (!times) continue;
        if (
          times.expired !== undefined &&
          times.expired <= now() &&
          times.expired > meta.timestamp
        ) {
          remove(cacheKey);
          return undefined;
        }
        if (times.stale !== undefined && times.stale > meta.timestamp) revalidate = -1;
      }
      // Most recently used goes to the end.
      entries.delete(cacheKey);
      entries.set(cacheKey, stored);
      const value = stored.value;
      return {
        ...meta,
        revalidate,
        value: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(value);
            controller.close();
          },
        }),
      };
    },

    async set(cacheKey, pendingEntry) {
      let done = () => {};
      pending.set(
        cacheKey,
        new Promise<void>((resolve) => {
          done = resolve;
        }),
      );
      try {
        const entry = await pendingEntry;
        // In production an entry with expire 0 is regenerated on every read, so keeping it
        // would only cost memory.
        if (!dev && entry.expire === 0) return;
        const value = new Uint8Array(await new Response(entry.value).arrayBuffer());
        const { value: _stream, ...meta } = entry;
        remove(cacheKey);
        const size = value.byteLength + cacheKey.length;
        if (size > maxBytes) return;
        entries.set(cacheKey, { meta, value });
        bytes += size;
        for (const key of entries.keys()) {
          if (bytes <= maxBytes) break;
          remove(key);
        }
      } catch (error) {
        // A value that failed while rendering isn't kept: an incomplete page is worse than a miss.
        remove(cacheKey);
        log("couldn't store an entry", error);
      } finally {
        pending.delete(cacheKey);
        done();
      }
    },

    async refreshTags() {
      if (refreshing) return refreshing;
      if (now() - lastRefresh < refreshIntervalMs) return;
      refreshing = readChanges()
        .catch((error: unknown) => {
          // Serving from memory beats failing the page; the next request asks again.
          log("couldn't read tag changes", error);
        })
        .finally(() => {
          lastRefresh = now();
          refreshing = null;
        });
      return refreshing;
    },

    async getExpiration(tags) {
      let latest = 0;
      for (const tag of tags) {
        const expired = tagTimes.get(tag)?.expired ?? 0;
        if (expired > latest) latest = expired;
      }
      return latest;
    },

    async updateTags(tags, durations) {
      // No durations: expire now (updateTag). Durations: stale now, expired after `expire`
      // seconds; without one, stale only, which the longest int stands in for.
      const expireSeconds = durations ? (durations.expire ?? STALE_ONLY) : null;
      // This process sees its own change at once: an action's next read misses.
      markTags(tags, expireSeconds, now());
      try {
        const written = await store.write(tags, expireSeconds);
        for (const change of written) {
          applied.set(change.tag, change.changedAt);
        }
      } catch (error) {
        log("couldn't share a tag invalidation", error);
        throw error;
      }
    },
  };
}
