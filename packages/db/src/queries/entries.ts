import {
  type BlockList,
  type EntryKind,
  type EntryListQuery,
  type EntrySortKey,
  type EntryView,
  isReservedRootSlug,
  pagePath,
  postPath,
  slugify,
  withSuffix,
} from "@sitebuilder/schema";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { user } from "../schema/auth-schema";
import { type Entry, type EntryStatus, entries } from "../schema/entries";
import { media } from "../schema/media";
import { redirects } from "../schema/site";
import { entryTerms, terms } from "../schema/terms";
import { isUniqueViolation } from "./errors";
import { writeRevision } from "./revisions";
import { getSettings } from "./settings";
import { setEntryTerms } from "./terms";

// Posts and pages (design §4.1). These functions say what to read and write; who may do it is
// decided by the admin zone's can() before it calls them.

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

// ── Lists ────────────────────────────────────────────────────────────────────────────────────

export interface EntryListRow {
  id: string;
  title: string;
  path: string;
  status: EntryStatus;
  publishedAt: Date | null;
  updatedAt: Date;
  deletedAt: Date | null;
  author: { id: string; name: string };
  // Category names, for posts.
  categories: string[];
}

export interface EntryList {
  rows: EntryListRow[];
  total: number;
  // The page actually shown: a page past the end becomes the last one.
  page: number;
  counts: Record<EntryView, number>;
}

export interface ListEntriesInput extends EntryListQuery {
  type: EntryKind;
  // Set for someone who may only see their own (an author's Posts screen).
  authorId: string | null;
}

const VIEW_WHERE: Record<EntryView, SQL> = {
  all: sql`${entries.deletedAt} is null`,
  published: sql`${entries.deletedAt} is null and ${entries.status} = 'published'`,
  drafts: sql`${entries.deletedAt} is null and ${entries.status} = 'draft'`,
  scheduled: sql`${entries.deletedAt} is null and ${entries.status} = 'scheduled'`,
  trash: sql`${entries.deletedAt} is not null`,
};

