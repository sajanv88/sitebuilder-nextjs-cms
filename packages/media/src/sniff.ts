// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { MediaType } from "@sitebuilder/schema";

// The type of a file, from its first bytes (design §4.2). The name and the browser's header are
// never trusted: a script renamed photo.jpg is refused here. SVG is never accepted.

const ascii = (bytes: Uint8Array, at: number, text: string): boolean =>
  [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0));

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
  signature.every((byte, i) => bytes[i] === byte);

// ISO base media files (MP4, AVIF) start with a box whose type is "ftyp", then a brand.
function isoBrand(bytes: Uint8Array): string | null {
  if (!ascii(bytes, 4, "ftyp")) return null;
  return String.fromCharCode(...bytes.subarray(8, 12));
}

const AVIF_BRANDS = new Set(["avif", "avis"]);
const MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
]);

// Needs at least the first 16 bytes; fewer can't be any of these.
export function sniffType(bytes: Uint8Array): MediaType | null {
  if (bytes.length < 16) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a")) return "image/gif";
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";
  if (ascii(bytes, 0, "%PDF-")) return "application/pdf";
  // WOFF 2.0's signature (W3C WOFF2 §3). WOFF 1 and bare TTF/OTF aren't taken: WOFF2 is what
  // every browser the site supports reads, and the smallest.
  if (ascii(bytes, 0, "wOF2")) return "font/woff2";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    // Matroska and WebM share this header; the doctype names which one it is.
    const head = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 64)));
    return head.includes("webm") ? "video/webm" : null;
  }
  const brand = isoBrand(bytes);
  if (brand && AVIF_BRANDS.has(brand)) return "image/avif";
  if (brand && MP4_BRANDS.has(brand)) return "video/mp4";
  return null;
}
