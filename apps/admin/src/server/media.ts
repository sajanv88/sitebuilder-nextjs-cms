import "server-only";
import type { RenderMedia } from "@sitebuilder/blocks";
import { db, getMediaForRender, getSettings } from "@sitebuilder/db";
import {
  mediaUrl,
  type StorageResult,
  type StorageSources,
  storageFor,
  uploadStorage,
} from "@sitebuilder/media";
import type { MediaStorageKind } from "@sitebuilder/schema";
import { env } from "@/env";

// Where files are stored (decisions #45): the saved Settings → Media storage, or the environment.
// Read per call, so a change in Settings applies to the next upload.

export async function storageSources(): Promise<StorageSources> {
  return { settings: await getSettings(db, "media"), env: env() };
}

export async function currentUploadStorage(): Promise<StorageResult> {
  return uploadStorage(await storageSources());
}

export async function storageOfFile(kind: MediaStorageKind): Promise<StorageResult> {
  return storageFor(kind, await storageSources());
}

// What to tell someone when storage can't be used, without a credential in it.
export function storageProblem(reason: "secret-unreadable" | "not-configured"): string {
  return reason === "secret-unreadable"
    ? "The saved storage key can't be read (the server's AUTH_SECRET changed). An admin needs to enter it again in Settings → Media storage."
    : "This file is stored in S3, but no S3 storage is set up any more. An admin can set it up in Settings → Media storage.";
}

export { mediaUrl };

// The files a list of blocks uses, ready for the renderer.
export async function renderMedia(ids: readonly string[]): Promise<Record<string, RenderMedia>> {
  const rows = await getMediaForRender(db, ids);
  return Object.fromEntries(
    [...rows.values()].map((row) => [
      row.id,
      {
        id: row.id,
        url: mediaUrl(row.storageKey),
        mimeType: row.mimeType,
        width: row.width,
        height: row.height,
        alt: row.alt,
        filename: row.filename,
        sizeBytes: row.sizeBytes,
      },
    ]),
  );
}