// The columns behind the sort keys. Only these reach ORDER BY (design §8).
const SORT_COLUMNS: Record<EntrySortKey, SQL> = {
  title: sql`lower(${entries.title})`,
  status: sql`${entries.status}`,
  author: sql`lower(${user.name})`,
  date: sql`coalesce(${entries.publishedAt}, ${entries.updatedAt})`,
};

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listEntries(db: Executor, input: ListEntriesInput): Promise<EntryList> {
  const scope = and(
    eq(entries.type, input.type),
    input.authorId ? eq(entries.authorId, input.authorId) : undefined,
  );
  const where = and(
    scope,
    VIEW_WHERE[input.view],
    input.q ? ilike(entries.title, `%${escapeLike(input.q)}%`) : undefined,
  );

  // The tab counts ignore the search, as the tabs do.
  const tally = (view: EntryView) =>
    sql<number>`count(*) filter (where ${VIEW_WHERE[view]})`.mapWith(Number);
  const [tallied] = await db
    .select({
      all: tally("all"),
      published: tally("published"),
      drafts: tally("drafts"),
      scheduled: tally("scheduled"),
      trash: tally("trash"),
    })
    .from(entries)
    .where(scope);
  const counts = tallied ?? { all: 0, published: 0, drafts: 0, scheduled: 0, trash: 0 };

  const [found] = await db.select({ total: count() }).from(entries).where(where);
  const total = found?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / input.size));
  const page = Math.min(input.page, lastPage);

  const descending = input.sort.startsWith("-");
  const column = SORT_COLUMNS[input.sort.replace(/^-/, "") as EntrySortKey];
  const rows = await db
    .select({
      id: entries.id,
      title: entries.title,
      path: entries.path,
      status: entries.status,
      publishedAt: entries.publishedAt,
      updatedAt: entries.updatedAt,
      deletedAt: entries.deletedAt,
      authorId: user.id,
      authorName: user.name,
    })
    .from(entries)
    .innerJoin(user, eq(user.id, entries.authorId))
    .where(where)
    .orderBy(descending ? desc(column) : asc(column), asc(entries.id))
    .limit(input.size)
    .offset((page - 1) * input.size);

  const categories = new Map<string, string[]>();
  if (input.type === "post" && rows.length > 0) {
    const links = await db
      .select({ entryId: entryTerms.entryId, name: terms.name })
      .from(entryTerms)
      .innerJoin(terms, eq(terms.id, entryTerms.termId))
      .where(
        and(
          eq(terms.taxonomy, "category"),
          inArray(
            entryTerms.entryId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(asc(terms.name));
    for (const link of links) {
      categories.set(link.entryId, [...(categories.get(link.entryId) ?? []), link.name]);
    }
  }

  return {
    rows: rows.map(({ authorId, authorName, ...row }) => ({
      ...row,
      author: { id: authorId, name: authorName },
      categories: categories.get(row.id) ?? [],
    })),
    total,
    page,
    counts,
  };
}

// ── One entry ────────────────────────────────────────────────────────────────────────────────

export interface EntryForEdit {
  id: string;
  type: EntryKind;
  status: EntryStatus;
  title: string;
  slug: string;
  path: string;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  deletedAt: Date | null;
  content: BlockList;
  featuredMediaId: string | null;
  author: { id: string; name: string };
  parent: { id: string; title: string } | null;
  categoryIds: string[];
  tagIds: string[];
}

export async function getEntryForEdit(db: Executor, id: string): Promise<EntryForEdit | undefined> {
  const entry = await db.query.entries.findFirst({
    where: { id },
    columns: {
      id: true,
      type: true,
      status: true,
      title: true,
      slug: true,
      path: true,
      excerpt: true,
      seoTitle: true,
      seoDescription: true,
      publishedAt: true,
      updatedAt: true,
      deletedAt: true,
      content: true,
      featuredMediaId: true,
    },
    with: {
      author: { columns: { id: true, name: true } },
      parent: { columns: { id: true, title: true } },
      terms: { columns: { id: true, taxonomy: true } },
    },
  });
  if (!entry) return undefined;
  const { terms: linked, ...rest } = entry;
  return {
    ...rest,
    categoryIds: linked.filter((t) => t.taxonomy === "category").map((t) => t.id),
    tagIds: linked.filter((t) => t.taxonomy === "tag").map((t) => t.id),
  };
}

// Just enough to authorise a change: the entry's type and its owner.
export async function getEntryOwner(
  db: Executor,
  id: string,
): Promise<{ type: EntryKind; authorId: string } | undefined> {
  return db.query.entries.findFirst({
    where: { id },
    columns: { type: true, authorId: true },
  });
}

// Pages that can be a parent: not in the trash, and not the page itself or anything under it.
export async function listParentOptions(
  db: Executor,
  exceptId: string | null,
): Promise<{ id: string; title: string; path: string }[]> {
  return db
    .select({ id: entries.id, title: entries.title, path: entries.path })
    .from(entries)
    .where(
      and(
        eq(entries.type, "page"),
        isNull(entries.deletedAt),
        exceptId
          ? sql`${entries.id} <> ${exceptId} and ${entries.id} not in ${descendantsOf(exceptId)}`
          : undefined,
      ),
    )
    .orderBy(asc(entries.path))
    .limit(1000);
}

// ── For blocks ───────────────────────────────────────────────────────────────────────────────

export interface EntryLink {
  id: string;
  title: string;
  type: EntryKind;
  path: string;
  // For the caller's can() check: an author may only see their own drafts' titles.
  authorId: string;
  // Published, its time reached, and not in the trash: what visitors can open (§4.1).
  public: boolean;
}

const isPublic = sql<boolean>`(${entries.status} = 'published' and ${entries.publishedAt} <= now() and ${entries.deletedAt} is null)`;

// The entries blocks link to, by id: their current paths, so links follow renames (§5.1).
export async function getEntryLinks(
  db: Executor,
  ids: readonly string[],
): Promise<Map<string, EntryLink>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: entries.id,
      title: entries.title,
      type: entries.type,
      path: entries.path,
      authorId: entries.authorId,
      public: isPublic,
    })
    .from(entries)
    .where(inArray(entries.id, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.id, row]));
}

