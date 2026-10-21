// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, test } from "vitest";
import { parseEnv } from "./env";

const local = {
  DATABASE_URL: "postgres://app:app@127.0.0.1:5432/sitebuilder",
  AUTH_SECRET: "x".repeat(32),
  SITE_URL: "http://localhost:3000",
  MEDIA_STORAGE: "local",
};

const s3 = {
  ...local,
  MEDIA_STORAGE: "s3",
  S3_ENDPOINT: "https://minio.example.ts.net",
  S3_BUCKET: "media",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_PUBLIC_URL: "https://minio.example.ts.net/media",
};

describe("parseEnv", () => {
  test("accepts local storage and applies defaults", () => {
    const result = parseEnv({ ...local, UNRELATED: "ignored" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.MEDIA_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(result.env.MEDIA_LOCAL_DIR).toBe("/data/media");
    expect(result.env).not.toHaveProperty("UNRELATED");
  });

  test("accepts s3 storage with all its variables", () => {
    const result = parseEnv(s3);
    expect(result.ok && result.env.MEDIA_STORAGE === "s3" && result.env.S3_BUCKET).toBe("media");
  });

  test("S3_PUBLIC_URL is optional (files are served at /media/<key>)", () => {
    const { S3_PUBLIC_URL: _unused, ...withoutPublicUrl } = s3;
    expect(parseEnv(withoutPublicUrl).ok).toBe(true);
  });

  test("s3 without its variables names each missing one", () => {
    const result = parseEnv({ ...local, MEDIA_STORAGE: "s3" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("S3_ENDPOINT: Is not set");
    expect(result.message).toContain("S3_SECRET_ACCESS_KEY: Is not set");
  });

  test("names bad and missing variables without echoing values", () => {
    const result = parseEnv({
      ...local,
      AUTH_SECRET: "too-short-secret",
      DATABASE_URL: "mysql://x",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("AUTH_SECRET: Must be at least 32 characters");
    expect(result.message).toContain("DATABASE_URL: Must be a postgres:// URL");
    expect(result.message).not.toContain("too-short-secret");
  });

  test("CLIENT_IP_HEADER is optional, lowercased, and only a header name", () => {
    const unset = parseEnv(local);
    expect(unset.ok && unset.env.CLIENT_IP_HEADER).toBeUndefined();
    const set = parseEnv({ ...local, CLIENT_IP_HEADER: "X-Real-IP" });
    expect(set.ok && set.env.CLIENT_IP_HEADER).toBe("x-real-ip");
    const bad = parseEnv({ ...local, CLIENT_IP_HEADER: "x-real-ip, x-forwarded-for" });
    expect(bad.ok ? "" : bad.message).toContain("CLIENT_IP_HEADER: Must be a header name");
  });

  test("an unknown MEDIA_STORAGE is refused", () => {
    const result = parseEnv({ ...local, MEDIA_STORAGE: "ftp" });
    expect(result.ok ? "" : result.message).toContain('MEDIA_STORAGE: Must be "local" or "s3"');
  });
});
