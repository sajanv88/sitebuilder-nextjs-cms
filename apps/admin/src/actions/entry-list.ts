"use server";

import { db, deleteEntry, restoreEntry, trashEntry } from "@sitebuilder/db";
import { Uuid } from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { authorizeEntry } from "@/server/entries";

// Actions on rows of the Posts and Pages lists. Each id is checked on its own: a request can
// carry any ids, whatever the list showed. `trash` covers trashing and restoring (§6.1);
// `delete` is permanent and works only from the trash.

export type ListActionResult =
  | { ok: true; done: number; skipped: number; notes: string[] }
  | { ok: false; error: string };

const Ids = v.pipe(v.array(Uuid), v.minLength(1), v.maxLength(100));

type Outcome = { ok: boolean; note?: string };

async function forEach(
  input: unknown,
  verb: "trash" | "delete",
  run: (id: string) => Promise<Outcome>,
): Promise<ListActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Your session has ended. Sign in again." };
  const ids = v.safeParse(Ids, input);
  if (!ids.success) return { ok: false, error: "Nothing to change." };

  let done = 0;
  const notes: string[] = [];
  for (const id of new Set(ids.output)) {
    if (!(await authorizeEntry(viewer, id, verb))) continue;
    const outcome = await run(id);
    if (outcome.note && !notes.includes(outcome.note)) notes.push(outcome.note);
    if (outcome.ok) done += 1;
  }
  return { ok: true, done, skipped: ids.output.length - done, notes };
}

export async function trashEntries(ids: unknown): Promise<ListActionResult> {
  return forEach(ids, "trash", async (id) => trashEntry(db, id));
}

export async function restoreEntries(ids: unknown): Promise<ListActionResult> {
  return forEach(ids, "trash", async (id) => {
    const result = await restoreEntry(db, id);
    if (!result.ok) return { ok: false };
    return result.asDraft
      ? { ok: true, note: `Its address was taken, so it came back as a draft at ${result.path}.` }
      : { ok: true };
  });
}

export async function deleteEntries(ids: unknown): Promise<ListActionResult> {
  return forEach(ids, "delete", async (id) => {
    const result = await deleteEntry(db, id);
    if (result.ok) return { ok: true };
    return result.error === "has-children"
      ? { ok: false, note: "A page with pages under it stays until they're moved or deleted." }
      : { ok: false };
  });
}
