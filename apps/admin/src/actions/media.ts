// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { type Action, can } from "@sitebuilder/auth";
import {
  db,
  deleteMedia,
  getMedia,
  listMedia,
  type MediaRow,
  type MediaUse,
  mediaUsage,
  updateMediaAlt,
} from "@sitebuilder/db";
import { MediaAlt, MediaId, MediaListQuery } from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer, type Viewer } from "@/auth/session";
import { invalidate } from "@/server/invalidate";
import { mediaUrl, storageOfFile } from "@/server/media";

// The media library (design §4.2, §8). Authors manage only their own files (media.readOwn,
// updateOwn, deleteOwn, design §6.2); every id is checked against its uploader with can().

export interface MediaItem {
  id: string;
  filename: string;
  mimeType: MediaRow["mimeType"];
  url: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  alt: string | null;
  storage: MediaRow["storage"];
  createdAt: string;
  uploadedBy: string;
}

const toItem = (row: MediaRow): MediaItem => ({
  id: row.id,
  filename: row.filename,
  mimeType: row.mimeType,
  url: mediaUrl(row.storageKey),
  width: row.width,
  height: row.height,
  sizeBytes: row.sizeBytes,
  alt: row.alt,
  storage: row.storage,
  createdAt: row.createdAt.toISOString(),
  uploadedBy: row.uploadedBy.name,
});

const SESSION_ENDED = "Your session has ended. Sign in again.";
const NOT_FOUND = "That file doesn't exist any more.";

// The file, if the viewer may do `verb` to it. Not found either way, so an author can't learn
// which ids belong to other people's files.
async function authorize(
  viewer: Viewer,
  id: unknown,
  verb: "read" | "update" | "delete",
): Promise<MediaRow | undefined> {
  const parsed = v.safeParse(MediaId, id);
  if (!parsed.success) return undefined;
  const row = await getMedia(db, parsed.output);
  if (!row) return undefined;
  const action: Action = `media.${verb}`;
  return can(viewer, action, { type: "media", ownerId: row.uploadedBy.id }) ? row : undefined;
}

// ── Lists, for the media picker ─────────────────────────────────────────────────────────────

export type PickerPage =
  | { ok: true; items: MediaItem[]; total: number; page: number; size: number }
  | { ok: false; error: string };

export async function listMediaPage(input: unknown): Promise<PickerPage> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: SESSION_ENDED };
  if (!can(viewer, "media.read") && !can(viewer, "media.upload")) {
    return { ok: false, error: "You can't use the media library." };
  }
  // Falls back to defaults for anything it doesn't accept, as on the Media screen.
  const query = v.parse(MediaListQuery, input && typeof input === "object" ? input : {});
  const list = await listMedia(db, {
    ...query,
    uploadedBy: can(viewer, "media.read") ? null : viewer.id,
  });
  return {
    ok: true,
    items: list.rows.map(toItem),
    total: list.total,
    page: list.page,
    size: query.size,
  };
}

// ── One file ────────────────────────────────────────────────────────────────────────────────

export type MediaDetails =
  | { ok: true; item: MediaItem; usedIn: MediaUse[]; canEdit: boolean; canDelete: boolean }
  | { ok: false; error: string };

export async function getMediaDetails(id: unknown): Promise<MediaDetails> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: SESSION_ENDED };
  const row = await authorize(viewer, id, "read");
  if (!row) return { ok: false, error: NOT_FOUND };
  const owner = { type: "media", ownerId: row.uploadedBy.id } as const;
  return {
    ok: true,
    item: toItem(row),
    usedIn: await mediaUsage(db, row.id),
    canEdit: can(viewer, "media.update", owner),
    canDelete: can(viewer, "media.delete", owner),
  };
}

export interface AltState {
  result: "idle" | "saved" | "invalid" | "failed";
  message?: string;
  alt: string;
  at?: number;
}

export async function saveAlt(_: AltState, form: FormData): Promise<AltState> {
  const typed = form.get("alt");
  const alt = typeof typed === "string" ? typed.slice(0, 1000) : "";
  const viewer = await getViewer();
  if (!viewer) return { result: "failed", message: SESSION_ENDED, alt };
  const row = await authorize(viewer, form.get("id"), "update");
  if (!row) return { result: "failed", message: NOT_FOUND, alt };
  const parsed = v.safeParse(MediaAlt, alt);
  if (!parsed.success) {
    return { result: "invalid", message: parsed.issues[0]?.message ?? "Check the alt text.", alt };
  }
  const updated = await updateMediaAlt(db, row.id, parsed.output);
  if (!updated.ok) return { result: "failed", message: NOT_FOUND, alt };
  invalidate("saveAlt");
  return { result: "saved", message: "Alt text saved.", alt: parsed.output, at: Date.now() };
}

export type DeleteMediaResult =
  | { ok: true; message: string }
  | { ok: false; error: string; usedIn?: MediaUse[] };

// Refused while anything uses the file (design §4.2). The row goes first, in a transaction;
// the stored file is removed after it commits (drizzle-postgres rule 13: nothing slow inside).
export async function deleteMediaFile(id: unknown): Promise<DeleteMediaResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: SESSION_ENDED };
  const row = await authorize(viewer, id, "delete");
  if (!row) return { ok: false, error: NOT_FOUND };

  const deleted = await deleteMedia(db, row.id);
  if (!deleted.ok) {
    return deleted.error === "in-use"
      ? {
          ok: false,
          error: "This file is in use. Take it out of these first.",
          usedIn: deleted.usedIn,
        }
      : { ok: false, error: NOT_FOUND };
  }
  invalidate("deleteMediaFile");

  const storage = await storageOfFile(deleted.storage);
  try {
    if (!storage.ok) throw new Error(storage.reason);
    await storage.storage.delete(deleted.storageKey);
  } catch (error) {
    // The library no longer lists it; the stored bytes are left behind. Logged for whoever
    // runs the site, and nothing a visitor can reach: /media/<key> answers only for known rows.
    console.error("media delete: the stored file couldn't be removed", deleted.storageKey, error);
  }
  return { ok: true, message: `${row.filename} deleted.` };
}
