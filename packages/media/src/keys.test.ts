import { describe, expect, test } from "vitest";
import { isStorageKey, sanitizeFilename, storageKey } from "./keys";
import { parseRange } from "./range";

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