// Entries to link to, for the editor's link field: not in the trash, matching the search.
export async function searchEntryLinks(db: Executor, q: string, limit = 20): Promise<EntryLink[]> {
  return db
    .select({
      id: entries.id,
      title: entries.title,
      type: entries.type,
      path: entries.path,
      authorId: entries.authorId,
      public: isPublic,
    })
    .from(entries)
    .where(
      and(isNull(entries.deletedAt), q ? ilike(entries.title, `%${escapeLike(q)}%`) : undefined),
    )
    .orderBy(asc(entries.type), asc(entries.path))
    .limit(limit);
}

export interface PostCard {
  id: string;
  title: string;
  path: string;
  excerpt: string | null;
  publishedAt: Date;
  termIds: string[];
}

// The newest public posts, for the latest-posts block, with their category and tag ids.
export async function listLatestPosts(db: Executor, limit = 24): Promise<PostCard[]> {
  const rows = await db
    .select({
      id: entries.id,
      title: entries.title,
      path: entries.path,
      excerpt: entries.excerpt,
      publishedAt: entries.publishedAt,
    })
    .from(entries)
    .where(and(eq(entries.type, "post"), isPublic))
    .orderBy(desc(entries.publishedAt), asc(entries.id))
    .limit(limit);
  const links =
    rows.length === 0
      ? []
      : await db
          .select({ entryId: entryTerms.entryId, termId: entryTerms.termId })
          .from(entryTerms)
          .where(
            inArray(
              entryTerms.entryId,
              rows.map((row) => row.id),
            ),
          );
  return rows.map((row) => ({
    ...row,
    // Public posts always have one (isPublic checks it).
    publishedAt: row.publishedAt ?? new Date(0),
    termIds: links.filter((link) => link.entryId === row.id).map((link) => link.termId),
  }));
}

// ── Slugs and paths ──────────────────────────────────────────────────────────────────────────

// The ids of every page under an entry, through parent_id, as a subquery for `in`.
function descendantsOf(id: string): SQL {
  return sql`(
    with recursive tree as (
      select e.id from entries e where e.parent_id = ${id}
      union all
      select e.id from entries e join tree t on e.parent_id = t.id
    )
    select id from tree
  )`;
}

async function postsPath(db: Executor): Promise<string> {
  return (await getSettings(db, "reading"))?.postsPath ?? "/blog";
}

