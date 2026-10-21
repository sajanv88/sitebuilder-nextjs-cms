import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Env, MediaStorageSettings } from "@sitebuilder/schema";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { storageKey } from "./keys";
import { storageFor, uploadStorage } from "./resolve";
import { sealSecret } from "./secrets";
import { diskStorage } from "./storage/local";
import { s3Storage } from "./storage/s3";
import { StorageError } from "./storage/types";

const text = async (stream: ReadableStream<Uint8Array> | null): Promise<string | null> =>
  stream ? new Response(stream).text() : null;

describe("diskStorage", () => {
  let dir = "";
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sitebuilder-media-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("puts, reads whole or in part, and deletes", async () => {
    const storage = diskStorage(dir);
    const key = storageKey("hello.txt");
    await storage.put(key, new TextEncoder().encode("hello world"), "text/plain");
    expect(await text(await storage.get(key))).toBe("hello world");
    expect(await text(await storage.get(key, { start: 6, end: 10 }))).toBe("world");
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    // Already gone: not an error.
    await storage.delete(key);
  });

  test("refuses keys that aren't storage keys", async () => {
    const storage = diskStorage(dir);
    await expect(storage.put("../escape.txt", new Uint8Array(1), "text/plain")).rejects.toThrow(
      StorageError,
    );
    await expect(storage.get("2026/11/../../x")).rejects.toThrow(StorageError);
  });

  test("probe writes, reads and removes a test file", async () => {
    expect(await diskStorage(dir).probe()).toEqual({ ok: true });
    const left = (await readdir(dir)).filter((name) => name.startsWith(".sitebuilder-probe"));
    expect(left).toEqual([]);
  });
});

// A stand-in for S3 that keeps objects in a map and records each request.
function fakeS3(options: { fail?: { method: string; status: number; code: string } } = {}) {
  const objects = new Map<string, string>();
  const requests: Request[] = [];
  const handler = async (input: Request | string | URL): Promise<Response> => {
    const request = input as Request;
    requests.push(request);
    const { pathname } = new URL(request.url);
    if (options.fail && request.method === options.fail.method) {
      return new Response(`<Error><Code>${options.fail.code}</Code></Error>`, {
        status: options.fail.status,
      });
    }
    if (request.method === "PUT") {
      objects.set(pathname, await request.text());
      return new Response(null, { status: 200 });
    }
    if (request.method === "DELETE") {
      objects.delete(pathname);
      return new Response(null, { status: 204 });
    }
    const body = objects.get(pathname);
    if (body === undefined) {
      return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    }
    const range = /bytes=(\d+)-(\d+)/.exec(request.headers.get("range") ?? "");
    return range
      ? new Response(body.slice(Number(range[1]), Number(range[2]) + 1), { status: 206 })
      : new Response(body, { status: 200 });
  };
  return { fetch: handler as typeof fetch, objects, requests };
}

const config = {
  endpoint: "https://minio.example.ts.net",
  region: "us-east-1",
  bucket: "site-media",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG",
  pathStyle: true,
};

