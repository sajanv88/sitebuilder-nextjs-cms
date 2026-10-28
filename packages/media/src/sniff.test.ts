// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, test } from "vitest";
import { readDimensions } from "./dimensions";
import { sniffType } from "./sniff";

const bytes = (...parts: (number[] | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") for (const char of part) out.push(char.charCodeAt(0));
    else out.push(...part);
  }
  while (out.length < 32) out.push(0);
  return Uint8Array.from(out);
};

// A real 1×1 PNG and a 3×2 GIF.
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const gif = bytes("GIF89a", [3, 0, 2, 0, 0, 0, 0]);

describe("sniffType", () => {
  test("knows the nine allowed types by their bytes", () => {
    expect(sniffType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffType(png)).toBe("image/png");
    expect(sniffType(gif)).toBe("image/gif");
    expect(sniffType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
    expect(sniffType(bytes([0, 0, 0, 28], "ftypavif"))).toBe("image/avif");
    expect(sniffType(bytes([0, 0, 0, 32], "ftypisom"))).toBe("video/mp4");
    expect(sniffType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], "webm"))).toBe(
      "video/webm",
    );
    expect(sniffType(bytes("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffType(bytes("wOF2\u0000\u0001\u0000\u0000"))).toBe("font/woff2");
    // WOFF 1 isn't taken (decisions #148).
    expect(sniffType(bytes("wOFF\u0000\u0001\u0000\u0000"))).toBeNull();
  });

  test("refuses SVG, HTML, Matroska that isn't WebM, and short files", () => {
    expect(sniffType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffType(bytes("<?xml version='1.0'?><svg"))).toBeNull();
    expect(sniffType(bytes("<!doctype html><script>"))).toBeNull();
    expect(sniffType(bytes([0x1a, 0x45, 0xdf, 0xa3], "matroska"))).toBeNull();
    expect(sniffType(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe("readDimensions", () => {
  test("reads an image's size, and none for other types", () => {
    expect(readDimensions(png, "image/png")).toEqual({ width: 1, height: 1 });
    expect(readDimensions(gif, "image/gif")).toEqual({ width: 3, height: 2 });
    expect(readDimensions(png, "application/pdf")).toBeNull();
    expect(readDimensions(bytes([0xff, 0xd8, 0xff]), "image/jpeg")).toBeNull();
  });
});