async function isPathTaken(db: Executor, path: string, exceptId: string | null): Promise<boolean> {
  const [taken] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(
        eq(entries.path, path),
        isNull(entries.deletedAt),
        exceptId ? ne(entries.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return taken !== undefined;
}

type Placement = { ok: true; slug: string; path: string } | { ok: false; error: "reserved-slug" };

// The entry's slug and path (§4.1). A slug left empty comes from the title. Either way it's
// made unique with a numeric suffix: a page among its siblings, a post among posts. A root page
// can't take a reserved first segment; one made from the title gets a suffix instead.
async function place(
  db: Executor,
  input: {
    type: EntryKind;
    title: string;
    requested: string;
    parentPath: string | null;
    postsPath: string;
    exceptId: string | null;
  },
): Promise<Placement> {
  const base = input.requested || slugify(input.title);
  const reserved =
    input.type === "page" && input.parentPath === null && isReservedRootSlug(base, input.postsPath);
  if (reserved && input.requested) return { ok: false, error: "reserved-slug" };

  for (let n = reserved ? 2 : 1; n <= 1000; n++) {
    const slug = n === 1 ? base : withSuffix(base, n);
    const path =
      input.type === "page" ? pagePath(input.parentPath, slug) : postPath(input.postsPath, slug);
    if (!(await isPathTaken(db, path, input.exceptId))) return { ok: true, slug, path };
  }
  throw new Error(`No free path for "${base}"`);
}

type ParentResult = { ok: true; path: string | null } | { ok: false; error: "invalid-parent" };

async function currentParentPath(db: Executor, parentId: string): Promise<ParentResult> {
  const [parent] = await db
    .select({ path: entries.path })
    .from(entries)
    .where(eq(entries.id, parentId));
  return parent ? { ok: true, path: parent.path } : { ok: false, error: "invalid-parent" };
}

// A parent must be a page that isn't in the trash, and not the entry itself or one of its
// descendants (that would make a loop).
async function resolveParent(
  db: Executor,
  parentId: string | null,
  selfId: string | null,
): Promise<ParentResult> {
  if (!parentId) return { ok: true, path: null };
  if (parentId === selfId) return { ok: false, error: "invalid-parent" };
  const [parent] = await db
    .select({ path: entries.path })
    .from(entries)
    .where(
      and(
        eq(entries.id, parentId),
        eq(entries.type, "page"),
        isNull(entries.deletedAt),
        selfId ? sql`${entries.id} not in ${descendantsOf(selfId)}` : undefined,
      ),
    );
  return parent ? { ok: true, path: parent.path } : { ok: false, error: "invalid-parent" };
}

interface Move {
  from: string;
  to: string;
}

// After an entry's path changes: moves every page under it to the new prefix, and records a
// 301 from each old public path to its new one (§4.1, renaming and moving).
async function moveSubtree(db: Executor, root: { id: string } & Move & Public): Promise<void> {
  const moves: Move[] = root.public ? [{ from: root.from, to: root.to }] : [];

  const prefix = `${root.from}/`;
  const children = await db
    .select({
      id: entries.id,
      path: entries.path,
      status: entries.status,
      deletedAt: entries.deletedAt,
    })
    .from(entries)
    .where(
      and(
        sql`${entries.id} in ${descendantsOf(root.id)}`,
        sql`left(${entries.path}, ${prefix.length}) = ${prefix}`,
      ),
    );
  for (const child of children) {
    const to = `${root.to}/${child.path.slice(prefix.length)}`;
    await db.update(entries).set({ path: to }).where(eq(entries.id, child.id));
    if (child.status === "published" && !child.deletedAt) moves.push({ from: child.path, to });
  }

  await writeRedirects(db, moves);
}

interface Public {
  // Published and not in the trash: visitors may know the old path, so it gets a redirect.
  public: boolean;
}

// A path a live entry now has is no longer a redirect's source; redirects to an old path follow
// it to the new one, so there are no chains; a redirect to itself is dropped. Together that
// keeps redirects free of loops when an entry moves back to where it was.
async function writeRedirects(db: Executor, moves: readonly Move[]): Promise<void> {
  if (moves.length === 0) return;
  await db.delete(redirects).where(
    inArray(
      redirects.fromPath,
      moves.map((move) => move.to),
    ),
  );
  for (const move of moves) {
    await db.update(redirects).set({ toPath: move.to }).where(eq(redirects.toPath, move.from));
    await db
      .insert(redirects)
      .values({ fromPath: move.from, toPath: move.to, status: 301 })
      .onConflictDoUpdate({ target: redirects.fromPath, set: { toPath: move.to, status: 301 } });
  }
  await db.delete(redirects).where(sql`${redirects.fromPath} = ${redirects.toPath}`);
}

// ── Writes ───────────────────────────────────────────────────────────────────────────────────

// The fields a save writes, already validated (EntryFields, and validateBlockList for the
// content) and authorised.
export interface EntryWrite {
  title: string;
  content: BlockList;
  featuredMediaId: string | null;
  // "" = make one from the title.
  slug: string;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  // Pages only; ignored for posts.
  parentId: string | null;
  // Posts only; ignored for pages.
  categoryIds: readonly string[];
  tagIds: readonly string[];
}

export type EntryWriteError =
  | "not-found"
  | "conflict"
  | "in-trash"
  | "reserved-slug"
  | "invalid-parent"
  | "invalid-media"
  | "path-taken";

export type EntryWriteResult =
  | { ok: true; id: string; slug: string; path: string; updatedAt: Date }
  | { ok: false; error: EntryWriteError };

// A unique-index failure means another request took the path between the check and the write.
async function mapPathTaken(run: () => Promise<EntryWriteResult>): Promise<EntryWriteResult> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "path-taken" };
    throw error;
  }
}

