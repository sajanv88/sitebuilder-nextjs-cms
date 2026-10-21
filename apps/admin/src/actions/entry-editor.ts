// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { can } from "@sitebuilder/auth";
import { validateContent } from "@sitebuilder/blocks/server";
import {
  autosaveEntry,
  createEntry,
  createTerm,
  db,
  type EntryForEdit,
  type EntryWriteError,
  getEntryForEdit,
  getUserSummary,
  listRevisions,
  restoreRevision,
  searchEntryLinks,
  setEntryStatus,
  updateEntry,
} from "@sitebuilder/db";
import {
  type BlockList,
  type ContentIssue,
  ENTRY_TYPES,
  EntryFields,
  type EntryKind,
  PublishAt,
  SaveIntent,
  TermInput,
  UpdatedAt,
  Uuid,
} from "@sitebuilder/schema";
import type { Route } from "next";
import { redirect } from "next/navigation";
import * as v from "valibot";
import { getViewer, type Viewer } from "@/auth/session";
import { issueTarget } from "@/components/block-editor/editor-model";
import {
  type BlockIssue,
  type EditorField,
  type EditorState,
  type EditorValues,
  toEditorEntry,
  toEditorValues,
} from "@/components/entry-editor/editor-state";
import { authorizeEntry } from "@/server/entries";
import { invalidate } from "@/server/invalidate";

// The editor's actions. Each one: who's asking → valibot → can() against the entry → query.

const WRITE_ERRORS: Record<EntryWriteError, { field?: EditorField; message: string }> = {
  "not-found": { message: "This entry no longer exists." },
  conflict: {
    message:
      "Someone else saved this since you opened it. Reload to see their changes; yours weren't saved.",
  },
  "in-trash": { message: "This entry is in the trash. Restore it before editing." },
  "reserved-slug": {
    field: "slug",
    message: "That address belongs to another part of the site. Choose another slug.",
  },
  "invalid-parent": {
    field: "parentId",
    message: "Choose a parent page that isn't this page or one under it.",
  },
  "path-taken": { field: "slug", message: "Another entry took that address just now. Try again." },
  "invalid-media": {
    field: "featuredMediaId",
    message: "That image was deleted from the media library. Choose another.",
  },
};

