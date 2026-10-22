// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  MEDIA_TYPES,
  type MediaKind,
  type MediaListQuery,
  type MediaStorageKind,
  type MediaType,
} from "@sitebuilder/schema";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { user } from "../schema/auth-schema";
import { type EntryStatus, entries } from "../schema/entries";
import { media } from "../schema/media";

// Uploaded files (design §4.2). The file itself lives in storage (packages/media); these read
// and write the row that describes it. Who may do what is decided by can() before the call.

export interface MediaRow {
  id: string;
  filename: string;
  mimeType: MediaType;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  storageKey: string;
  storage: MediaStorageKind;
  createdAt: Date;
  uploadedBy: { id: string; name: string };
}

const ROW = {
  id: media.id,
  filename: media.filename,
  mimeType: media.mimeType,
  sizeBytes: media.sizeBytes,
  width: media.width,
  height: media.height,
  alt: media.alt,
  storageKey: media.storageKey,
  storage: media.storage,
  createdAt: media.createdAt,
  uploaderId: user.id,
  uploaderName: user.name,
};

type SelectedRow = Omit<MediaRow, "uploadedBy"> & { uploaderId: string; uploaderName: string };
const toRow = ({ uploaderId, uploaderName, ...row }: SelectedRow): MediaRow => ({
  ...row,
  uploadedBy: { id: uploaderId, name: uploaderName },
});

const typesOf = (kind: MediaKind): MediaType[] =>
  (Object.keys(MEDIA_TYPES) as MediaType[]).filter((type) => MEDIA_TYPES[type] === kind);

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);

// ── Lists ────────────────────────────────────────────────────────────────────────────────────

export interface ListMediaInput extends MediaListQuery {
  // Set for someone who may only see their own (an author).
  uploadedBy: string | null;
}

export interface MediaList {
  rows: MediaRow[];
  total: number;
  // The page actually shown: a page past the end becomes the last one.
  page: number;
}

// Uploaded within a month, "2026-10", in UTC as storage keys are.
function monthWhere(month: string) {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(year, number - 1, 1));
  const end = new Date(Date.UTC(year, number, 1));
  return and(sql`${media.createdAt} >= ${start}`, sql`${media.createdAt} < ${end}`);
}

export interface MediaFolders {
  all: number;
  kinds: Record<MediaKind, number>;
  // Newest first: "2026-10" and how many files.
  months: { month: string; count: number }[];
}

// What the media library's folders hold: every file, by kind, and by the month it came.
export async function mediaFolders(db: Executor, uploadedBy: string | null): Promise<MediaFolders> {
  const mine = uploadedBy ? eq(media.uploadedBy, uploadedBy) : undefined;
  const byType = await db
    .select({ type: media.mimeType, total: count() })
    .from(media)
    .where(mine)
    .groupBy(media.mimeType);
  const kinds: Record<MediaKind, number> = { image: 0, video: 0, document: 0 };
  for (const row of byType) kinds[MEDIA_TYPES[row.type]] += row.total;
  const month = sql<string>`to_char(${media.createdAt} at time zone 'UTC', 'YYYY-MM')`;
  const months = await db
    .select({ month, count: count() })
    .from(media)
    .where(mine)
    .groupBy(month)
    .orderBy(desc(month))
    .limit(240);
  return { all: byType.reduce((sum, row) => sum + row.total, 0), kinds, months };
}

// Newest first.
export async function listMedia(db: Executor, input: ListMediaInput): Promise<MediaList> {
  const where = and(
    input.uploadedBy ? eq(media.uploadedBy, input.uploadedBy) : undefined,
    input.kind === "all" ? undefined : inArray(media.mimeType, typesOf(input.kind)),
    input.q
      ? or(
          ilike(media.filename, `%${escapeLike(input.q)}%`),
          ilike(media.alt, `%${escapeLike(input.q)}%`),
        )
      : undefined,
    input.month ? monthWhere(input.month) : undefined,
  );
  const [found] = await db.select({ total: count() }).from(media).where(where);
  const total = found?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / input.size));
  const page = Math.min(input.page, lastPage);

  const rows = await db
    .select(ROW)
    .from(media)
    .innerJoin(user, eq(user.id, media.uploadedBy))
    .where(where)
    .orderBy(desc(media.createdAt), asc(media.id))
    .limit(input.size)
    .offset((page - 1) * input.size);
  return { rows: rows.map(toRow), total, page };
}

// ── One file ─────────────────────────────────────────────────────────────────────────────────

export async function getMedia(db: Executor, id: string): Promise<MediaRow | undefined> {
  const [row] = await db
    .select(ROW)
    .from(media)
    .innerJoin(user, eq(user.id, media.uploadedBy))
    .where(eq(media.id, id))
    .limit(1);
  return row ? toRow(row) : undefined;
}

