import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { MediaListQuery } from "./media";
import { MediaStorageInput, MediaStorageSettings, S3Endpoint } from "./settings";

const s3 = {
  driver: "s3",
  endpoint: "https://minio.example.ts.net/",
  region: "us-east-1",
  bucket: "site-media",
  accessKeyId: "AKIAEXAMPLE",
  pathStyle: true,
};

describe("S3Endpoint", () => {
  test("takes an https address and drops a trailing slash", () => {
    expect(v.parse(S3Endpoint, "https://minio.example.ts.net/")).toBe(
      "https://minio.example.ts.net",
    );
    expect(v.parse(S3Endpoint, "https://r2.example.com:8443")).toBe("https://r2.example.com:8443");
  });

  test("refuses plain http, paths, and link-local or metadata addresses", () => {
    for (const bad of [
      "http://minio.example.com",
      "https://minio.example.com/bucket",
      "https://minio.example.com/?x=1",
      "https://169.254.169.254",
      "https://169.254.169.254:80",
      "https://[fe80::1]",
      "https://[fd00:ec2::254]",
      "https://metadata.google.internal",
      "https://user@minio.example.com",
      "not a url",
    ]) {
      expect(v.safeParse(S3Endpoint, bad).success, bad).toBe(false);
    }
  });
});

describe("MediaStorageInput", () => {
  test("the environment, the disk, or S3 with an optional secret", () => {
    expect(v.safeParse(MediaStorageInput, { driver: "environment" }).success).toBe(true);
    expect(v.safeParse(MediaStorageInput, { driver: "local" }).success).toBe(true);
    expect(v.safeParse(MediaStorageInput, s3).success).toBe(true);
    expect(v.safeParse(MediaStorageInput, { ...s3, secret: "s3cr3t/with+chars" }).success).toBe(
      true,
    );
  });

  test("bucket names follow S3's rules", () => {
    for (const bucket of ["ab", "Has-Caps", "-starts-with-hyphen", "has space"]) {
      expect(v.safeParse(MediaStorageInput, { ...s3, bucket }).success, bucket).toBe(false);
    }
  });
});

describe("MediaStorageSettings", () => {
  test("stores the secret sealed, never as text", () => {
    const sealed = { iv: "aXY", tag: "dGFn", data: "ZGF0YQ" };
    expect(v.safeParse(MediaStorageSettings, { ...s3, secret: sealed }).success).toBe(true);
    expect(v.safeParse(MediaStorageSettings, { ...s3, secret: "plain" }).success).toBe(false);
    expect(v.safeParse(MediaStorageSettings, { driver: "environment" }).success).toBe(false);
  });
});

describe("MediaListQuery", () => {
  test("falls back to defaults for values it doesn't accept", () => {
    const defaults = { kind: "all", page: 1, size: 20, q: "", month: "", view: "grid" };
    expect(v.parse(MediaListQuery, {})).toEqual(defaults);
    expect(
      v.parse(MediaListQuery, {
        kind: "audio",
        page: "-1",
        size: "7",
        month: "2026-13",
        view: "table",
      }),
    ).toEqual(defaults);
    expect(v.parse(MediaListQuery, { month: "2026-10", view: "list" })).toMatchObject({
      month: "2026-10",
      view: "list",
    });
    expect(v.parse(MediaListQuery, { kind: "image", page: "3", q: " cat " })).toMatchObject({
      kind: "image",
      page: 3,
      q: "cat",
    });
  });
});
