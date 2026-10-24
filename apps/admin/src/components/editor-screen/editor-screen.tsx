// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { can, canSome } from "@sitebuilder/auth";
import { collectEntryIds, collectMediaIds } from "@sitebuilder/blocks";
import {
  db,
  getEntryForEdit,
  getEntryLinks,
  getSettings,
  listLatestPosts,
  listParentOptions,
  listTermOptions,
  listUserOptions,
} from "@sitebuilder/db";
import { type BlockList, DEFAULT_TEMPLATE, type EntryKind, Uuid } from "@sitebuilder/schema";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import * as v from "valibot";
import { requireViewer } from "@/auth/session";
import type { EditorData } from "@/components/block-editor/editor-data";
import {
  type EditorState,
  toEditorEntry,
  toEditorValues,
} from "@/components/entry-editor/editor-state";
import { type EditorOptions, EntryEditor } from "@/components/entry-editor/entry-editor";
import { env } from "@/env";
import { authorizeEntry } from "@/server/entries";
import { renderMedia } from "@/server/media";
import "@/lib/template-blocks";

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
  featuredMediaId: "",
  background: "",
};

// The editor's page: loads the entry, its blocks and what they point at, and the options, and
// works out what the viewer may do. A screen the viewer can't use is a 404, whichever reason it
// is (decisions #25).
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
  let content: BlockList = [];
  let ownerId = viewer.id;
  if (id) {
    if (!v.is(Uuid, id)) notFound();
    // Who may edit it and the entry itself, read together: the entry is only used once the
    // check has passed.
    const [owner, entry] = await Promise.all([
      authorizeEntry(viewer, id, "update"),
      getEntryForEdit(db, id),
    ]);
    if (!owner || owner.type !== type || !entry) notFound();
    // A trashed entry is restored from the list before it can be edited.
    if (entry.deletedAt) redirect(`/admin/${type}s?view=trash` as Route);
    initial = { values: toEditorValues(entry), entry: toEditorEntry(entry) };
    content = entry.content;
    ownerId = owner.authorId;
  } else {
    if (!can(viewer, `${type}.create`)) notFound();
    initial = { values: { ...EMPTY, authorId: viewer.id }, entry: null };
  }

  // Everything else the editor needs depends only on the entry, so it's read in one round.
  const owned = { type, ownerId } as const;
  const mediaIds = collectMediaIds(content);
  if (initial.values.featuredMediaId) mediaIds.push(initial.values.featuredMediaId);
  const [allTerms, parents, authors, links, posts, media, template, theme, ai] = await Promise.all([
    listTermOptions(db),
    type === "page" ? listParentOptions(db, id) : null,
    type === "post" && can(viewer, "post.update") ? listUserOptions(db) : null,
    getEntryLinks(db, collectEntryIds(content)),
    listLatestPosts(db),
    renderMedia(mediaIds),
    getSettings(db, "template"),
    getSettings(db, "theme"),
    getSettings(db, "ai"),
  ]);
  const terms = type === "post" && can(viewer, "term.assign") ? allTerms : null;
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
    authors,
    categories: terms ? terms.filter((t) => t.taxonomy === "category") : null,
    tags: terms ? terms.filter((t) => t.taxonomy === "tag") : null,
  };

  // What the blocks point at, so the canvas draws them as the site will.
  const data: EditorData = {
    media,
    links: Object.fromEntries(
      [...links.values()].map((link) => [
        link.id,
        { id: link.id, title: link.title, path: link.path, type: link.type, public: link.public },
      ]),
    ),
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      path: post.path,
      excerpt: post.excerpt,
      publishedAt: post.publishedAt.toISOString(),
      termIds: post.termIds,
    })),
    terms: allTerms,
    upload: { allowed: can(viewer, "media.upload"), maxBytes: env().MEDIA_MAX_BYTES },
    userId: viewer.id,
    templateSlug: (template ?? DEFAULT_TEMPLATE).slug,
  };

  return (
    // No key: the editor stays mounted when a new draft gets its id, and takes up a newer copy
    // from the server itself (after a restored revision).
    <EntryEditor
      type={type}
      initial={initial}
      content={content}
      data={data}
      options={options}
      allowed={{
        publish: can(viewer, `${type}.publish`, owned),
        trash: can(viewer, `${type}.trash`, owned),
        createTerms: can(viewer, "term.create"),
        siteBackground: can(viewer, "theme.update"),
      }}
      assistant={{
        // B8: help needs the assistant set up, and help on this entry: any entry, or the
        // viewer's own.
        available:
          ai !== undefined &&
          (can(viewer, "ai.assist") || (canSome(viewer, "ai.assist") && ownerId === viewer.id)),
        images: ai?.supportsImages ?? false,
      }}
      siteBackground={theme?.pageBackground ?? ""}
      created={created}
    />
  );
}
