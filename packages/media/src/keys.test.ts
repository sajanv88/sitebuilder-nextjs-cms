// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, test } from "vitest";
import { isStorageKey, publicFileUrl, sanitizeFilename, storageKey } from "./keys";
import { parseRange } from "./range";
import { publicFilesBase } from "./resolve";

describe("public file addresses (decisions #151)", () => {
  const KEY = "2026/10/0b8f8a8e-6c1e-4c3f-9a1d-2f6f0c1d2e3f-tour.mp4";
  const video = { storageKey: KEY, storage: "s3" as const, private: false, mimeType: "video/mp4" };
  const BASE = "https://files.example.com";

  test("link a public video or PDF in S3 straight to the public address", () => {
    expect(publicFileUrl(video, BASE)).toBe(`${BASE}/${KEY}`);
    expect(publicFileUrl({ ...video, mimeType: "application/pdf" }, BASE)).toBe(`${BASE}/${KEY}`);
  });

  test("keep pictures, fonts, private files, disk files and no address on /media", () => {
    for (const file of [
      { ...video, mimeType: "image/jpeg" },
      { ...video, mimeType: "font/woff2" },
      { ...video, private: true },
      { ...video, storage: "local" as const },
    ]) {
      expect(publicFileUrl(file, BASE)).toBe(`/media/${KEY}`);
    }
    expect(publicFileUrl(video, null)).toBe(`/media/${KEY}`);
  });

  test("come from the saved S3 storage, else the environment's S3_PUBLIC_URL", () => {
    const env = { MEDIA_STORAGE: "s3", S3_PUBLIC_URL: "https://cdn.example.com/" } as never;
    expect(publicFilesBase({ settings: undefined, env })).toBe("https://cdn.example.com");
    expect(publicFilesBase({ settings: { driver: "local" }, env })).toBeNull();
    expect(
      publicFilesBase({
        settings: {
          driver: "s3",
          endpoint: "https://s3.example.com",
          region: "auto",
          bucket: "b",
          accessKeyId: "id",
          secret: { iv: "a", tag: "b", data: "c" },
          pathStyle: true,
          publicUrl: "https://files.example.com",
        },
        env,
      }),
    ).toBe("https://files.example.com");
  });
});

describe("sanitizeFilename", () => {
  test("folds accents, lowercases, and keeps one extension", () => {
    expect(sanitizeFilename("Café Photo (1).JPG")).toBe("cafe-photo-1.jpg");
    expect(sanitizeFilename("....etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("report..final..pdf")).toBe("report.final.pdf");
    expect(sanitizeFilename("???")).toBe("file");
    expect(sanitizeFilename(".hidden")).toBe("hidden");
    expect(sanitizeFilename(`${"a".repeat(300)}.png`)).toHaveLength(99);
  });
});

describe("storageKey", () => {
  test("is yyyy/mm/<uuid>-<name>, in UTC, and passes the key check", () => {
    const key = storageKey(
      "Hero Image.webp",
      new Date("2026-10-31T23:30:00-02:00"),
      "6f1c8a52-0b7e-4d0a-9a5e-0c3f2b1d4e5a",
    );
    expect(key).toBe("2026/11/6f1c8a52-0b7e-4d0a-9a5e-0c3f2b1d4e5a-hero-image.webp");
    expect(isStorageKey(key)).toBe(true);
    expect(isStorageKey(storageKey("x.png"))).toBe(true);
  });

  test("the key check refuses paths that could leave the folder", () => {
    for (const bad of [
      "../2026/11/x",
      "2026/11/../../etc/passwd",
      "/2026/11/6f1c8a52-0b7e-4d0a-9a5e-0c3f2b1d4e5a-a.png",
      "2026/11/6f1c8a52-0b7e-4d0a-9a5e-0c3f2b1d4e5a-a/b.png",
      "2026/11/not-a-uuid-a.png",
    ]) {
      expect(isStorageKey(bad), bad).toBe(false);
    }
  });
});

describe("parseRange", () => {
  test("one range, open-ended, or the last bytes", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  test("no header or several ranges is the whole file; past the end is unsatisfiable", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 1000)).toBe("unsatisfiable");
  });
});
