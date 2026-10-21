import { gt, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { cacheTags } from "../schema/site";

// The shared half of the cache handler: when each tag was last invalidated, in Postgres, so an
// updateTag() in the admin zone reaches every site process (decisions #63).

export interface TagChange {
  tag: string;
  // Null: expired at once. Set: stale, then expired after this many seconds.
  expireSeconds: number | null;
  // The database's clock when the row was written, in microseconds. Only compared with other
  // values from the same clock, never with a process's own time.
  changedAt: number;
}

export interface TagStore {
  write(tags: readonly string[], expireSeconds: number | null): Promise<TagChange[]>;
  // The latest change time in the table, or 0. Where a new process starts reading from.
  latest(): Promise<number>;
  // Rows changed after `since` (microseconds, the database's clock).
  changesSince(since: number): Promise<TagChange[]>;
}

const micros = (column: typeof cacheTags.updatedAt) =>
  sql<number>`(extract(epoch from ${column}) * 1000000)::bigint`.mapWith(Number);

export function createTagStore(db: Executor): TagStore {
  return {
    async write(tags, expireSeconds) {
      if (tags.length === 0) return [];
      return db
        .insert(cacheTags)
        .values(
          [...new Set(tags)].map((tag) => ({
            tag,
            expireSeconds,
            updatedAt: sql`clock_timestamp()`,
          })),
        )
        .onConflictDoUpdate({
          target: cacheTags.tag,
          set: { expireSeconds: sql`excluded.expire_seconds`, updatedAt: sql`clock_timestamp()` },
        })
        .returning({
          tag: cacheTags.tag,
          expireSeconds: cacheTags.expireSeconds,
          changedAt: micros(cacheTags.updatedAt),
        });
    },

    async latest() {
      const [row] = await db
        .select({
          latest:
            sql<number>`coalesce((extract(epoch from max(${cacheTags.updatedAt})) * 1000000)::bigint, 0)`.mapWith(
              Number,
            ),
        })
        .from(cacheTags);
      return row?.latest ?? 0;
    },

    async changesSince(since) {
      return db
        .select({
          tag: cacheTags.tag,
          expireSeconds: cacheTags.expireSeconds,
          changedAt: micros(cacheTags.updatedAt),
        })
        .from(cacheTags)
        .where(gt(cacheTags.updatedAt, sql`to_timestamp(${since}::double precision / 1000000)`));
    },
  };
}
