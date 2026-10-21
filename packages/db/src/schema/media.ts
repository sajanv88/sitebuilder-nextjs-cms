// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { MediaStorageKind, MediaType } from "@sitebuilder/schema";
import { index, integer, snakeCase, text, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { createdAt, id } from "./columns";

// Uploaded files (design §4, §4.2). The file lives in storage; this row describes it.
export const media = snakeCase.table(
  "media",
  {
    id: id(),
    filename: text().notNull(),
    // Decided from the file's bytes on upload (packages/media sniffType).
    mimeType: text().$type<MediaType>().notNull(),
    sizeBytes: integer().notNull(),
    width: integer(),
    height: integer(),
    alt: text(),
    // yyyy/mm/<uuid>-<sanitised-filename>
    storageKey: text().notNull(),
    // Where the file went: the server's disk or S3. Switching storage doesn't move files, so
    // each one is read from where it was stored (decisions #48).
    storage: text().$type<MediaStorageKind>().notNull().default("local"),
    // Deleting a user who uploaded files is refused until the files are reassigned or deleted.
    uploadedBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    // "wp:456" for imported files, null otherwise.
    sourceRef: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("media_storage_key_key").on(t.storageKey),
    uniqueIndex("media_source_ref_key").on(t.sourceRef),
    index("media_uploaded_by_idx").on(t.uploadedBy, t.createdAt),
  ],
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