// The blocks as sent: JSON in a hidden field. Anything that doesn't parse is left for
// validateContent to refuse, never a crash.
function readContent(form: FormData): unknown {
  const raw = form.get("content");
  if (typeof raw !== "string" || raw.length > 2_000_000) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// validateBlockList's issues, pinned to the blocks they're about.
function blockIssues(input: unknown, issues: readonly ContentIssue[]): BlockIssue[] {
  const blocks = Array.isArray(input) ? (input as BlockList) : [];
  return issues.map((issue) => {
    const target = issueTarget(blocks, issue.path);
    return { blockId: target?.blockId ?? "", field: target?.field, message: issue.message };
  });
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.slice(0, 2000) : "";
}

function list(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .slice(0, 100);
}

function typedValues(form: FormData): EditorValues {
  return {
    title: text(form, "title"),
    slug: text(form, "slug"),
    excerpt: text(form, "excerpt"),
    seoTitle: text(form, "seoTitle"),
    seoDescription: text(form, "seoDescription"),
    parentId: text(form, "parentId"),
    authorId: text(form, "authorId"),
    categoryIds: list(form, "categoryIds"),
    tagIds: list(form, "tagIds"),
    featuredMediaId: text(form, "featuredMediaId"),
  };
}

const Kind = v.picklist(ENTRY_TYPES);
const FeaturedMedia = v.union([v.literal(""), Uuid]);
const SaveMeta = v.object({
  id: v.union([v.literal(""), Uuid]),
  type: Kind,
  intent: SaveIntent,
  updatedAt: v.union([v.literal(""), UpdatedAt]),
  publishAt: PublishAt,
});

// Save, and publish or unpublish in the same step when asked. A new entry is created as a draft
// (and published if asked), then the editor moves to its address.
export async function saveEntry(prev: EditorState, form: FormData): Promise<EditorState> {
  const values = typedValues(form);
  const fail = (
    result: EditorState["result"],
    message: string,
    errors?: EditorState["errors"],
  ): EditorState => ({ ...prev, result, message, values, ...(errors ? { errors } : {}) });

  const viewer = await getViewer();
  if (!viewer)
    return fail("failed", "Your session has ended. Sign in again in another tab, then save.");

  const meta = v.safeParse(SaveMeta, {
    id: form.get("id"),
    type: form.get("type"),
    intent: form.get("intent"),
    updatedAt: form.get("updatedAt"),
    publishAt: form.get("publishAt") ?? "",
  });
  if (!meta.success) return fail("failed", "The form was incomplete. Reload the page.");
  const { id, type, intent, publishAt } = meta.output;

  const fields = v.safeParse(EntryFields, {
    ...values,
    authorId: values.authorId || undefined,
  });
  if (!fields.success) {
    const nested = v.flatten<typeof EntryFields>(fields.issues).nested ?? {};
    const errors: Partial<Record<EditorField, string>> = {};
    for (const [key, messages] of Object.entries(nested)) {
      const field = key.split(".")[0] as EditorField;
      if (messages?.[0] && !errors[field]) errors[field] = messages[0];
    }
    return fail("invalid", "Check the fields marked below.", errors);
  }

  const featured = v.safeParse(FeaturedMedia, values.featuredMediaId);
  if (!featured.success) {
    return fail("invalid", "Check the fields marked below.", {
      featuredMediaId: "Choose an image from the media library.",
    });
  }
  const sent = readContent(form);
  const content = validateContent(sent);
  if (!content.ok) {
    return {
      ...fail("invalid", "Some blocks need attention. Nothing was saved."),
      blockIssues: blockIssues(sent, content.issues),
    };
  }

  // Who may do what, against the entry itself. A new entry will be the viewer's own.
  const owner = id
    ? await authorizeEntry(viewer, id, "update")
    : can(viewer, `${type}.create`)
      ? { type, authorId: viewer.id }
      : undefined;
  if (!owner || owner.type !== type) return fail("failed", "You can't edit this entry.");
  if (intent !== "save" && !can(viewer, `${type}.publish`, { type, ownerId: owner.authorId })) {
    return fail("failed", "You can't publish this entry.");
  }

  const authorId = await allowedAuthor(viewer, type, owner.authorId, fields.output.authorId);
  if (authorId === "invalid") {
    return fail("invalid", "Check the fields marked below.", {
      authorId: "Choose a user from the list.",
    });
  }
  // Without term.assign the links stay as they are: the form's lists are ignored.
  const existing = id ? await getEntryForEdit(db, id) : undefined;
  const assign = can(viewer, "term.assign");
  const write = {
    ...fields.output,
    content: content.value,
    featuredMediaId: featured.output || null,
    categoryIds: assign ? fields.output.categoryIds : (existing?.categoryIds ?? []),
    tagIds: assign ? fields.output.tagIds : (existing?.tagIds ?? []),
  };

  let saved: { id: string; updatedAt: Date };
  if (id) {
    if (!meta.output.updatedAt) return fail("failed", "The form was incomplete. Reload the page.");
    const result = await updateEntry(db, {
      ...write,
      id,
      expectedUpdatedAt: meta.output.updatedAt,
      authorId: authorId === "keep" ? null : authorId,
      actorId: viewer.id,
    });
    if (!result.ok) return writeFailure(fail, result.error);
    saved = result;
  } else {
    const result = await createEntry(db, {
      ...write,
      type,
      authorId: authorId === "keep" ? viewer.id : authorId,
      actorId: viewer.id,
    });
    if (!result.ok) return writeFailure(fail, result.error);
    saved = result;
  }
  invalidate("saveEntry", { entryIds: [saved.id] });

  if (intent !== "save") {
    const status = await setEntryStatus(db, {
      id: saved.id,
      change: intent === "publish" ? { kind: "publish", at: publishAt } : { kind: "unpublish" },
      expectedUpdatedAt: null,
      actorId: viewer.id,
      // The save just wrote this content's revision.
      writeRevision: false,
    });
    if (!status.ok) return writeFailure(fail, status.error);
    invalidate("saveEntry", { entryIds: [saved.id] });
  }

  if (!id) redirect(`/admin/${type}s/${saved.id}?created=1` as Route);

  const fresh = await getEntryForEdit(db, saved.id);
  if (!fresh) return fail("failed", WRITE_ERRORS["not-found"].message);
  return {
    result: "saved",
    message: savedMessage(intent, fresh.status),
    values: toEditorValues(fresh),
    entry: toEditorEntry(fresh),
    content: fresh.content,
    savedAt: Date.now(),
  };
}

// ── Autosave ─────────────────────────────────────────────────────────────────────────────────

export type AutosaveResult =
  | { ok: true; id: string; path: string; updatedAt: string }
  | {
      ok: false;
      reason: "invalid" | "conflict" | "not-draft" | "failed";
      error: string;
      blockIssues?: BlockIssue[];
    };

const AutosaveInput = v.object({
  id: v.union([v.literal(""), Uuid]),
  type: Kind,
  updatedAt: v.union([v.literal(""), UpdatedAt]),
  title: EntryFields.entries.title,
});

// The editor's autosave (design §8, decisions #56): a draft's title and blocks, with the same
// conflict check as a save and no revision. A new entry is created as a draft by its first
// autosave, once it has a title. Published and scheduled entries aren't autosaved.
export async function autosaveDraft(input: unknown): Promise<AutosaveResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, reason: "failed", error: "Your session has ended." };
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const meta = v.safeParse(AutosaveInput, raw);
  if (!meta.success) return { ok: false, reason: "invalid", error: "Give it a title first." };
  const { id, type, updatedAt, title } = meta.output;

  const content = validateContent(raw.content);
  if (!content.ok) {
    return {
      ok: false,
      reason: "invalid",
      error: "Some blocks need attention.",
      blockIssues: blockIssues(raw.content, content.issues),
    };
  }

  if (!id) {
    if (!can(viewer, `${type}.create`))
      return { ok: false, reason: "failed", error: "Not allowed." };
    const created = await createEntry(db, {
      title,
      content: content.value,
      featuredMediaId: null,
      slug: "",
      excerpt: null,
      seoTitle: null,
      seoDescription: null,
      parentId: null,
      categoryIds: [],
      tagIds: [],
      type,
      authorId: viewer.id,
      actorId: viewer.id,
      writeRevision: false,
    });
    if (!created.ok) {
      return { ok: false, reason: "failed", error: WRITE_ERRORS[created.error].message };
    }
    return {
      ok: true,
      id: created.id,
      path: created.path,
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  const owner = await authorizeEntry(viewer, id, "update");
  if (!owner || owner.type !== type) return { ok: false, reason: "failed", error: "Not allowed." };
  if (!updatedAt) return { ok: false, reason: "failed", error: "The form was incomplete." };
  const saved = await autosaveEntry(db, {
    id,
    expectedUpdatedAt: updatedAt,
    title,
    content: content.value,
  });
  if (saved.ok) {
    const entry = await getEntryForEdit(db, id);
    return { ok: true, id, path: entry?.path ?? "", updatedAt: saved.updatedAt.toISOString() };
  }
  if (saved.error === "conflict") {
    return { ok: false, reason: "conflict", error: WRITE_ERRORS.conflict.message };
  }
  if (saved.error === "not-draft") {
    return {
      ok: false,
      reason: "not-draft",
      error: "Published entries change only when you save.",
    };
  }
  return { ok: false, reason: "failed", error: WRITE_ERRORS[saved.error].message };
}

// ── Links ────────────────────────────────────────────────────────────────────────────────────

export interface LinkOption {
  id: string;
  title: string;
  path: string;
  type: "page" | "post";
  public: boolean;
}

// Entries a block can link to, for the link field. Public ones, and others the viewer may read:
// an author sees the titles of their own drafts, not other people's.
export async function searchLinkTargets(q: unknown): Promise<LinkOption[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const search = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const rows = await searchEntryLinks(db, search, 30);
  return rows
    .filter(
      (row) =>
        row.public || can(viewer, `${row.type}.read`, { type: row.type, ownerId: row.authorId }),
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      path: row.path,
      type: row.type,
      public: row.public,
    }));
}

