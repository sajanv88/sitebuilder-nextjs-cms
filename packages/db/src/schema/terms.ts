import { index, pgEnum, primaryKey, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns";
import { entries } from "./entries";

export const taxonomy = pgEnum("taxonomy", ["category", "tag"]);

// Categories and tags: flat, slugs unique within a taxonomy (design §4.3).
export const terms = snakeCase.table(
  "terms",
  {
    id: id(),
    taxonomy: taxonomy().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    // "wp:12" for imported terms, null otherwise.
    sourceRef: text(),
  },
  (t) => [
    uniqueIndex("terms_taxonomy_slug_key").on(t.taxonomy, t.slug),
    uniqueIndex("terms_source_ref_key").on(t.sourceRef),
  ],
);

// Deleting a term removes its links to entries but not the entries.
export const entryTerms = snakeCase.table(
  "entry_terms",
  {
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.termId] }),
    // The primary key covers lookups by entry; archives look up by term.
    index("entry_terms_term_id_idx").on(t.termId),
  ],
);

export type Term = typeof terms.$inferSelect;
export type NewTerm = typeof terms.$inferInsert;
export type Taxonomy = (typeof taxonomy.enumValues)[number];
