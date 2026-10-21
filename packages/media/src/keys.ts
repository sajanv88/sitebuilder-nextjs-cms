// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { randomUUID } from "node:crypto";

// Where a file is stored (design §4.2): yyyy/mm/<uuid>-<sanitised-filename>. The uuid makes each
// key unique and unguessable, so a file's address can be cached for good.

export const KEY_PATTERN =
  /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9][a-z0-9._-]{0,99}$/;

// A key from a URL or the database, checked before it touches a disk path or a bucket, so
// "../" and the like never reach storage.
export const isStorageKey = (key: string): boolean => KEY_PATTERN.test(key);

// "Café Photo (1).JPG" → "cafe-photo-1.jpg". Letters folded to ASCII, everything else a hyphen.
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  const stem = (dot > 0 ? cleaned.slice(0, dot) : cleaned).slice(0, 100 - ext.length - 1);
  return `${stem.replace(/[-.]+$/, "") || "file"}${ext}`;
}

export function storageKey(
  filename: string,
  now: Date = new Date(),
  id: string = randomUUID(),
): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${month}/${id}-${sanitizeFilename(filename)}`;
}

// Every file is served by the site zone at /media/<key>, whichever storage holds it
// (decisions #47), so the address is the same on both zones.
export const mediaUrl = (storageKey: string): string => `/media/${storageKey}`;