function writeFailure(
  fail: (r: EditorState["result"], m: string, e?: EditorState["errors"]) => EditorState,
  error: EntryWriteError,
): EditorState {
  const known = WRITE_ERRORS[error];
  if (error === "conflict") return fail("conflict", known.message);
  return known.field
    ? fail("invalid", "Check the fields marked below.", { [known.field]: known.message })
    : fail("failed", known.message);
}

function savedMessage(intent: SaveIntent, status: EntryForEdit["status"]): string {
  if (intent === "unpublish") return "Unpublished. It's a draft again.";
  if (intent === "publish") return status === "scheduled" ? "Scheduled." : "Published.";
  return "Saved.";
}

// The author a save may set: only someone allowed `update` on any post (not just their own) may
// change it (§6.1). "keep" leaves it alone.
async function allowedAuthor(
  viewer: Viewer,
  type: EntryKind,
  current: string,
  requested: string | undefined,
): Promise<string | "keep" | "invalid"> {
  if (type !== "post" || !requested || requested === current) return "keep";
  if (!can(viewer, "post.update")) return "keep";
  return (await getUserSummary(db, requested)) ? requested : "invalid";
}

// ── History ──────────────────────────────────────────────────────────────────────────────────

export type RevisionItem = { id: string; title: string; createdAt: string; author: string };

