import {
  db,
  getEntryForEdit,
  listParentOptions,
  listTermOptions,
  listUserOptions,
} from "@sitebuilder/db";
import { type EntryKind, Uuid } from "@sitebuilder/schema";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import * as v from "valibot";
import { can } from "@/auth/can";
import { requireViewer } from "@/auth/session";
import {
  type EditorState,
  toEditorEntry,
  toEditorValues,
} from "@/components/entry-editor/editor-state";
import { type EditorOptions, EntryEditor } from "@/components/entry-editor/entry-editor";
import { authorizeEntry } from "@/server/entries";

const EMPTY: EditorState["values"] = {
  title: "",
  slug: "",
  excerpt: "",
  seoTitle: "",
  seoDescription: "",
  parentId: "",
  authorId: "",
  categoryIds: [],
  tagIds: [],
};

// The editor's page: loads the entry and the options, and works out what the viewer may do. A
// screen the viewer can't use is a 404, whichever reason it is (decisions #25).
export async function EditorScreen({
  type,
  id,
  created,
}: {
  type: EntryKind;
  id: string | null;
  created: boolean;
}) {
  const viewer = await requireViewer();

  let initial: Pick<EditorState, "values" | "entry">;
  let ownerId = viewer.id;
  if (id) {
    if (!v.is(Uuid, id)) notFound();
    const owner = await authorizeEntry(viewer, id, "update");
    if (!owner || owner.type !== type) notFound();
    const entry = await getEntryForEdit(db, id);
    if (!entry) notFound();
    // A trashed entry is restored from the list before it can be edited.
    if (entry.deletedAt) redirect(`/admin/${type}s?view=trash` as Route);
    initial = { values: toEditorValues(entry), entry: toEditorEntry(entry) };
    ownerId = owner.authorId;
  } else {
    if (!can(viewer, `${type}.create`)) notFound();
    initial = { values: { ...EMPTY, authorId: viewer.id }, entry: null };
  }

  const owned = { type, ownerId } as const;
  const terms = type === "post" && can(viewer, "term.assign") ? await listTermOptions(db) : null;
  const parents = type === "page" ? await listParentOptions(db, id) : null;
  // The current parent is listed even when it's in the trash, so saving keeps it.
  if (
    parents &&
    initial.values.parentId &&
    !parents.some((p) => p.id === initial.values.parentId)
  ) {
    const parent = await getEntryForEdit(db, initial.values.parentId);
    if (parent)
      parents.unshift({
        id: parent.id,
        title: `${parent.title} (in the trash)`,
        path: parent.path,
      });
  }
  const options: EditorOptions = {
    parents,
    authors: type === "post" && can(viewer, "post.update") ? await listUserOptions(db) : null,
    categories: terms ? terms.filter((t) => t.taxonomy === "category") : null,
    tags: terms ? terms.filter((t) => t.taxonomy === "tag") : null,
  };

  return (
    <EntryEditor
      // A fresh copy from the server (after restoring a revision) starts the editor again.
      key={initial.entry?.updatedAt ?? "new"}
      type={type}
      initial={initial}
      options={options}
      allowed={{
        publish: can(viewer, `${type}.publish`, owned),
        trash: can(viewer, `${type}.trash`, owned),
        createTerms: can(viewer, "term.create"),
      }}
      created={created}
    />
  );
}
