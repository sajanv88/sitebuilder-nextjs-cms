import type { BlockList } from "@sitebuilder/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { user } from "../schema/auth-schema";
import { entries } from "../schema/entries";
import { entryRevisions } from "../schema/entry-revisions";

// Revisions (design §4.1): one on every explicit save and on publish, never on autosave. The
// latest 50 per entry are kept.

export const REVISIONS_KEPT = 50;

export async function writeRevision(
  db: Executor,
  entry: { id: string; title: string; content: BlockList },
  actorId: string,
): Promise<void> {
  await db.insert(entryRevisions).values({
    entryId: entry.id,
    title: entry.title,
    content: entry.content,
    createdBy: actorId,
    // The statement's clock, not the transaction's: two revisions in one transaction still
    // sort in the order they were written.
    createdAt: new Date(),
  });
  await db.delete(entryRevisions).where(
    and(
      eq(entryRevisions.entryId, entry.id),
      sql`${entryRevisions.id} not in (
        select ${entryRevisions.id} from ${entryRevisions}
        where ${entryRevisions.entryId} = ${entry.id}
        order by ${entryRevisions.createdAt} desc, ${entryRevisions.id} desc
        limit ${REVISIONS_KEPT}
      )`,
    ),
  );
}

export interface RevisionRow {
  id: string;
  title: string;
  createdAt: Date;
  author: { id: string; name: string };
}

export async function listRevisions(db: Executor, entryId: string): Promise<RevisionRow[]> {
  const rows = await db
    .select({
      id: entryRevisions.id,
      title: entryRevisions.title,
      createdAt: entryRevisions.createdAt,
      authorId: user.id,
      authorName: user.name,
    })
    .from(entryRevisions)
    .innerJoin(user, eq(user.id, entryRevisions.createdBy))
    .where(eq(entryRevisions.entryId, entryId))
    .orderBy(desc(entryRevisions.createdAt), desc(entryRevisions.id))
    .limit(REVISIONS_KEPT);
  return rows.map(({ authorId, authorName, ...row }) => ({
    ...row,
    author: { id: authorId, name: authorName },
  }));
}

export type RestoreRevisionResult =
  | { ok: true; updatedAt: Date }
  | { ok: false; error: "not-found" | "conflict" | "in-trash" };

// Copies a revision's title and content into its entry, and records that as a new revision.
// Like a save, it's refused when the entry has changed since the editor loaded it.
export async function restoreRevision(
  db: Executor,
  input: { entryId: string; revisionId: string; expectedUpdatedAt: Date; actorId: string },
): Promise<RestoreRevisionResult> {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ id: entries.id, updatedAt: entries.updatedAt, deletedAt: entries.deletedAt })
      .from(entries)
      .where(eq(entries.id, input.entryId))
      .for("update");
    const revision = await tx.query.entryRevisions.findFirst({
      where: { id: input.revisionId, entryId: input.entryId },
      columns: { title: true, content: true },
    });
    if (!entry || !revision) return { ok: false, error: "not-found" };
    if (entry.deletedAt) return { ok: false, error: "in-trash" };
    if (entry.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return { ok: false, error: "conflict" };
    }

    const updatedAt = new Date();
    await tx
      .update(entries)
      .set({ title: revision.title, content: revision.content, updatedAt })
      .where(eq(entries.id, entry.id));
    await writeRevision(
      tx,
      { id: entry.id, title: revision.title, content: revision.content },
      input.actorId,
    );
    return { ok: true, updatedAt };
  });
}