// What the site zone needs to serve /media/<key>.
export async function getMediaByKey(
  db: Executor,
  storageKey: string,
): Promise<
  | {
      mimeType: MediaType;
      sizeBytes: number;
      filename: string;
      storage: MediaStorageKind;
    }
  | undefined
> {
  return db.query.media.findFirst({
    where: { storageKey },
    columns: { mimeType: true, sizeBytes: true, filename: true, storage: true },
  });
}

// What blocks need to draw the files a page uses, in one query.
export interface RenderMedia {
  id: string;
  storageKey: string;
  mimeType: MediaType;
  width: number | null;
  height: number | null;
  alt: string | null;
  filename: string;
  sizeBytes: number;
}

export async function getMediaForRender(
  db: Executor,
  ids: readonly string[],
): Promise<Map<string, RenderMedia>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: media.id,
      storageKey: media.storageKey,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
      alt: media.alt,
      filename: media.filename,
      sizeBytes: media.sizeBytes,
    })
    .from(media)
    .where(inArray(media.id, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.id, row]));
}

// ── Writes ───────────────────────────────────────────────────────────────────────────────────

export interface NewMediaInput {
  filename: string;
  mimeType: MediaType;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  storageKey: string;
  storage: MediaStorageKind;
  uploadedBy: string;
}

export async function createMedia(db: Executor, input: NewMediaInput): Promise<{ id: string }> {
  const [created] = await db.insert(media).values(input).returning({ id: media.id });
  if (!created) throw new Error("insert returned no row");
  return created;
}

export async function updateMediaAlt(
  db: Executor,
  id: string,
  alt: string,
): Promise<{ ok: true } | { ok: false; error: "not-found" }> {
  const updated = await db
    .update(media)
    .set({ alt: alt === "" ? null : alt })
    .where(eq(media.id, id))
    .returning({ id: media.id });
  return updated.length > 0 ? { ok: true } : { ok: false, error: "not-found" };
}

// ── Where a file is used ─────────────────────────────────────────────────────────────────────

export interface MediaUse {
  id: string;
  title: string;
  type: "page" | "post";
  status: EntryStatus;
  inTrash: boolean;
}

// Entries that use a file: as their featured image, or in any block, however deeply nested,
// through mediaId, imageMediaId, posterMediaId, beforeMediaId, afterMediaId or mediaIds
// (design §4.2). Trashed entries count too: restoring one would bring the file back into use
// (decisions #57).
function usesMedia(id: string) {
  return or(
    eq(entries.featuredMediaId, id),
    sql`jsonb_path_exists(${entries.content}, '$.** ? (@.mediaId == $id || @.imageMediaId == $id || @.posterMediaId == $id || @.beforeMediaId == $id || @.afterMediaId == $id || exists(@.mediaIds[*] ? (@ == $id)))', jsonb_build_object('id', ${id}::text))`,
  );
}

export async function mediaUsage(db: Executor, id: string, limit = 50): Promise<MediaUse[]> {
  const rows = await db
    .select({
      id: entries.id,
      title: entries.title,
      type: entries.type,
      status: entries.status,
      deletedAt: entries.deletedAt,
    })
    .from(entries)
    .where(usesMedia(id))
    .orderBy(asc(entries.title))
    .limit(limit);
  return rows.map(({ deletedAt, ...row }) => ({ ...row, inTrash: deletedAt !== null }));
}

export type DeleteMediaResult =
  // The caller removes the file from storage after this commits.
  | { ok: true; storageKey: string; storage: MediaStorageKind }
  | { ok: false; error: "not-found" }
  | { ok: false; error: "in-use"; usedIn: MediaUse[] };

// Refused while anything uses the file (design §4.2).
export async function deleteMedia(db: Executor, id: string): Promise<DeleteMediaResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ storageKey: media.storageKey, storage: media.storage })
      .from(media)
      .where(eq(media.id, id))
      .for("update");
    if (!row) return { ok: false, error: "not-found" };
    const usedIn = await mediaUsage(tx, id);
    if (usedIn.length > 0) return { ok: false, error: "in-use", usedIn };
    await tx.delete(media).where(eq(media.id, id));
    return { ok: true, ...row };
  });
}

// How many files each storage holds, for the warning when storage settings change.
export async function countMediaByStorage(db: Executor): Promise<Record<MediaStorageKind, number>> {
  const rows = await db
    .select({ storage: media.storage, total: count() })
    .from(media)
    .groupBy(media.storage);
  const counts: Record<MediaStorageKind, number> = { local: 0, s3: 0 };
  for (const row of rows) counts[row.storage] = row.total;
  return counts;
}
