import type { MediaStorageKind } from "@sitebuilder/schema";

// A place files are kept (design §9): the server's disk or an S3-compatible bucket.

// Inclusive byte positions, as in an HTTP Range header.
export interface ByteRange {
  start: number;
  end: number;
}

export type ProbeResult =
  | { ok: true }
  | { ok: false; step: "write" | "read" | "delete"; message: string };

export interface MediaStorage {
  readonly kind: MediaStorageKind;
  put(key: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>;
  // The file's bytes, or only the range asked for. null when there's no such file.
  get(key: string, range?: ByteRange): Promise<ReadableStream<Uint8Array> | null>;
  // Removing a file that isn't there is not an error.
  delete(key: string): Promise<void>;
  // Writes, reads back and removes a small test file, and says which step failed.
  probe(): Promise<ProbeResult>;
}

// A failure talking to storage. The message names what failed, never a credential.
export class StorageError extends Error {
  override readonly name = "StorageError";
}
