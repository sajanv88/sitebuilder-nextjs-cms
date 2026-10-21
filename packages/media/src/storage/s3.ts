// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { isStorageKey } from "../keys";
import { type ByteRange, type MediaStorage, type ProbeResult, StorageError } from "./types";

// An S3-compatible bucket: MinIO, Cloudflare R2, AWS S3 and the like. Requests are signed with
// aws4fetch (decisions #53) and sent with fetch.

export interface S3Config {
  endpoint: string; // https://host[:port], no trailing slash
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  // https://host/bucket/key, which MinIO needs, instead of https://bucket.host/key.
  pathStyle: boolean;
}

const WRITE_TIMEOUT_MS = 60_000;

export interface S3Options {
  // For tests; the platform's fetch otherwise.
  fetch?: typeof fetch;
}

export function s3Storage(config: S3Config, options: S3Options = {}): MediaStorage {
  const send = options.fetch ?? fetch;
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
  });

  const urlFor = (objectKey: string): string => {
    const path = objectKey.split("/").map(encodeURIComponent).join("/");
    if (config.pathStyle) return `${config.endpoint}/${encodeURIComponent(config.bucket)}/${path}`;
    const endpoint = new URL(config.endpoint);
    return `${endpoint.protocol}//${config.bucket}.${endpoint.host}/${path}`;
  };

  const checkedUrl = (key: string): string => {
    if (!isStorageKey(key)) throw new StorageError("Not a storage key");
    return urlFor(key);
  };

  // Writes and the probe give up after a while, so a wrong endpoint doesn't hang a request.
  // Reads don't: a long video streams for as long as it plays.
  async function request(url: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
    const signed = await client.sign(url, init);
    try {
      return await send(signed, timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined);
    } catch (error) {
      const host = new URL(url).host;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new StorageError(`${host} didn't answer in time`, { cause: error });
      }
      throw new StorageError(`Couldn't reach ${host}`, { cause: error });
    }
  }

  async function failure(action: string, response: Response): Promise<StorageError> {
    return new StorageError(`${action} failed: ${await describe(response)}`);
  }

  async function put(
    url: string,
    bytes: Uint8Array<ArrayBuffer>,
    contentType: string,
  ): Promise<void> {
    const response = await request(
      url,
      {
        method: "PUT",
        body: bytes,
        headers: { "content-type": contentType, "content-length": String(bytes.byteLength) },
      },
      WRITE_TIMEOUT_MS,
    );
    if (!response.ok) throw await failure("Storing the file", response);
    await response.body?.cancel();
  }

  async function remove(url: string): Promise<void> {
    const response = await request(url, { method: "DELETE" }, WRITE_TIMEOUT_MS);
    // S3 answers 204 whether or not the object existed.
    if (!response.ok && response.status !== 404) throw await failure("Deleting the file", response);
    await response.body?.cancel();
  }

  return {
    kind: "s3",

    put: (key, bytes, contentType) => put(checkedUrl(key), bytes, contentType),

    async get(key, range?: ByteRange) {
      const headers: Record<string, string> = range
        ? { range: `bytes=${range.start}-${range.end}` }
        : {};
      const response = await request(checkedUrl(key), { method: "GET", headers });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok || !response.body) throw await failure("Reading the file", response);
      return response.body;
    },

    delete: (key) => remove(checkedUrl(key)),

    async probe(): Promise<ProbeResult> {
      const url = urlFor(`.sitebuilder-probe/${randomUUID()}`);
      const text = `probe ${new Date().toISOString()}`;
      try {
        await put(url, new TextEncoder().encode(text), "text/plain");
      } catch (error) {
        return { ok: false, step: "write", message: messageOf(error) };
      }
      try {
        const response = await request(url, { method: "GET" }, WRITE_TIMEOUT_MS);
        if (!response.ok) return { ok: false, step: "read", message: await describe(response) };
        if ((await response.text()) !== text) {
          return { ok: false, step: "read", message: "The file read back differs" };
        }
      } catch (error) {
        return { ok: false, step: "read", message: messageOf(error) };
      }
      try {
        await remove(url);
      } catch (error) {
        return { ok: false, step: "delete", message: messageOf(error) };
      }
      return { ok: true };
    },
  };
}

// "403 AccessDenied", from S3's XML error body when there is one.
async function describe(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  const code = /<Code>([^<]{1,80})<\/Code>/.exec(body)?.[1];
  return code ? `${response.status} ${code}` : `HTTP ${response.status}`;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";
