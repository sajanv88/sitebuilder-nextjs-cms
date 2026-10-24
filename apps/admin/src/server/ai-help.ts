// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import type { AiImage } from "@sitebuilder/ai";
import type { MediaChoice } from "@sitebuilder/ai/site";
import { can, canSome } from "@sitebuilder/auth";
import { collectMediaIds, type Field, getBlockDefinition } from "@sitebuilder/blocks";
import { db, getMedia } from "@sitebuilder/db";
import type { Block, EntryKind } from "@sitebuilder/schema";
import type { Viewer } from "@/auth/session";
import { designMedia } from "@/server/ai-design";
import type { AiPermit } from "@/server/ai-route";
import { authorizeEntry } from "@/server/entries";
import { renderMedia, storageOfFile, storageProblem } from "@/server/media";
import { errorResponse } from "@/server/route-guard";
import "@/lib/template-blocks";

// What help on a page needs besides the model (phase 8 plan, 8.7, and B8): who may ask, about
// which entry, the page's words, the pictures a rewrite may use, and a picture's bytes for alt
// text.

// Help at all: on any entry (admins, editors) or on one's own posts (authors). Which entry is
// checked once the request is read.
export const HELP: AiPermit = {
  allowed: (viewer) => canSome(viewer, "ai.assist"),
  refusal: "You can't use the AI assistant.",
};

// B8: help needs edit permission on the entry, and help on that entry. An entry not saved yet is
// the viewer's own, so creating it is the edit permission.
export async function helpAllowed(
  viewer: Viewer,
  entry: { entryId: string; type: EntryKind },
): Promise<{ ok: true } | { ok: false; response: Response }> {
  let ownerId = viewer.id;
  if (entry.entryId) {
    const owner = await authorizeEntry(viewer, entry.entryId, "update");
    if (!owner || owner.type !== entry.type) {
      return { ok: false, response: errorResponse(403, "You can't edit this entry.") };
    }
    ownerId = owner.authorId;
  } else if (!can(viewer, `${entry.type}.create`)) {
    return { ok: false, response: errorResponse(403, `You can't create ${entry.type}s.`) };
  }
  if (!can(viewer, "ai.assist") && ownerId !== viewer.id) {
    return {
      ok: false,
      response: errorResponse(403, "You can have help on your own posts only."),
    };
  }
  return { ok: true };
}

// ── The page's words ─────────────────────────────────────────────────────────────────────────

const tagless = (html: string) =>
  html
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

// The words a field holds, by its kind: what a visitor reads, never ids, addresses or settings.
function fieldWords(field: Field, value: unknown, out: string[]): void {
  if (value === undefined || value === null) return;
  switch (field.kind) {
    case "text":
    case "alt":
      if (typeof value === "string" && value.trim()) out.push(value.trim());
      return;
    case "richtext":
      if (typeof value === "string") out.push(tagless(value).trim());
      return;
    case "strings":
      if (Array.isArray(value))
        out.push(...value.filter((s): s is string => typeof s === "string"));
      return;
    case "action": {
      const label = (value as { label?: unknown }).label;
      if (typeof label === "string") out.push(label);
      return;
    }
    case "list":
      if (!Array.isArray(value)) return;
      for (const item of value) {
        if (!item || typeof item !== "object") continue;
        for (const inner of field.fields) {
          fieldWords(inner, (item as Record<string, unknown>)[inner.name], out);
        }
      }
      return;
    default:
      return;
  }
}

// A page's words in reading order, a block's fields at a time.
export function blocksText(blocks: readonly Block[]): string {
  const out: string[] = [];
  const walk = (list: readonly Block[]) => {
    for (const block of list) {
      const definition = getBlockDefinition(block.type);
      for (const field of definition?.fields ?? []) {
        fieldWords(field, block.props[field.name], out);
      }
      walk(block.children ?? []);
    }
  };
  walk(blocks);
  return out.filter(Boolean).join("\n");
}

// ── Pictures ─────────────────────────────────────────────────────────────────────────────────

const KIND: Record<string, MediaChoice["kind"]> = {
  image: "image",
  video: "video",
  audio: "audio",
};

// The files the blocks use, which a rewrite keeps, and the library's newest pictures.
export async function helpMedia(blocks: readonly Block[]): Promise<MediaChoice[]> {
  const used = collectMediaIds(blocks);
  const [rendered, library] = await Promise.all([renderMedia(used), designMedia()]);
  const own: MediaChoice[] = Object.values(rendered).map((m) => ({
    id: m.id,
    kind: KIND[m.mimeType.split("/")[0] ?? ""] ?? "document",
    filename: m.filename,
    alt: m.alt,
  }));
  return [...own, ...library.filter((m) => !rendered[m.id])];
}

// What providers take: a picture of a common type, at most 4 MB before base64 (Anthropic's
// limit is 5 MB after it).
const PICTURE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_PICTURE_BYTES = 4 * 1024 * 1024;

export type Picture =
  | { ok: true; image: AiImage; filename: string }
  | { ok: false; status: number; message: string };

// The picture's bytes, read from where it's stored, if the blocks use it.
export async function readPicture(blocks: readonly Block[], mediaId: string): Promise<Picture> {
  if (!collectMediaIds(blocks).includes(mediaId)) {
    return { ok: false, status: 400, message: "That picture isn't on this page." };
  }
  const row = await getMedia(db, mediaId);
  if (!row) return { ok: false, status: 404, message: "That picture was deleted." };
  if (!PICTURE_TYPES.has(row.mimeType)) {
    return {
      ok: false,
      status: 400,
      message: "The assistant can describe JPEG, PNG, WebP and GIF pictures.",
    };
  }
  if (row.sizeBytes > MAX_PICTURE_BYTES) {
    return {
      ok: false,
      status: 400,
      message: "This picture is over 4 MB, too large to send to the assistant.",
    };
  }
  const storage = await storageOfFile(row.storage);
  if (!storage.ok) return { ok: false, status: 503, message: storageProblem(storage.reason) };
  const stream = await storage.storage.get(row.storageKey);
  if (!stream) return { ok: false, status: 404, message: "The picture's file is missing." };
  const bytes = Buffer.from(await new Response(stream).arrayBuffer());
  return {
    ok: true,
    image: { mediaType: row.mimeType as AiImage["mediaType"], data: bytes.toString("base64") },
    filename: row.filename,
  };
}
