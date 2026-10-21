// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { can } from "@sitebuilder/auth";
import { createTerm, db, deleteTerm, updateTerm } from "@sitebuilder/db";
import { TAXONOMIES, TermInput, Uuid } from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { invalidate } from "@/server/invalidate";

// The Categories and Tags screens (design §4.3). Making and renaming terms is term.create and
// term.update; deleting is term.delete (§6.1).

export interface TermFormState {
  result: "idle" | "saved" | "invalid" | "failed";
  message?: string;
  errors?: { name?: string; slug?: string };
  values: { name: string; slug: string };
  savedAt?: number;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.slice(0, 200) : "";
}

const Meta = v.object({
  id: v.union([v.literal(""), Uuid]),
  taxonomy: v.picklist(TAXONOMIES),
});

export async function saveTerm(_: TermFormState, form: FormData): Promise<TermFormState> {
  const values = { name: text(form, "name"), slug: text(form, "slug") };
  const fail = (
    result: TermFormState["result"],
    message: string,
    errors?: TermFormState["errors"],
  ): TermFormState => ({ result, message, values, ...(errors ? { errors } : {}) });

  const viewer = await getViewer();
  if (!viewer) return fail("failed", "Your session has ended. Sign in again.");
  const meta = v.safeParse(Meta, { id: form.get("id"), taxonomy: form.get("taxonomy") });
  if (!meta.success) return fail("failed", "The form was incomplete. Reload the page.");
  const { id, taxonomy } = meta.output;
  if (!can(viewer, id ? "term.update" : "term.create")) {
    return fail("failed", "You can't change categories and tags.");
  }

  const input = v.safeParse(TermInput, values);
  if (!input.success) {
    const nested = v.flatten<typeof TermInput>(input.issues).nested ?? {};
    return fail("invalid", "Check the fields marked below.", {
      ...(nested.name?.[0] ? { name: nested.name[0] } : {}),
      ...(nested.slug?.[0] ? { slug: nested.slug[0] } : {}),
    });
  }

  const result = id
    ? await updateTerm(db, { id, ...input.output })
    : await createTerm(db, { taxonomy, ...input.output });
  if (!result.ok) {
    return result.error === "slug-taken"
      ? fail("invalid", "Check the fields marked below.", {
          slug: `Another ${taxonomy} has that slug. Choose another, or leave it empty.`,
        })
      : fail("failed", "It no longer exists. Reload the page.");
  }
  invalidate("saveTerm");
  return {
    result: "saved",
    message: id ? `Saved ${result.term.name}.` : `Added ${result.term.name}.`,
    values: { name: result.term.name, slug: result.term.slug },
    savedAt: Date.now(),
  };
}

export async function removeTerm(
  id: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getViewer();
  const parsed = v.safeParse(Uuid, id);
  if (!viewer || !parsed.success || !can(viewer, "term.delete")) {
    return { ok: false, error: "It couldn't be deleted." };
  }
  const result = await deleteTerm(db, parsed.output);
  if (!result.ok) return { ok: false, error: "It no longer exists." };
  invalidate("removeTerm");
  return { ok: true };
}
