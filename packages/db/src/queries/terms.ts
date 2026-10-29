// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { archivePath, slugify, type TaxonomyKind, withSuffix } from "@sitebuilder/schema";
import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Executor } from "../executor";
import { entries } from "../schema/entries";
import { redirects } from "../schema/site";
import { entryTerms, terms } from "../schema/terms";
import { isUniqueViolation } from "./errors";
import { getReading } from "./public";

// Categories and tags (design §4.3): flat, slugs unique within a taxonomy. Deleting a term
// removes its links to entries, not the entries. A new slug redirects from the old archive.

export interface TermRow {
  id: string;
  name: string;
  slug: string;
  // Posts that aren't in the trash.
  postCount: number;
}

export async function listTerms(db: Executor, taxonomy: TaxonomyKind): Promise<TermRow[]> {
  return db
    .select({
      id: terms.id,
      name: terms.name,
      slug: terms.slug,
      postCount: count(entries.id),
    })
    .from(terms)
    .leftJoin(entryTerms, eq(entryTerms.termId, terms.id))
    .leftJoin(entries, and(eq(entries.id, entryTerms.entryId), isNull(entries.deletedAt)))
    .where(eq(terms.taxonomy, taxonomy))
    .groupBy(terms.id)
    .orderBy(asc(terms.name), asc(terms.id))
    .limit(1000);
}

export type TermWriteResult =
  | { ok: true; term: { id: string; name: string; slug: string } }
  | { ok: false; error: "slug-taken" | "not-found" };

// A slug left empty is made from the name and made unique with a suffix. A slug that was typed
// is used as it is, or refused when another term of the taxonomy has it.
async function placeSlug(
  db: Executor,
  taxonomy: TaxonomyKind,
  name: string,
  requested: string,
  exceptId: string | null,
): Promise<string | null> {
  const base = requested || slugify(name);
  for (let n = 1; n <= 100; n++) {
    const slug = n === 1 ? base : withSuffix(base, n);
    const [taken] = await db
      .select({ id: terms.id })
      .from(terms)
      .where(
        and(
          eq(terms.taxonomy, taxonomy),
          eq(terms.slug, slug),
          exceptId ? ne(terms.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    if (!taken) return slug;
    if (requested) return null;
  }
  throw new Error(`No free slug for "${base}"`);
}

export async function createTerm(
  db: Executor,
  input: { taxonomy: TaxonomyKind; name: string; slug: string },
): Promise<TermWriteResult> {
  try {
    const slug = await placeSlug(db, input.taxonomy, input.name, input.slug, null);
    if (!slug) return { ok: false, error: "slug-taken" };
    const [term] = await db
      .insert(terms)
      .values({ taxonomy: input.taxonomy, name: input.name, slug })
      .returning({ id: terms.id, name: terms.name, slug: terms.slug });
    if (!term) throw new Error("insert returned no row");
    return { ok: true, term };
  } catch (error) {
    // Another request took the slug between the check and the insert.
    if (isUniqueViolation(error)) return { ok: false, error: "slug-taken" };
    throw error;
  }
}

// A new slug moves the term's archive, so one "/*" redirect from the old one covers it and its
// pages (/blog/category/old/page/2). Redirects to the old archive follow it, so there are no
// chains, and one from the new archive (an earlier move back) would hide it.
async function redirectArchive(
  db: Executor,
  taxonomy: TaxonomyKind,
  from: string,
  to: string,
): Promise<void> {
  const { postsPath } = await getReading(db);
  const fromAll = `${archivePath(postsPath, taxonomy, from)}/*`;
  const toAll = `${archivePath(postsPath, taxonomy, to)}/*`;
  await db.delete(redirects).where(eq(redirects.fromPath, toAll));
  await db.update(redirects).set({ toPath: toAll }).where(eq(redirects.toPath, fromAll));
  await db
    .insert(redirects)
    .values({ fromPath: fromAll, toPath: toAll, status: 301 })
    .onConflictDoUpdate({ target: redirects.fromPath, set: { toPath: toAll, status: 301 } });
}

export async function updateTerm(
  db: Executor,
  input: { id: string; name: string; slug: string },
): Promise<TermWriteResult> {
  try {
    return await db.transaction(async (tx): Promise<TermWriteResult> => {
      const existing = await tx.query.terms.findFirst({
        where: { id: input.id },
        columns: { taxonomy: true, slug: true },
      });
      if (!existing) return { ok: false, error: "not-found" };
      const slug = await placeSlug(tx, existing.taxonomy, input.name, input.slug, input.id);
      if (!slug) return { ok: false, error: "slug-taken" };
      const [term] = await tx
        .update(terms)
        .set({ name: input.name, slug })
        .where(eq(terms.id, input.id))
        .returning({ id: terms.id, name: terms.name, slug: terms.slug });
      if (!term) return { ok: false, error: "not-found" };
      if (slug !== existing.slug) await redirectArchive(tx, existing.taxonomy, existing.slug, slug);
      return { ok: true, term };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "slug-taken" };
    throw error;
  }
}

export async function deleteTerm(db: Executor, id: string): Promise<{ ok: boolean }> {
  const deleted = await db.delete(terms).where(eq(terms.id, id)).returning({ id: terms.id });
  return { ok: deleted.length > 0 };
}

// Replaces an entry's terms of one taxonomy. Ids that aren't terms of that taxonomy are
// ignored, so a form can't attach a tag as a category or a term that was just deleted.
export async function setEntryTerms(
  db: Executor,
  entryId: string,
  taxonomy: TaxonomyKind,
  termIds: readonly string[],
): Promise<void> {
  const existing = db
    .select({ termId: entryTerms.termId })
    .from(entryTerms)
    .innerJoin(terms, eq(terms.id, entryTerms.termId))
    .where(and(eq(entryTerms.entryId, entryId), eq(terms.taxonomy, taxonomy)));
  await db
    .delete(entryTerms)
    .where(and(eq(entryTerms.entryId, entryId), inArray(entryTerms.termId, existing)));

  const unique = [...new Set(termIds)];
  if (unique.length === 0) return;
  const valid = await db
    .select({ id: terms.id })
    .from(terms)
    .where(and(eq(terms.taxonomy, taxonomy), inArray(terms.id, unique)));
  if (valid.length === 0) return;
  await db
    .insert(entryTerms)
    .values(valid.map((term) => ({ entryId, termId: term.id })))
    .onConflictDoNothing();
}

// Every term, for the editor's pickers. Small sites have tens; the limit guards the rest.
export async function listTermOptions(
  db: Executor,
): Promise<{ id: string; name: string; taxonomy: TaxonomyKind }[]> {
  return db
    .select({ id: terms.id, name: terms.name, taxonomy: terms.taxonomy })
    .from(terms)
    .orderBy(asc(terms.name))
    .limit(2000);
}