// The featured image must exist. The row is locked, so it can't be deleted before this commits.
async function mediaExists(db: Executor, id: string | null): Promise<boolean> {
  if (id === null) return true;
  const [row] = await db.select({ id: media.id }).from(media).where(eq(media.id, id)).for("share");
  return row !== undefined;
}

// A new draft and, unless autosave created it, its first revision (§4.1: autosave writes none).
export async function createEntry(
  db: Executor,
  input: EntryWrite & {
    type: EntryKind;
    authorId: string;
    actorId: string;
    writeRevision?: boolean;
  },
): Promise<EntryWriteResult> {
  return mapPathTaken(() =>
    db.transaction(async (tx) => {
      const parentId = input.type === "page" ? input.parentId : null;
      const parent = await resolveParent(tx, parentId, null);
      if (!parent.ok) return parent;
      if (!(await mediaExists(tx, input.featuredMediaId))) {
        return { ok: false, error: "invalid-media" };
      }
      const placed = await place(tx, {
        type: input.type,
        title: input.title,
        requested: input.slug,
        parentPath: parent.path,
        postsPath: await postsPath(tx),
        exceptId: null,
      });
      if (!placed.ok) return placed;

      const now = new Date();
      const [created] = await tx
        .insert(entries)
        .values({
          type: input.type,
          title: input.title,
          slug: placed.slug,
          path: placed.path,
          parentId,
          excerpt: input.excerpt,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          content: input.content,
          featuredMediaId: input.featuredMediaId,
          authorId: input.authorId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: entries.id, title: entries.title, content: entries.content });
      if (!created) throw new Error("insert returned no row");

      if (input.type === "post") {
        await setEntryTerms(tx, created.id, "category", input.categoryIds);
        await setEntryTerms(tx, created.id, "tag", input.tagIds);
      }
      if (input.writeRevision !== false) await writeRevision(tx, created, input.actorId);
      return { ok: true, id: created.id, slug: placed.slug, path: placed.path, updatedAt: now };
    }),
  );
}

// Saves the fields. Refused when the entry has changed since the editor loaded it (§4.1,
// concurrency). A new slug or parent moves the entry and every page under it, with redirects.
export async function updateEntry(
  db: Executor,
  input: EntryWrite & {
    id: string;
    expectedUpdatedAt: Date;
    // null keeps the author; only someone allowed post.update may pass one (§6.1).
    authorId: string | null;
    actorId: string;
  },
): Promise<EntryWriteResult> {
  return mapPathTaken(() =>
    db.transaction(async (tx) => {
      const [entry] = await tx.select().from(entries).where(eq(entries.id, input.id)).for("update");
      if (!entry) return { ok: false, error: "not-found" };
      if (entry.deletedAt) return { ok: false, error: "in-trash" };
      if (entry.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        return { ok: false, error: "conflict" };
      }

      const parentId = entry.type === "page" ? input.parentId : null;
      // An unchanged parent is kept even if it's in the trash meanwhile: saving the page
      // mustn't detach it. A new parent must pass every check.
      const parent =
        parentId && parentId === entry.parentId
          ? await currentParentPath(tx, parentId)
          : await resolveParent(tx, parentId, entry.id);
      if (!parent.ok) return parent;
      if (!(await mediaExists(tx, input.featuredMediaId))) {
        return { ok: false, error: "invalid-media" };
      }
      const placed = await place(tx, {
        type: entry.type,
        title: input.title,
        // Unchanged unless the slug field was edited; cleared means "from the title".
        requested: input.slug,
        parentPath: parent.path,
        postsPath: await postsPath(tx),
        exceptId: entry.id,
      });
      if (!placed.ok) return placed;

      const updatedAt = new Date();
      await tx
        .update(entries)
        .set({
          title: input.title,
          slug: placed.slug,
          path: placed.path,
          parentId,
          excerpt: input.excerpt,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          content: input.content,
          featuredMediaId: input.featuredMediaId,
          ...(input.authorId ? { authorId: input.authorId } : {}),
          updatedAt,
        })
        .where(eq(entries.id, entry.id));

      if (placed.path !== entry.path) {
        await moveSubtree(tx, {
          id: entry.id,
          from: entry.path,
          to: placed.path,
          public: entry.status === "published",
        });
      }
      if (entry.type === "post") {
        await setEntryTerms(tx, entry.id, "category", input.categoryIds);
        await setEntryTerms(tx, entry.id, "tag", input.tagIds);
      }
      await writeRevision(
        tx,
        { id: entry.id, title: input.title, content: input.content },
        input.actorId,
      );
      return { ok: true, id: entry.id, slug: placed.slug, path: placed.path, updatedAt };
    }),
  );
}