describe("s3Storage", () => {
  test("signed path-style requests: put, ranged get, delete", async () => {
    const s3 = fakeS3();
    const storage = s3Storage(config, { fetch: s3.fetch });
    const key = storageKey("photo.jpg");
    await storage.put(key, new TextEncoder().encode("0123456789"), "image/jpeg");

    const put = s3.requests[0];
    expect(put?.url).toBe(`https://minio.example.ts.net/site-media/${key}`);
    expect(put?.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, /,
    );
    expect(put?.headers.get("authorization")).not.toContain(config.secretAccessKey);
    expect(put?.headers.get("content-type")).toBe("image/jpeg");

    expect(await text(await storage.get(key, { start: 2, end: 4 }))).toBe("234");
    expect(s3.requests[1]?.headers.get("range")).toBe("bytes=2-4");
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  test("virtual-host addressing puts the bucket in the host", async () => {
    const s3 = fakeS3();
    const key = storageKey("a.png");
    await s3Storage({ ...config, pathStyle: false }, { fetch: s3.fetch }).put(
      key,
      new Uint8Array(1),
      "image/png",
    );
    expect(s3.requests[0]?.url).toBe(`https://site-media.minio.example.ts.net/${key}`);
  });

  test("errors name the status and S3's code, never the secret", async () => {
    const s3 = fakeS3({ fail: { method: "PUT", status: 403, code: "AccessDenied" } });
    const storage = s3Storage(config, { fetch: s3.fetch });
    const error = await storage
      .put(storageKey("a.png"), new Uint8Array(1), "image/png")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as Error).message).toBe("Storing the file failed: 403 AccessDenied");
  });

  test("probe says which step failed", async () => {
    expect(await s3Storage(config, { fetch: fakeS3().fetch }).probe()).toEqual({ ok: true });
    const denied = fakeS3({ fail: { method: "PUT", status: 403, code: "AccessDenied" } });
    expect(await s3Storage(config, { fetch: denied.fetch }).probe()).toEqual({
      ok: false,
      step: "write",
      message: "Storing the file failed: 403 AccessDenied",
    });
    const noDelete = fakeS3({ fail: { method: "DELETE", status: 403, code: "AccessDenied" } });
    expect(await s3Storage(config, { fetch: noDelete.fetch }).probe()).toMatchObject({
      ok: false,
      step: "delete",
    });
  });
});

describe("uploadStorage and storageFor", () => {
  const authSecret = "z".repeat(32);
  const base = {
    DATABASE_URL: "postgres://x@y/z",
    AUTH_SECRET: authSecret,
    SITE_URL: "http://localhost:3000",
    MEDIA_MAX_BYTES: 1,
    MEDIA_LOCAL_DIR: "/data/media",
  };
  const localEnv = { ...base, MEDIA_STORAGE: "local" } as Env;
  const s3Env = {
    ...base,
    MEDIA_STORAGE: "s3",
    S3_ENDPOINT: "https://env.example.com/",
    S3_BUCKET: "env-bucket",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "id",
    S3_SECRET_ACCESS_KEY: "secret",
  } as Env;
  const s3Settings: MediaStorageSettings = {
    driver: "s3",
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secret: sealSecret(config.secretAccessKey, authSecret),
    pathStyle: true,
  };

  test("saved settings win; without them the environment decides", () => {
    expect(uploadStorage({ settings: undefined, env: localEnv })).toMatchObject({
      ok: true,
      from: "environment",
      storage: { kind: "local" },
    });
    expect(uploadStorage({ settings: s3Settings, env: localEnv })).toMatchObject({
      ok: true,
      from: "settings",
      storage: { kind: "s3" },
    });
    expect(uploadStorage({ settings: { driver: "local" }, env: s3Env })).toMatchObject({
      ok: true,
      from: "settings",
      storage: { kind: "local" },
    });
  });

  test("the saved settings' bucket is the one used", async () => {
    const s3 = fakeS3();
    const result = uploadStorage({
      settings: s3Settings,
      env: s3Env,
      options: { fetch: s3.fetch },
    });
    if (!result.ok) throw new Error("expected storage");
    await result.storage.put(storageKey("a.png"), new Uint8Array(1), "image/png");
    expect(s3.requests[0]?.url).toMatch(/^https:\/\/minio\.example\.ts\.net\/site-media\//);
  });

  test("a secret sealed under another AUTH_SECRET is reported, not used", () => {
    const env = { ...localEnv, AUTH_SECRET: "y".repeat(32) } as Env;
    expect(uploadStorage({ settings: s3Settings, env })).toEqual({
      ok: false,
      reason: "secret-unreadable",
    });
  });

  test("files on disk stay readable after a switch to S3; S3 files need S3 settings", () => {
    expect(storageFor("local", { settings: s3Settings, env: s3Env })).toMatchObject({
      ok: true,
      storage: { kind: "local" },
    });
    expect(storageFor("s3", { settings: undefined, env: s3Env })).toMatchObject({
      ok: true,
      from: "environment",
    });
    expect(storageFor("s3", { settings: { driver: "local" }, env: localEnv })).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });
});
