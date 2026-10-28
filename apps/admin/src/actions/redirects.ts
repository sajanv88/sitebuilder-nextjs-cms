// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { can } from "@sitebuilder/auth";
import { db, deleteRedirect, saveRedirect } from "@sitebuilder/db";
import { RedirectInput } from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { invalidate } from "@/server/invalidate";

// The Redirects screen (decisions #145): add, change and remove a redirect. Admins and editors
// (redirect.manage).

export type RedirectFormValues = { original: string; from: string; to: string; status: string };

export interface RedirectFormState {
  result: "idle" | "saved" | "invalid" | "failed";
  message?: string;
  errors?: Partial<Record<"from" | "to" | "status", string>>;
  values: RedirectFormValues;
  savedAt?: number;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.slice(0, 2100) : "";
}

const REFUSED = {
  "entry-there": {
    field: "from",
    message: "A page or post is at that address, and it comes first. Move it, or choose another.",
  },
  taken: { field: "from", message: "Another redirect starts at that address. Change that one." },
  loop: {
    field: "to",
    message: "That address redirects back here: visitors would go round in a loop.",
  },
  "not-found": { field: null, message: "That redirect was removed meanwhile. Reload the page." },
} as const;

export async function saveRedirectForm(
  _: RedirectFormState,
  form: FormData,
): Promise<RedirectFormState> {
  const values: RedirectFormValues = {
    original: text(form, "original"),
    from: text(form, "from"),
    to: text(form, "to"),
    status: text(form, "status") || "301",
  };
  const fail = (
    result: RedirectFormState["result"],
    message: string,
    errors?: RedirectFormState["errors"],
  ): RedirectFormState => ({ result, message, values, ...(errors ? { errors } : {}) });

  const viewer = await getViewer();
  if (!viewer) return fail("failed", "Your session has ended. Sign in again.");
  if (!can(viewer, "redirect.manage")) return fail("failed", "You can't change redirects.");

  const input = v.safeParse(RedirectInput, values);
  if (!input.success) {
    const nested = v.flatten<typeof RedirectInput>(input.issues).nested ?? {};
    return fail("invalid", "Check the fields marked below.", {
      ...(nested.from?.[0] ? { from: nested.from[0] } : {}),
      ...(nested.to?.[0] ? { to: nested.to[0] } : {}),
      ...(nested.status?.[0] ? { status: nested.status[0] } : {}),
    });
  }
  const result = await saveRedirect(db, input.output);
  if (!result.ok) {
    const refused = REFUSED[result.error];
    return refused.field
      ? fail("invalid", "Check the fields marked below.", { [refused.field]: refused.message })
      : fail("failed", refused.message);
  }
  invalidate("saveRedirectForm");
  return {
    result: "saved",
    message: values.original ? "Redirect saved." : "Redirect added.",
    values,
    savedAt: Date.now(),
  };
}

export async function removeRedirect(
  from: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getViewer();
  // Any stored address, a moved page's too, which the form's own rules may not allow.
  const parsed = v.safeParse(v.pipe(v.string(), v.minLength(2), v.maxLength(2048)), from);
  if (!viewer || !parsed.success || !can(viewer, "redirect.manage")) {
    return { ok: false, error: "It couldn't be removed." };
  }
  if (!(await deleteRedirect(db, parsed.output))) {
    return { ok: false, error: "It was already removed." };
  }
  invalidate("removeRedirect");
  return { ok: true };
}