export type AutosaveResult =
  | { ok: true; updatedAt: Date }
  | { ok: false; error: "not-found" | "conflict" | "in-trash" | "not-draft" };

// The editor's autosave (design §8): the title and blocks of a draft, with the same conflict
// check as a save and no revision. Published and scheduled entries change only on an explicit
// save, so half-finished edits never go live (decisions #56).
export async function autosaveEntry(
  db: Executor,
  input: { id: string; expectedUpdatedAt: Date; title: string; content: BlockList },
): Promise<AutosaveResult> {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select({
        status: entries.status,
        updatedAt: entries.updatedAt,
        deletedAt: entries.deletedAt,
      })
      .from(entries)
      .where(eq(entries.id, input.id))
      .for("update");
    if (!entry) return { ok: false, error: "not-found" };
    if (entry.deletedAt) return { ok: false, error: "in-trash" };
    if (entry.status !== "draft") return { ok: false, error: "not-draft" };
    if (entry.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return { ok: false, error: "conflict" };
    }
    const updatedAt = new Date();
    await tx
      .update(entries)
      .set({ title: input.title, content: input.content, updatedAt })
      .where(eq(entries.id, input.id));
    return { ok: true, updatedAt };
  });
}

export type StatusChange = { kind: "publish"; at: Date | null } | { kind: "unpublish" };

export type StatusResult =
  | { ok: true; status: EntryStatus; publishedAt: Date | null; updatedAt: Date }
  | { ok: false; error: "not-found" | "conflict" | "in-trash" };

// Publish, schedule and unpublish (§4.1). Publishing now keeps a publishedAt that has already
// passed and sets one otherwise; a date in the future schedules. Unpublishing keeps the date.
// `expectedUpdatedAt` is null when the same request has just saved the entry.
export async function setEntryStatus(
  db: Executor,
  input: {
    id: string;
    change: StatusChange;
    expectedUpdatedAt: Date | null;
    actorId: string;
    writeRevision: boolean;
  },
): Promise<StatusResult> {
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(entries).where(eq(entries.id, input.id)).for("update");
    if (!entry) return { ok: false, error: "not-found" };
    if (entry.deletedAt) return { ok: false, error: "in-trash" };
    if (
      input.expectedUpdatedAt &&
      entry.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
    ) {
      return { ok: false, error: "conflict" };
    }

    const now = new Date();
    let status: EntryStatus = "draft";
    let publishedAt = entry.publishedAt;
    if (input.change.kind === "publish") {
      const at = input.change.at;
      if (at) {
        publishedAt = at;
      } else if (!publishedAt || publishedAt > now) {
        publishedAt = now;
      }
      status = publishedAt > now ? "scheduled" : "published";
    }

    await tx
      .update(entries)
      .set({ status, publishedAt, updatedAt: now })
      .where(eq(entries.id, entry.id));
    if (input.writeRevision && input.change.kind === "publish") {
      await writeRevision(tx, entry, input.actorId);
    }
    return { ok: true, status, publishedAt, updatedAt: now };
  });
}

