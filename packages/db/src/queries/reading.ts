import type { ReadingSettings } from "@sitebuilder/schema";
import { and, count, eq, isNull, like, or, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { entries } from "../schema/entries";
import { isPublic, type Move, writeRedirects } from "./entries";
import { getReading, isPublishedPage } from "./public";
import { upsertSettings } from "./settings";

// Settings → Reading (design §5.4): the home page, posts per page and the posts path.

export type SaveReadingResult =
  | { ok: true; moved: number }
  | { ok: false; error: "invalid-homepage" | "posts-path-taken" };

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Every post, trashed ones included: they all move when the posts path changes.
export async function countPosts(db: Executor): Promise<number> {
  const [row] = await db.select({ total: count() }).from(entries).where(eq(entries.type, "post"));
  return row?.total ?? 0;
}

// Saves the reading settings. A new posts path moves every post under it in the same
// transaction, with a 301 from each public post's old path, as a rename does (§4.1).
export async function saveReadingSettings(
  db: Executor,
  input: ReadingSettings,
): Promise<SaveReadingResult> {
  return db.transaction(async (tx) => {
    // The home page must be a published page (§4.1).
    if (input.homepageEntryId && !(await isPublishedPage(tx, input.homepageEntryId))) {
      return { ok: false, error: "invalid-homepage" };
    }

    const current = await getReading(tx);
    let moved = 0;
    if (input.postsPath !== current.postsPath) {
      // No page may sit at the new path or under it.
      const [page] = await tx
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            eq(entries.type, "page"),
            isNull(entries.deletedAt),
            or(
              eq(entries.path, input.postsPath),
              like(entries.path, `${escapeLike(input.postsPath)}/%`),
            ),
          ),
        )
        .limit(1);
      if (page) return { ok: false, error: "posts-path-taken" };

      const posts = await tx
        .select({ id: entries.id, path: entries.path, public: isPublic })
        .from(entries)
        .where(eq(entries.type, "post"));
      const moves: Move[] = [];
      for (const post of posts) {
        if (!post.path.startsWith(`${current.postsPath}/`)) continue;
        const to = `${input.postsPath}${post.path.slice(current.postsPath.length)}`;
        await tx
          .update(entries)
          .set({ path: to, updatedAt: sql`${entries.updatedAt}` })
          .where(eq(entries.id, post.id));
        if (post.public) moves.push({ from: post.path, to });
        moved += 1;
      }
      // The blog index moves too. Its archive and page addresses don't get one each: those
      // are lists, not content anyone links to for long.
      await writeRedirects(tx, [...moves, { from: current.postsPath, to: input.postsPath }]);
    }

    const saved = await upsertSettings(tx, "reading", input);
    if (!saved.ok) throw new Error("Reading settings failed their own schema");
    return { ok: true, moved };
  });
}
