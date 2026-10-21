// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { can } from "@sitebuilder/auth";
import { createMedia, db } from "@sitebuilder/db";
import { readDimensions, StorageError, sniffType, storageKey } from "@sitebuilder/media";
import { MEDIA_TYPES } from "@sitebuilder/schema";
import { env } from "@/env";
import { currentUploadStorage, mediaUrl, storageProblem } from "@/server/media";
import { errorResponse, guardRequest } from "@/server/route-guard";

// Uploads one file to the media library (design §4.2). A route handler and not a Server Action:
// files run to MEDIA_MAX_BYTES (25 MiB by default) and actions take 1 MB unless raised; it sits
// outside the proxy's matcher, so its body isn't buffered there either (decisions #52).
//
// In order: same origin and a session, media.upload, the size, the type from the file's own
// bytes, then storage, then the row. If the row can't be written, the stored file is removed.

// Room for the multipart boundaries and headers around the file.
const MULTIPART_OVERHEAD = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRequest(request);
  if (!guard.ok) return guard.response;
  const { viewer } = guard;
  if (!can(viewer, "media.upload")) return errorResponse(403, "You can't upload files.");

  const maxBytes = env().MEDIA_MAX_BYTES;
  const tooLarge = `Files can be at most ${Math.floor(maxBytes / (1024 * 1024))} MB.`;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes + MULTIPART_OVERHEAD) return errorResponse(413, tooLarge);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return errorResponse(400, "Send the file as multipart form data, under the name file.");
  }
  if (!(file instanceof File)) return errorResponse(400, "Choose a file to upload.");
  if (file.size === 0) return errorResponse(400, "That file is empty.");
  if (file.size > maxBytes) return errorResponse(413, tooLarge);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type) {
    return errorResponse(
      415,
      "That kind of file can't be uploaded. Use JPEG, PNG, GIF, WebP, AVIF, MP4, WebM or PDF.",
    );
  }

  const target = await currentUploadStorage();
  if (!target.ok) return errorResponse(503, storageProblem(target.reason));

  const key = storageKey(file.name);
  try {
    await target.storage.put(key, bytes, type);
  } catch (error) {
    console.error("media upload: storing failed", error);
    const detail = error instanceof StorageError ? ` ${error.message}.` : "";
    return errorResponse(502, `The file couldn't be stored.${detail}`);
  }

  const dimensions = readDimensions(bytes, type);
  try {
    const created = await createMedia(db, {
      filename: file.name.slice(0, 255) || "file",
      mimeType: type,
      sizeBytes: bytes.byteLength,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      alt: null,
      storageKey: key,
      storage: target.storage.kind,
      uploadedBy: viewer.id,
    });
    return Response.json(
      {
        ok: true,
        media: {
          id: created.id,
          filename: file.name,
          mimeType: type,
          kind: MEDIA_TYPES[type],
          url: mediaUrl(key),
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          sizeBytes: bytes.byteLength,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await target.storage.delete(key).catch(() => undefined);
    throw error;
  }
}
