import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { isStorageKey } from "../keys";
import { type ByteRange, type MediaStorage, type ProbeResult, StorageError } from "./types";

// Files on the server's disk, under MEDIA_LOCAL_DIR (the media volume in Compose). Each key is
// checked against the key pattern and the resolved path must stay inside the folder.
export function diskStorage(dir: string): MediaStorage {
  const root = path.resolve(dir);

  const fileFor = (key: string): string => {
    if (!isStorageKey(key)) throw new StorageError("Not a storage key");
    const file = path.resolve(root, ...key.split("/"));
    if (!file.startsWith(root + path.sep)) throw new StorageError("Not a storage key");
    return file;
  };

  // Written beside the target and renamed into place, so a reader never sees half a file.
  async function write(file: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.part`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  return {
    kind: "local",

    async put(key, bytes) {
      try {
        await write(fileFor(key), bytes);
      } catch (error) {
        if (error instanceof StorageError) throw error;
        throw new StorageError(`Couldn't write the file to ${root}`, { cause: error });
      }
    },

    async get(key, range?: ByteRange) {
      const file = fileFor(key);
      const stream = createReadStream(file, range ? { start: range.start, end: range.end } : {});
      // Opening is asynchronous: wait for it, so a missing file is null and not a broken stream.
      const opened = await new Promise<boolean>((resolve, reject) => {
        stream.once("open", () => resolve(true));
        stream.once("error", (error: NodeJS.ErrnoException) =>
          error.code === "ENOENT" ? resolve(false) : reject(error),
        );
      });
      if (!opened) return null;
      return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    },

    async delete(key) {
      await rm(fileFor(key), { force: true });
    },

    async probe(): Promise<ProbeResult> {
      const file = path.join(root, `.sitebuilder-probe-${randomUUID()}`);
      const text = `probe ${new Date().toISOString()}`;
      try {
        await write(file, new TextEncoder().encode(text));
      } catch (error) {
        return { ok: false, step: "write", message: describe(error) };
      }
      try {
        if ((await readFile(file, "utf8")) !== text) {
          return { ok: false, step: "read", message: "The file read back differs" };
        }
      } catch (error) {
        return { ok: false, step: "read", message: describe(error) };
      }
      try {
        await rm(file);
      } catch (error) {
        return { ok: false, step: "delete", message: describe(error) };
      }
      return { ok: true };
    },
  };
}

const describe = (error: unknown): string =>
  error instanceof Error && "code" in error ? `${String(error.code)}` : "Unknown error";