export async function loadRevisions(
  entryId: unknown,
): Promise<{ ok: true; items: RevisionItem[] } | { ok: false; error: string }> {
  const viewer = await getViewer();
  const id = v.safeParse(Uuid, entryId);
  if (!viewer || !id.success || !(await authorizeEntry(viewer, id.output, "update"))) {
    return { ok: false, error: "The history couldn't be loaded." };
  }
  const rows = await listRevisions(db, id.output);
  return {
    ok: true,
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      author: row.author.name,
    })),
  };
}

const RestoreInput = v.object({ entryId: Uuid, revisionId: Uuid, updatedAt: UpdatedAt });

export async function restoreEntryRevision(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getViewer();
  const parsed = v.safeParse(RestoreInput, input);
  if (!viewer || !parsed.success)
    return { ok: false, error: "That revision couldn't be restored." };
  const { entryId, revisionId, updatedAt } = parsed.output;
  if (!(await authorizeEntry(viewer, entryId, "update"))) {
    return { ok: false, error: "That revision couldn't be restored." };
  }
  const result = await restoreRevision(db, {
    entryId,
    revisionId,
    expectedUpdatedAt: updatedAt,
    actorId: viewer.id,
  });
  if (result.ok) {
    invalidate("restoreEntryRevision", { entryIds: [entryId] });
    return { ok: true };
  }
  return {
    ok: false,
    error:
      result.error === "conflict"
        ? "The entry changed since you opened it. Reload, then restore."
        : "That revision couldn't be restored.",
  };
}

// ── Terms from the editor ────────────────────────────────────────────────────────────────────

// A new tag or category typed into the picker. Needs term.create (§6.1: authors may only assign).
export async function createTermFromEditor(
  input: unknown,
): Promise<{ ok: true; term: { id: string; name: string } } | { ok: false; error: string }> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "term.create")) return { ok: false, error: "You can't add terms." };
  const parsed = v.safeParse(
    v.object({ taxonomy: v.picklist(["category", "tag"]), name: TermInput.entries.name }),
    input,
  );
  if (!parsed.success) return { ok: false, error: "Enter a name of up to 80 characters." };
  const result = await createTerm(db, { ...parsed.output, slug: "" });
  if (!result.ok) return { ok: false, error: "That term couldn't be added." };
  invalidate("createTermFromEditor");
  return { ok: true, term: { id: result.term.id, name: result.term.name } };
}
