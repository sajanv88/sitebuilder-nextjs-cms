import "server-only";

// Uploaded files (design §4.2, §9): their type from their bytes, their keys, and where they're
// stored. Both zones use it: the admin zone stores and deletes, the site zone serves.

export { readDimensions } from "./dimensions";
export { isStorageKey, KEY_PATTERN, mediaUrl, sanitizeFilename, storageKey } from "./keys";
export { parseRange } from "./range";
export {
  describeEnvironment,
  type EnvironmentStorage,
  type StorageResult,
  type StorageSources,
  storageFor,
  uploadStorage,
} from "./resolve";
export { openSecret, sealSecret } from "./secrets";
export { sniffType } from "./sniff";
export { diskStorage } from "./storage/local";
export { type S3Config, type S3Options, s3Storage } from "./storage/s3";
export {
  type ByteRange,
  type MediaStorage,
  type ProbeResult,
  StorageError,
} from "./storage/types";