export type TrashResult = { ok: true } | { ok: false; error: "not-found" | "in-trash" };

// The trash isn't a status: the entry keeps its status and gets deletedAt (§4.1). Its path is
// freed; its children keep theirs.
export async function trashEntry(db: Executor, id: string): Promise<TrashResult> {
  const [entry] = await db
    .update(entries)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(entries.id, id), isNull(entries.deletedAt)))
    .returning({ id: entries.id });
  if (entry) return { ok: true };
  const exists = await getEntryOwner(db, id);
  return { ok: false, error: exists ? "in-trash" : "not-found" };
}

export type RestoreResult =
  | { ok: true; asDraft: boolean; path: string }
  | { ok: false; error: "not-found" | "not-in-trash" | "invalid-parent" };

// Back from the trash in its previous state. When another entry has taken its path meanwhile, it
// returns as a draft under a free slug (§4.1).
export async function restoreEntry(db: Executor, id: string): Promise<RestoreResult> {
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(entries).where(eq(entries.id, id)).for("update");
    if (!entry) return { ok: false, error: "not-found" };
    if (!entry.deletedAt) return { ok: false, error: "not-in-trash" };

    if (!(await isPathTaken(tx, entry.path, entry.id))) {
      await tx
        .update(entries)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(entries.id, entry.id));
      return { ok: true, asDraft: false, path: entry.path };
    }

    // The parent's current path: it may have moved, or be in the trash itself.
    const parent = entry.parentId
      ? await tx.query.entries.findFirst({
          where: { id: entry.parentId },
          columns: { path: true },
        })
      : undefined;
    if (entry.parentId && !parent) return { ok: false, error: "invalid-parent" };
    const placed = await place(tx, {
      type: entry.type,
      title: entry.title,
      requested: entry.slug,
      parentPath: parent?.path ?? null,
      postsPath: await postsPath(tx),
      exceptId: entry.id,
    });
    // A restored slug was valid before, so only a reserved one can fail; make one from the title.
    const free = placed.ok
      ? placed
      : await place(tx, {
          type: entry.type,
          title: entry.title,
          requested: "",
          parentPath: null,
          postsPath: await postsPath(tx),
          exceptId: entry.id,
        });
    if (!free.ok) return { ok: false, error: "invalid-parent" };

    await tx
      .update(entries)
      .set({
        deletedAt: null,
        status: "draft",
        slug: free.slug,
        path: free.path,
        updatedAt: new Date(),
      })
      .where(eq(entries.id, entry.id));
    await moveSubtree(tx, { id: entry.id, from: entry.path, to: free.path, public: false });
    return { ok: true, asDraft: true, path: free.path };
  });
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "not-in-trash" | "has-children" };

// Permanent, and only from the trash. A page with children (in the trash or not) can't go until
// they've been moved or deleted (§4.1). Revisions and term links go with it.
export async function deleteEntry(db: Executor, id: string): Promise<DeleteResult> {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ deletedAt: entries.deletedAt })
      .from(entries)
      .where(eq(entries.id, id))
      .for("update");
    if (!entry) return { ok: false, error: "not-found" };
    if (!entry.deletedAt) return { ok: false, error: "not-in-trash" };
    const [child] = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.parentId, id))
      .limit(1);
    if (child) return { ok: false, error: "has-children" };
    await tx.delete(entries).where(eq(entries.id, id));
    return { ok: true };
  });
}

// For the dashboard and the Users screen: how many entries each author has, trash included.
export async function countEntriesByAuthor(db: Executor): Promise<Map<string, number>> {
  const rows = await db
    .select({ authorId: entries.authorId, total: count() })
    .from(entries)
    .groupBy(entries.authorId);
  return new Map(rows.map((row) => [row.authorId, row.total]));
}
