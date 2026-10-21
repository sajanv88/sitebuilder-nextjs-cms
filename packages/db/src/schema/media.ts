import { index, integer, snakeCase, text, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { createdAt, id } from "./columns";

// Uploaded files (design §4, §4.2). The file lives in storage; this row describes it.
export const media = snakeCase.table(
  "media",
  {
    id: id(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    width: integer(),
    height: integer(),
    alt: text(),
    // yyyy/mm/<uuid>-<sanitised-filename>
    storageKey: text().notNull(),
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
