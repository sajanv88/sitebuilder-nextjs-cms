import type { Env, MediaStorageKind, MediaStorageSettings } from "@sitebuilder/schema";
import { openSecret } from "./secrets";
import { diskStorage } from "./storage/local";
import { type S3Options, s3Storage } from "./storage/s3";
import type { MediaStorage } from "./storage/types";

// Which storage to use (decisions #45). An admin's choice in Settings → Media storage wins; with
// none saved, the environment decides (MEDIA_STORAGE, MEDIA_LOCAL_DIR, S3_*), as design §9 says.

export interface StorageSources {
  // The `media` settings row, or undefined when none is saved.
  settings: MediaStorageSettings | undefined;
  env: Env;
  options?: S3Options;
}

export type StorageResult =
  | { ok: true; storage: MediaStorage; from: "settings" | "environment" }
  // secret-unreadable: the saved S3 secret was sealed under another AUTH_SECRET.
  // not-configured: no S3 settings anywhere, for a file stored in S3 earlier.
  | { ok: false; reason: "secret-unreadable" | "not-configured" };

function fromSettings(settings: MediaStorageSettings, src: StorageSources): StorageResult {
  if (settings.driver === "local") {
    return { ok: true, storage: diskStorage(src.env.MEDIA_LOCAL_DIR), from: "settings" };
  }
  const secretAccessKey = openSecret(settings.secret, src.env.AUTH_SECRET);
  if (secretAccessKey === null) return { ok: false, reason: "secret-unreadable" };
  const storage = s3Storage(
    {
      endpoint: settings.endpoint,
      region: settings.region,
      bucket: settings.bucket,
      accessKeyId: settings.accessKeyId,
      secretAccessKey,
      pathStyle: settings.pathStyle,
    },
    src.options,
  );
  return { ok: true, storage, from: "settings" };
}

function fromEnvironment(src: StorageSources): StorageResult {
  const { env } = src;
  if (env.MEDIA_STORAGE === "local") {
    return { ok: true, storage: diskStorage(env.MEDIA_LOCAL_DIR), from: "environment" };
  }
  const storage = s3Storage(
    {
      endpoint: env.S3_ENDPOINT.replace(/\/+$/, ""),
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      pathStyle: true,
    },
    src.options,
  );
  return { ok: true, storage, from: "environment" };
}

// Where a new upload goes.
export function uploadStorage(src: StorageSources): StorageResult {
  return src.settings ? fromSettings(src.settings, src) : fromEnvironment(src);
}

// Where an existing file is read from or deleted, by the storage its row names. Files on disk
// stay readable after a switch to S3 (decisions #48).
export function storageFor(kind: MediaStorageKind, src: StorageSources): StorageResult {
  if (kind === "local") {
    const from = src.settings?.driver === "local" ? "settings" : "environment";
    return { ok: true, storage: diskStorage(src.env.MEDIA_LOCAL_DIR), from };
  }
  if (src.settings?.driver === "s3") return fromSettings(src.settings, src);
  if (src.env.MEDIA_STORAGE === "s3") return fromEnvironment(src);
  return { ok: false, reason: "not-configured" };
}

// What the environment says, for the Settings screen. Never a key or a secret.
export type EnvironmentStorage =
  | { driver: "local"; dir: string }
  | { driver: "s3"; endpoint: string; region: string; bucket: string };

export function describeEnvironment(env: Env): EnvironmentStorage {
  return env.MEDIA_STORAGE === "local"
    ? { driver: "local", dir: env.MEDIA_LOCAL_DIR }
    : { driver: "s3", endpoint: env.S3_ENDPOINT, region: env.S3_REGION, bucket: env.S3_BUCKET };
}
