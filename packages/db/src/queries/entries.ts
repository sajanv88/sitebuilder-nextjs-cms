import { sql } from "drizzle-orm";
import type { Executor } from "../executor";
import type { Entry } from "../schema/entries";

// The public visibility rule (design §4.1): published, published_at reached, not trashed.
// Everything else is a 404 for visitors. Used by the public catch-all route in phase 4.
export async function getPublicEntryByPath(db: Executor, path: string): Promise<Entry | undefined> {
  return db.query.entries.findFirst({
    where: {
      path,
      status: "published",
      deletedAt: { isNull: true },
      RAW: (t) => sql`${t.publishedAt} <= now()`,
    },
  });
}
